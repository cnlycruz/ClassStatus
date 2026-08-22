import { createHash } from "crypto";
import * as cheerio from "cheerio";
import { CollectorSourceConfig } from "@/types";
import { RawAnnouncementItem, SourceCollectorAdapter, SourceDiscoveryResult } from "./types";

type FetchLike = typeof fetch;

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/rss+xml,application/xml;q=0.9,text/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
};

const DISCOVERY_LOOKBACK_MS = 96 * 60 * 60 * 1000;
const RELEVANT_TEXT = /(walang\s*pasok|class(?:es)?\s+(?:suspension|suspended|cancel)|no\s+(?:face-to-face\s+)?classes)/i;

export interface MediaSourceProfile {
  allowedDomains: string[];
  articleSelectors: string[];
  isCandidateUrl: (url: URL, title: string) => boolean;
}

export interface DiscoveryCandidate {
  title: string;
  url: string;
  publishedAt?: string;
  summary?: string;
}

export interface ParsedDiscovery {
  candidates: DiscoveryCandidate[];
  usableEntryCount: number;
  error?: string;
}

export const MEDIA_SOURCE_PROFILES: Record<string, MediaSourceProfile> = {
  "rappler-walang-pasok": {
    allowedDomains: ["rappler.com"],
    articleSelectors: ["article .post-content", "article .entry-content", ".post-single__content", "article", "main"],
    isCandidateUrl: (url, title) =>
      RELEVANT_TEXT.test(title) || /(walang-pasok|class-suspensions?)/i.test(url.pathname),
  },
  "gma-news-walang-pasok": {
    allowedDomains: ["gmanetwork.com"],
    articleSelectors: ["article", ".story_main", ".article-body", ".story-body", "main"],
    isCandidateUrl: (url, title) =>
      RELEVANT_TEXT.test(title) && /\/news\/serbisyopubliko\/walangpasok\//i.test(url.pathname),
  },
  // Inactive future-development profile. It has no source-registry entry and
  // therefore cannot be selected, polled, or published by the live collector.
  "inquirer-suspensions": {
    allowedDomains: ["inquirer.net"],
    articleSelectors: ["article .article-content", ".article_content", ".entry-content", "article", "main"],
    isCandidateUrl: (_url, title) => RELEVANT_TEXT.test(title),
  },
};

class SourceFetchError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

function normalizedHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

