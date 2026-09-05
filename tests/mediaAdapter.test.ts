import fs from "fs";
import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { COLLECTOR_SOURCES } from "../src/data/sources";
import {
  MEDIA_SOURCE_PROFILES,
  MediaCollectorAdapter,
  parseGmaRssDiscovery,
  parseInquirerTagDiscovery,
  parseRapplerTopicDiscovery,
} from "../src/collector/sources/mediaAdapter";
import { CollectorSourceConfig } from "../src/types";

const { lookupMock } = vi.hoisted(() => ({ lookupMock: vi.fn() }));

vi.mock("node:dns/promises", () => ({ lookup: lookupMock }));

const fixtures = path.resolve(process.cwd(), "tests", "fixtures");
const read = (name: string) => fs.readFileSync(path.join(fixtures, name), "utf-8");
const now = new Date("2026-08-23T08:00:00+08:00");
const gmaDiscoveryUrl = "https://data.gmanetwork.com/gno/rss/serbisyopubliko/walangpasok/feed.xml";
const emptyGmaFeed = "<?xml version=\"1.0\"?><rss><channel><title>GMA News</title></channel></rss>";

beforeEach(() => {
  lookupMock.mockReset();
  lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
});

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

function gmaResult(fetchImpl: typeof fetch, url = gmaDiscoveryUrl) {
  return new MediaCollectorAdapter(fetchImpl, () => now).fetchAnnouncements(source("gma-news-walang-pasok", url));
}

function xmlResponse(body = emptyGmaFeed, headers: Record<string, string> = {}): Response {
  return new Response(body, { status: 200, headers: { "content-type": "application/xml", ...headers } });
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

describe("safe media fetching", () => {
  it("cancels discarded redirect response bodies before completing discovery", async () => {
    const cancel = vi.fn();
    const fetchMock = vi.fn(async () => fetchMock.mock.calls.length === 1
      ? new Response(new ReadableStream({ cancel }), { status: 302, headers: { location: "/feed.xml" } })
      : xmlResponse());
    await expect(gmaResult(fetchMock as unknown as typeof fetch)).resolves.toMatchObject({ health: "reachable_no_candidates" });
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("cancels discarded error response bodies before returning failure", async () => {
    const cancel = vi.fn();
    const fetchMock = vi.fn(async () => new Response(new ReadableStream({ cancel }), { status: 503 }));
    await expect(gmaResult(fetchMock as unknown as typeof fetch)).resolves.toMatchObject({ health: "failed" });
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("fetches an approved HTTPS source with manual redirect handling", async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      expect(init?.redirect).toBe("manual");
      return xmlResponse();
    }) as unknown as typeof fetch;

    await expect(gmaResult(fetchMock)).resolves.toMatchObject({ health: "reachable_no_candidates" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a direct disallowed hostname before fetching", async () => {
    const fetchMock = vi.fn() as unknown as typeof fetch;
    await expect(gmaResult(fetchMock, "https://attacker.example/feed.xml")).resolves.toMatchObject({ health: "failed" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["an absolute approved redirect", "https://www.gmanetwork.com/feeds/walang-pasok.xml"],
    ["a relative approved redirect", "/feeds/walang-pasok.xml"],
  ])("follows %s", async (_label, location) => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
      fetchMock.mock.calls.length === 1
        ? new Response(null, { status: 302, headers: { location } })
        : xmlResponse()
    );

    await expect(gmaResult(fetchMock as unknown as typeof fetch)).resolves.toMatchObject({ health: "reachable_no_candidates" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not forward sensitive headers across an approved redirect", async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
      fetchMock.mock.calls.length === 1
        ? new Response(null, { status: 302, headers: { location: "/feeds/walang-pasok.xml" } })
        : xmlResponse()
    );

    await gmaResult(fetchMock as unknown as typeof fetch);
    const redirectedHeaders = new Headers(fetchMock.mock.calls[1]?.[1]?.headers);
    expect(redirectedHeaders.has("authorization")).toBe(false);
    expect(redirectedHeaders.has("cookie")).toBe(false);
    expect(redirectedHeaders.has("proxy-authorization")).toBe(false);
  });

  it.each([
    ["HTTP", "http://www.gmanetwork.com/feed.xml"],
    ["localhost", "https://localhost/feed.xml"],
    ["IPv4 loopback", "https://127.0.0.1/feed.xml"],
    ["private IPv4", "https://10.0.0.8/feed.xml"],
    ["IPv6 loopback", "https://[::1]/feed.xml"],
    ["link-local", "https://169.254.1.1/feed.xml"],
    ["metadata address", "https://169.254.169.254/latest/meta-data/"],
    ["decimal IPv4", "https://2130706433/feed.xml"],
    ["octal IPv4", "https://0177.0.0.1/feed.xml"],
    ["embedded credentials", "https://user:password@www.gmanetwork.com/feed.xml"],
    ["hostname suffix trick", "https://gmanetwork.com.attacker.example/feed.xml"],
  ])("rejects a redirect to %s", async (_label, location) => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 302, headers: { location } })) as unknown as typeof fetch;
    await expect(gmaResult(fetchMock)).resolves.toMatchObject({ health: "failed" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["private IPv4", [{ address: "192.168.1.20", family: 4 }]],
    ["IPv4 loopback", [{ address: "127.0.0.1", family: 4 }]],
    ["IPv6 unique-local", [{ address: "fd00::1", family: 6 }]],
    ["IPv6 link-local", [{ address: "fe80::1", family: 6 }]],
    ["mixed public and private answers", [{ address: "93.184.216.34", family: 4 }, { address: "10.0.0.1", family: 4 }]],
  ])("rejects an approved hostname resolving to %s", async (_label, addresses) => {
    lookupMock.mockResolvedValueOnce(addresses);
    const fetchMock = vi.fn() as unknown as typeof fetch;
    await expect(gmaResult(fetchMock)).resolves.toMatchObject({ health: "failed" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a malformed redirect destination", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 302, headers: { location: "https://[" } })) as unknown as typeof fetch;
    await expect(gmaResult(fetchMock)).resolves.toMatchObject({ health: "failed" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a redirect without a Location header", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 302 })) as unknown as typeof fetch;
    await expect(gmaResult(fetchMock)).resolves.toMatchObject({ health: "failed" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects more than five redirects", async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
      new Response(null, { status: 302, headers: { location: `/hop-${fetchMock.mock.calls.length}` } })
    );
    await expect(gmaResult(fetchMock as unknown as typeof fetch)).resolves.toMatchObject({ health: "failed" });
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it("rejects a declared response body larger than two MiB", async () => {
    const fetchMock = vi.fn(async () => xmlResponse("small", { "content-length": String(2 * 1024 * 1024 + 1) })) as unknown as typeof fetch;
    await expect(gmaResult(fetchMock)).resolves.toMatchObject({ health: "failed" });
  });

  it("cancels and aborts a streamed response body larger than two MiB", async () => {
    let cancelled = false;
    let requestSignal: AbortSignal | null | undefined;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(2 * 1024 * 1024 + 1));
      },
      cancel() {
        cancelled = true;
      },
    });
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      requestSignal = init?.signal;
      return new Response(body, { status: 200, headers: { "content-type": "application/xml" } });
    }) as unknown as typeof fetch;

    await expect(gmaResult(fetchMock)).resolves.toMatchObject({ health: "failed" });
    expect(cancelled).toBe(true);
    expect(requestSignal?.aborted).toBe(true);
  });
});
