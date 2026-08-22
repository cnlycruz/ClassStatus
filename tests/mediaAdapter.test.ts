import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { COLLECTOR_SOURCES } from "../src/data/sources";
import {
  MEDIA_SOURCE_PROFILES,
  MediaCollectorAdapter,
  parseGmaRssDiscovery,
  parseInquirerTagDiscovery,
  parseRapplerTopicDiscovery,
} from "../src/collector/sources/mediaAdapter";
import { CollectorSourceConfig } from "../src/types";

const fixtures = path.resolve(process.cwd(), "tests", "fixtures");
const read = (name: string) => fs.readFileSync(path.join(fixtures, name), "utf-8");
const now = new Date("2026-08-23T08:00:00+08:00");

function source(id: string, url: string): CollectorSourceConfig {
  return {
    id,
    name: id,
    organization: id,
    url,
    type: "news-reputable",
    reliabilityTier: 3,
    operationalState: "operational",
    enabled: true,
    checkIntervalMinutes: 10,
    totalCollected: 0,
    consecutiveFailures: 0,
  };
}

describe("media discovery profiles", () => {
  it("uses only the approved primary discovery URLs", () => {
    const urls = Object.fromEntries(
      COLLECTOR_SOURCES.filter((item) => item.reliabilityTier === 3).map((item) => [item.id, item.url])
    );
    expect(urls).toEqual({
      "rappler-walang-pasok": "https://www.rappler.com/topic/class-suspensions/",
      "gma-news-walang-pasok": "https://data.gmanetwork.com/gno/rss/serbisyopubliko/walangpasok/feed.xml",
    });
  });

  it("parses GMA strictly as RSS/XML with discovery metadata", () => {
    const result = parseGmaRssDiscovery(
      read("gma-feed.xml"),
      "https://data.gmanetwork.com/gno/rss/serbisyopubliko/walangpasok/feed.xml",
      MEDIA_SOURCE_PROFILES["gma-news-walang-pasok"],
      now
    );
    expect(result.error).toBeUndefined();
    expect(result.candidates[0]).toMatchObject({
      title: expect.stringMatching(/class suspensions/i),
      url: expect.stringContaining("gmanetwork.com/news/serbisyopubliko/walangpasok"),
      publishedAt: expect.any(String),
      summary: expect.stringContaining("local government units"),
    });
  });

  it("parses recent Rappler topic cards and visible timestamps", () => {
    const result = parseRapplerTopicDiscovery(
      read("rappler-listing.html"),
      "https://www.rappler.com/topic/class-suspensions/",
      MEDIA_SOURCE_PROFILES["rappler-walang-pasok"],
      now
    );
    expect(result.error).toBeUndefined();
    expect(result.candidates[0]).toMatchObject({
      url: "https://www.rappler.com/philippines/class-suspensions-walang-pasok-august-23-2026/",
      publishedAt: "2026-08-22T12:00:00.000Z",
    });
  });

  it("parses recent Inquirer tag-page article cards", () => {
    const result = parseInquirerTagDiscovery(
      read("inquirer-listing.html"),
      "https://newsinfo.inquirer.net/tag/walang-pasok",
      MEDIA_SOURCE_PROFILES["inquirer-suspensions"],
      now
    );
    expect(result.error).toBeUndefined();
    expect(result.candidates).toHaveLength(1);
  });

  it("uses GMA feed entries only to discover and then fetches the article", async () => {
    const discoveryUrl = "https://data.gmanetwork.com/gno/rss/serbisyopubliko/walangpasok/feed.xml";
    const mockFetch = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url === discoveryUrl) {
        return new Response(read("gma-feed.xml"), {
          status: 200,
          headers: { "content-type": "application/xml" },
        });
      }
      return new Response(read("gma-article.html"), {
        status: 200,
        headers: { "content-type": "text/html; charset=UTF-8" },
      });
    }) as typeof fetch;
    const result = await new MediaCollectorAdapter(mockFetch, () => now).fetchAnnouncements(
      source("gma-news-walang-pasok", discoveryUrl)
    );
    expect(result.health).toBe("healthy");
    expect(result.candidateCount).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].discoverySummary).toContain("local government units");
    expect(result.items[0].rawText).toContain("Quezon City");
  });

  it("marks persistent Inquirer 403 access as blocked without fallback", async () => {
    const blockedFetch = (async () =>
      new Response("<html><title>Just a moment...</title></html>", {
        status: 403,
        headers: { "content-type": "text/html" },
      })) as typeof fetch;
    const result = await new MediaCollectorAdapter(blockedFetch, () => now).fetchAnnouncements(
      source("inquirer-suspensions", "https://newsinfo.inquirer.net/tag/walang-pasok")
    );
    expect(result).toMatchObject({ health: "blocked", items: [], candidateCount: 0 });
  });

  it("does not call malformed HTTP 200 data healthy", async () => {
    const malformedFetch = (async () =>
      new Response("<html><body>not rss</body></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      })) as typeof fetch;
    const result = await new MediaCollectorAdapter(malformedFetch, () => now).fetchAnnouncements(
      source(
        "gma-news-walang-pasok",
        "https://data.gmanetwork.com/gno/rss/serbisyopubliko/walangpasok/feed.xml"
      )
    );
    expect(result.health).toBe("failed");
  });

  it("reports reachable_no_candidates for a valid but stale feed", async () => {
    const validFetch = (async () =>
      new Response(read("gma-feed.xml"), {
        status: 200,
        headers: { "content-type": "application/xml" },
      })) as typeof fetch;
    const result = await new MediaCollectorAdapter(
      validFetch,
      () => new Date("2026-09-01T08:00:00+08:00")
    ).fetchAnnouncements(
      source(
        "gma-news-walang-pasok",
        "https://data.gmanetwork.com/gno/rss/serbisyopubliko/walangpasok/feed.xml"
      )
    );
    expect(result).toMatchObject({ health: "reachable_no_candidates", candidateCount: 0, items: [] });
  });
});