function isAllowedUrl(url: URL, profile: MediaSourceProfile): boolean {
  const host = normalizedHost(url.hostname);
  return profile.allowedDomains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function absoluteUrl(value: string, baseUrl: string): URL | null {
  try {
    const url = new URL(value, baseUrl);
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function htmlFragmentToText(value: string): string {
  const fragment = cheerio.load(value);
  fragment("script,style,figure,figcaption").remove();
  fragment("br").replaceWith("\n");
  fragment("p,li,h2,h3,h4").each((_index, element) => {
    fragment(element).append("\n");
  });
  return normalizeWhitespace(fragment.root().text());
}

function firstString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === "string" && value.trim().length > 0)?.trim();
}

function childTextByNames(entry: ReturnType<cheerio.CheerioAPI>, names: string[]): string | undefined {
  let result: string | undefined;
  entry.children().each((_index, element) => {
    if (result) return;
    if (names.includes((element.name || "").toLowerCase())) result = entry.find(element).text().trim();
  });
  return result;
}

function titleDate(title: string): Date | undefined {
  const match = title.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2}),?\s+(20\d{2})\b/i
  );
  if (!match) return undefined;
  const parsed = new Date(`${match[1]} ${match[2]}, ${match[3]} 00:00:00 GMT+0800`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function isRecent(candidateDate: Date | undefined, now: Date): boolean {
  if (!candidateDate) return false;
  const difference = now.getTime() - candidateDate.getTime();
  return difference >= -48 * 60 * 60 * 1000 && difference <= DISCOVERY_LOOKBACK_MS;
}

function candidateDate(publishedAt: string | undefined, title: string): Date | undefined {
  if (publishedAt && !Number.isNaN(Date.parse(publishedAt))) return new Date(publishedAt);
  return titleDate(title);
}

export function parseGmaRssDiscovery(
  xml: string,
  listingUrl: string,
  profile: MediaSourceProfile,
  now: Date
): ParsedDiscovery {
  const $ = cheerio.load(xml, { xmlMode: true });
  if ($("rss").length !== 1 || $("rss > channel").length !== 1) {
    return { candidates: [], usableEntryCount: 0, error: "Malformed GMA RSS: missing rss/channel root" };
  }

  const items = $("rss > channel > item");
  if (items.length === 0) return { candidates: [], usableEntryCount: 0 };
  const usable: DiscoveryCandidate[] = [];
  items.each((_index, element) => {
    const entry = $(element);
    const title = childTextByNames(entry, ["title"]);
    const linkValue = childTextByNames(entry, ["link"]);
    const publishedValue = childTextByNames(entry, ["pubdate", "dc:date", "published"]);
    const url = linkValue ? absoluteUrl(linkValue, listingUrl) : null;
    if (!title || !url || !isAllowedUrl(url, profile) || !publishedValue || Number.isNaN(Date.parse(publishedValue))) return;
    usable.push({
      title: normalizeWhitespace(title),
      url: url.toString(),
      publishedAt: new Date(publishedValue).toISOString(),
      summary: htmlFragmentToText(childTextByNames(entry, ["description", "summary"]) || "") || undefined,
    });
  });
  if (usable.length === 0) {
    return { candidates: [], usableEntryCount: 0, error: "Malformed GMA RSS: entries lack title, URL, or publication date" };
  }
  return {
    usableEntryCount: usable.length,
    candidates: usable
      .filter((candidate) => {
        const url = new URL(candidate.url);
        return profile.isCandidateUrl(url, candidate.title) && isRecent(candidateDate(candidate.publishedAt, candidate.title), now);
      })
      .slice(0, 8),
  };
}

export function parseRapplerTopicDiscovery(
  html: string,
  listingUrl: string,
  profile: MediaSourceProfile,
  now: Date
): ParsedDiscovery {
  const $ = cheerio.load(html);
  if ($("main").length === 0) return { candidates: [], usableEntryCount: 0, error: "Malformed Rappler topic page: missing main content" };
  const articleNodes = $("main article.archive-article, main article.archive-article__latest-post");
  if (articleNodes.length === 0) {
    return { candidates: [], usableEntryCount: 0, error: "Malformed Rappler topic page: no article entries" };
  }

  const usable: DiscoveryCandidate[] = [];
  articleNodes.each((index, element) => {
    const article = $(element);
    const titleLink = article.find(".archive-article__latest-post--title a, h2 a, h3 a").first();
    const title = normalizeWhitespace(titleLink.text());
    const url = absoluteUrl(titleLink.attr("href") || "", listingUrl);
    if (!title || !url || !isAllowedUrl(url, profile)) return;
    const datetime = article.find("time[datetime]").first().attr("datetime");
    const publishedAt = datetime && !Number.isNaN(Date.parse(datetime)) ? new Date(datetime).toISOString() : undefined;
    const recencyDate = candidateDate(publishedAt, title);
    if (!profile.isCandidateUrl(url, title)) return;
    if (!isRecent(recencyDate, now) && !(index === 0 && !recencyDate)) return;
    usable.push({ title, url: url.toString(), publishedAt });
  });
  if (usable.length === 0) {
    const structurallyUsable = articleNodes.filter((_index, element) =>
      Boolean($(element).find(".archive-article__latest-post--title a, h2 a, h3 a").first().attr("href"))
    ).length;
    if (structurallyUsable === 0) {
      return { candidates: [], usableEntryCount: 0, error: "Malformed Rappler topic page: article entries have no usable links" };
    }
    return { candidates: [], usableEntryCount: structurallyUsable };
  }
  return { candidates: usable.slice(0, 8), usableEntryCount: articleNodes.length };
}

export function parseInquirerTagDiscovery(
  html: string,
  listingUrl: string,
  profile: MediaSourceProfile,
  now: Date
): ParsedDiscovery {
  const $ = cheerio.load(html);
  const articleNodes = $("main article, article, .article-card, .news-card");
  if ($("main").length === 0 || articleNodes.length === 0) {
    return { candidates: [], usableEntryCount: 0, error: "Malformed Inquirer tag page: no article listing" };
  }
  const candidates: DiscoveryCandidate[] = [];
  let usableEntryCount = 0;
  articleNodes.each((index, element) => {
    const article = $(element);
    const titleLink = article.find("h1 a, h2 a, h3 a, a[rel='bookmark']").first();
    const title = normalizeWhitespace(titleLink.text());
    const url = absoluteUrl(titleLink.attr("href") || "", listingUrl);
    if (!title || !url || !isAllowedUrl(url, profile)) return;
    usableEntryCount++;
    const datetime = article.find("time[datetime]").first().attr("datetime");
    const publishedAt = datetime && !Number.isNaN(Date.parse(datetime)) ? new Date(datetime).toISOString() : undefined;
    const recencyDate = candidateDate(publishedAt, title);
    if (!profile.isCandidateUrl(url, title)) return;
    if (!isRecent(recencyDate, now) && !(index < 2 && !recencyDate)) return;
    candidates.push({ title, url: url.toString(), publishedAt });
  });
  if (usableEntryCount === 0) {
    return { candidates: [], usableEntryCount: 0, error: "Malformed Inquirer tag page: entries have no usable titles or links" };
  }
  return { candidates: candidates.slice(0, 8), usableEntryCount };
}

function collectJsonLd(value: unknown, output: Record<string, unknown>[]): void {
  if (Array.isArray(value)) {
    value.forEach((item) => collectJsonLd(item, output));
    return;
  }
  if (!value || typeof value !== "object") return;
  const object = value as Record<string, unknown>;
  output.push(object);
  if (object["@graph"]) collectJsonLd(object["@graph"], output);
}

function jsonLdArticle($: cheerio.CheerioAPI): Record<string, unknown> | undefined {
  const objects: Record<string, unknown>[] = [];
  $('script[type="application/ld+json"]').each((_index, element) => {
    try {
      collectJsonLd(JSON.parse($(element).text()), objects);
    } catch {
      // DOM metadata fallbacks remain available.
    }
  });
  return objects.find((object) => {
    const types = Array.isArray(object["@type"]) ? object["@type"] : [object["@type"]];
    return types.some((type) => typeof type === "string" && /(?:News)?Article/i.test(type));
  });
}

export function extractArticle(
  html: string,
  requestedUrl: string,
  profile: MediaSourceProfile
): Omit<RawAnnouncementItem, "sourceName" | "organization" | "reliabilityTier" | "sourceType"> | null {
  const $ = cheerio.load(html);
  const metadata = jsonLdArticle($);
  const canonicalValue = firstString(
    $('link[rel="canonical"]').attr("href"),
    $('meta[property="og:url"]').attr("content"),
    requestedUrl
  );
  const canonical = canonicalValue ? absoluteUrl(canonicalValue, requestedUrl) : null;
  if (!canonical || !isAllowedUrl(canonical, profile)) return null;
  const title = firstString(metadata?.headline, $('meta[property="og:title"]').attr("content"), $("h1").first().text(), $("title").text());
  const publishedAt = firstString(
    metadata?.datePublished,
    $('meta[property="article:published_time"]').attr("content"),
    $("time[datetime]").first().attr("datetime")
  );
  const updatedAt = firstString(metadata?.dateModified, $('meta[property="article:modified_time"]').attr("content"));
  if (!title || !publishedAt || Number.isNaN(Date.parse(publishedAt))) return null;

  let body = firstString(metadata?.articleBody);
  if (!body) {
    for (const selector of profile.articleSelectors) {
      const container = $(selector).first().clone();
      if (!container.length) continue;
      container.find("script,style,nav,aside,form,button,figure,figcaption,.advertisement,.related").remove();
      container.find("br").replaceWith("\n");
      container.find("p,li,h2,h3,h4").each((_index, element) => {
        $(element).append("\n");
      });
      const candidateBody = normalizeWhitespace(container.text());
      if (candidateBody.length >= 80) {
        body = candidateBody;
        break;
      }
    }
  }
  if (!body || body.length < 80) return null;
  const normalizedBody = /<\/?[a-z][\s\S]*>/i.test(body) ? htmlFragmentToText(body) : normalizeWhitespace(body);
  const canonicalUrl = canonical.toString();
  const normalizedPublishedAt = new Date(publishedAt).toISOString();
  return {
    rawText: normalizedBody,
    sourceUrl: canonicalUrl,
    canonicalUrl,
    title: normalizeWhitespace(title),
    publishedAt: normalizedPublishedAt,
    updatedAt: updatedAt && !Number.isNaN(Date.parse(updatedAt)) ? new Date(updatedAt).toISOString() : undefined,
    evidenceFingerprint: createHash("sha256")
      .update(`${canonicalUrl}\n${normalizedPublishedAt}\n${normalizedBody}`)
      .digest("hex"),
  };
}

async function fetchDocument(
  fetchImpl: FetchLike,
  url: string,
  profile: MediaSourceProfile
): Promise<{ body: string; finalUrl: string; contentType: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetchImpl(url, {
      headers: BROWSER_HEADERS,
      redirect: "follow",
      signal: controller.signal,
    });
    const finalUrl = new URL(response.url || url);
    if (!response.ok) throw new SourceFetchError(`HTTP ${response.status} from ${url}`, response.status);
    if (!isAllowedUrl(finalUrl, profile)) throw new SourceFetchError(`Disallowed redirect to ${finalUrl.hostname}`);
    return {
      body: await response.text(),
      finalUrl: finalUrl.toString(),
      contentType: response.headers.get("content-type") || "",
    };
  } catch (error) {
    if (error instanceof SourceFetchError) throw error;
    throw new SourceFetchError(error instanceof Error ? error.message : String(error));
  } finally {
    clearTimeout(timeout);
  }
}

function failureResult(error: unknown): SourceDiscoveryResult {
  const fetchError = error instanceof SourceFetchError ? error : undefined;
  const blocked = fetchError?.status === 401 || fetchError?.status === 403;
  return {
    health: blocked ? "blocked" : "failed",
    items: [],
    candidateCount: 0,
    message: error instanceof Error ? error.message : String(error),
  };
}

export class MediaCollectorAdapter implements SourceCollectorAdapter {
  constructor(
    private readonly fetchImpl: FetchLike = fetch,
    private readonly now: () => Date = () => new Date()
  ) {}

  async fetchAnnouncements(config: CollectorSourceConfig): Promise<SourceDiscoveryResult> {
    const profile = MEDIA_SOURCE_PROFILES[config.id];
    if (!profile) return { health: "failed", items: [], candidateCount: 0, message: `No source profile for ${config.id}` };

    let discovery: ParsedDiscovery;
    try {
      const response = await fetchDocument(this.fetchImpl, config.url, profile);
      if (config.id === "gma-news-walang-pasok") {
        if (!/(?:application|text)\/(?:rss\+xml|xml)/i.test(response.contentType)) {
          return { health: "failed", items: [], candidateCount: 0, message: `GMA discovery returned non-XML content: ${response.contentType || "unknown"}` };
        }
        discovery = parseGmaRssDiscovery(response.body, response.finalUrl, profile, this.now());
      } else if (config.id === "rappler-walang-pasok") {
        if (!/text\/html|application\/xhtml\+xml/i.test(response.contentType)) {
          return { health: "failed", items: [], candidateCount: 0, message: `Rappler discovery returned non-HTML content: ${response.contentType || "unknown"}` };
        }
        discovery = parseRapplerTopicDiscovery(response.body, response.finalUrl, profile, this.now());
      } else if (config.id === "inquirer-suspensions") {
        if (!/text\/html|application\/xhtml\+xml/i.test(response.contentType)) {
          return { health: "failed", items: [], candidateCount: 0, message: `Inquirer discovery returned non-HTML content: ${response.contentType || "unknown"}` };
        }
        discovery = parseInquirerTagDiscovery(response.body, response.finalUrl, profile, this.now());
      } else {
        return { health: "failed", items: [], candidateCount: 0, message: `Unsupported source ${config.id}` };
      }
    } catch (error) {
      return failureResult(error);
    }

    if (discovery.error) {
      return { health: "failed", items: [], candidateCount: 0, message: discovery.error };
    }
    if (discovery.candidates.length === 0) {
      return {
        health: "reachable_no_candidates",
        items: [],
        candidateCount: 0,
        message: `Discovery succeeded with ${discovery.usableEntryCount} usable entries but no recent relevant candidates`,
      };
    }

    const results = await Promise.all(
      discovery.candidates.map(async (candidate) => {
        try {
          const articleResponse = await fetchDocument(this.fetchImpl, candidate.url, profile);
          if (!/text\/html|application\/xhtml\+xml/i.test(articleResponse.contentType)) {
            return { candidate, article: null, error: new SourceFetchError("Article returned non-HTML content") };
          }
          return { candidate, article: extractArticle(articleResponse.body, articleResponse.finalUrl, profile), error: undefined };
        } catch (error) {
          return { candidate, article: null, error };
        }
      })
    );
    const items = results
      .filter((result): result is typeof result & { article: NonNullable<typeof result.article> } => result.article !== null)
      .map(({ candidate, article }) => ({
        ...article,
        sourceName: config.name,
        organization: config.organization,
        reliabilityTier: config.reliabilityTier,
        sourceType: config.type,
        discoveryPublishedAt: candidate.publishedAt,
        discoverySummary: candidate.summary,
      }));

    if (items.length === 0) {
      const allBlocked = results.every(
        (result) => result.error instanceof SourceFetchError && [401, 403].includes(result.error.status || 0)
      );
      return {
        health: allBlocked ? "blocked" : "failed",
        items: [],
        candidateCount: discovery.candidates.length,
        message: allBlocked
          ? "Discovery worked, but access to all candidate articles was denied"
          : "Discovery found candidates, but no article page produced usable evidence",
      };
    }

    const failedArticles = results.length - items.length;
    return {
      health: "healthy",
      items,
      candidateCount: discovery.candidates.length,
      message: failedArticles > 0 ? `${failedArticles} candidate article(s) could not be parsed` : undefined,
    };
  }
}
