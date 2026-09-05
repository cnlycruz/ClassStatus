import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as getLgus } from "@/app/api/lgus/route";
import { CollectorEngine } from "@/collector/engine";
import { getCollectorFreshness, recordSuccessfulCollectorCheck } from "@/collector/storage";
import type { CollectorSourceConfig } from "@/types";
import type { RawAnnouncementItem, SourceCollectorAdapter, SourceDiscoveryResult } from "@/collector/sources/types";
import { DELAYED_AFTER_MS, EXPECTED_COLLECTOR_INTERVAL_MS, formatFreshness, getFreshnessState, OUTDATED_AFTER_MS } from "@/lib/freshness";

const originalEnvironment = {
  dataDirectory: process.env.CLASSSTATUS_DATA_DIR,
  storageDriver: process.env.CLASSSTATUS_STORAGE_DRIVER,
  vercel: process.env.VERCEL,
  vercelEnvironment: process.env.VERCEL_ENV,
};

let testDirectory: string;

const source: CollectorSourceConfig = {
  id: "gma-news-walang-pasok",
  name: "GMA Integrated News #WalangPasok Feed",
  organization: "GMA Network",
  url: "https://gma.example/feed",
  type: "news-reputable",
  reliabilityTier: 3,
  operationalState: "operational",
  enabled: true,
  checkIntervalMinutes: 1,
  totalCollected: 0,
  consecutiveFailures: 0,
};

const article: RawAnnouncementItem = {
  title: "Walang Pasok: September 5 class suspensions",
  rawText: "Manila - Classes are suspended in all levels, public and private, on September 5, 2026 due to heavy rainfall.",
  sourceUrl: "https://gma.example/article",
  canonicalUrl: "https://gma.example/article",
  sourceName: source.name,
  organization: source.organization,
  reliabilityTier: 3,
  sourceType: "news-reputable",
  publishedAt: "2026-09-04T21:30:00.000Z",
  evidenceFingerprint: "a".repeat(64),
};

class FixedAdapter implements SourceCollectorAdapter {
  constructor(private readonly result: SourceDiscoveryResult) {}
  async fetchAnnouncements(): Promise<SourceDiscoveryResult> { return this.result; }
}

function restoreEnvironment() {
  for (const [name, value] of [
    ["CLASSSTATUS_DATA_DIR", originalEnvironment.dataDirectory],
    ["CLASSSTATUS_STORAGE_DRIVER", originalEnvironment.storageDriver],
    ["VERCEL", originalEnvironment.vercel],
    ["VERCEL_ENV", originalEnvironment.vercelEnvironment],
  ] as const) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

describe("public collector freshness", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-05T00:03:00.000Z"));
    testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "classstatus-freshness-"));
    process.env.CLASSSTATUS_DATA_DIR = testDirectory;
    process.env.CLASSSTATUS_STORAGE_DRIVER = "local-json";
    delete process.env.VERCEL;
    delete process.env.VERCEL_ENV;
  });

  afterEach(() => {
    vi.useRealTimers();
    restoreEnvironment();
    fs.rmSync(testDirectory, { recursive: true, force: true });
  });

  it("exposes the successful full-sweep completion, never an article or effective date", async () => {
    const completedAt = "2026-09-05T00:03:00.000Z";
    const engine = new CollectorEngine({
      sources: [source],
      mediaAdapter: new FixedAdapter({ health: "healthy", items: [article], candidateCount: 1 }),
      now: () => new Date(completedAt),
    });

    await expect(engine.runSweep()).resolves.toMatchObject({ sourcesSucceeded: 1, sourcesFailed: 0 });
    const response = await getLgus();
    const body = await response.json();
    const manila = body.lgus.find((lgu: { id: string }) => lgu.id === "manila");

    expect(body.freshness).toEqual({ lastSuccessfulCheckAt: completedAt });
    expect(manila.primaryRecord.source.publishedAt).toBe(article.publishedAt);
    expect(manila.primaryRecord.effectiveDate).toBe("2026-09-05");
    expect(body.freshness.lastSuccessfulCheckAt).not.toBe(article.publishedAt);
    expect(body.freshness.lastSuccessfulCheckAt).not.toBe(manila.primaryRecord.effectiveDate);
  });

  it("does not replace a successful check after a failed source attempt", async () => {
    const lastSuccess = "2026-09-05T00:03:00.000Z";
    await recordSuccessfulCollectorCheck(lastSuccess);
    const failed = new CollectorEngine({
      sources: [source],
      mediaAdapter: { fetchAnnouncements: async () => { throw new Error("unreachable"); } },
      now: () => new Date("2026-09-05T00:09:00.000Z"),
    });

    await expect(failed.runSweep()).resolves.toMatchObject({ sourcesSucceeded: 0, sourcesFailed: 1 });
    await expect(getCollectorFreshness()).resolves.toEqual({ lastSuccessfulCheckAt: lastSuccess });
  });

  it("shows a legitimate freshness timestamp even when a successful sweep finds no verified suspension", async () => {
    const completedAt = "2026-09-05T00:10:00.000Z";
    const engine = new CollectorEngine({
      sources: [source],
      mediaAdapter: new FixedAdapter({ health: "reachable_no_candidates", items: [], candidateCount: 0 }),
      now: () => new Date(completedAt),
    });

    await engine.runSweep();
    const body = await (await getLgus()).json();
    expect(body.lgus).toHaveLength(17);
    expect(body.lgus.every((lgu: { status: string }) => lgu.status === "awaiting-information")).toBe(true);
    expect(body.freshness).toEqual({ lastSuccessfulCheckAt: completedAt });
  });

  it("formats relative time and exact Manila time truthfully", () => {
    const now = new Date("2026-09-05T15:45:10.000Z"); // 11:45 PM in Manila
    expect(formatFreshness("2026-09-05T15:42:00.000Z", now)).toMatchObject({
      text: "Last complete check 3 minutes ago",
      exactTime: "September 5, 2026 at 11:42 PM PHT",
    });
    expect(formatFreshness("2026-09-05T15:45:00.000Z", now)?.text).toBe("Last complete check less than a minute ago");
    expect(formatFreshness("2026-09-05T14:42:00.000Z", now)?.text).toBe("Last complete check today at 10:42 PM");
    expect(formatFreshness(null, now)).toBeNull();
    expect(formatFreshness("not-a-timestamp", now)).toBeNull();
    expect(EXPECTED_COLLECTOR_INTERVAL_MS).toBe(60_000);
    expect(getFreshnessState(DELAYED_AFTER_MS)).toBe("fresh");
    expect(getFreshnessState(DELAYED_AFTER_MS + 1)).toBe("delayed");
    expect(getFreshnessState(OUTDATED_AFTER_MS + 1)).toBe("outdated");
  });

  it("keeps the public response limited to the single safe timestamp", async () => {
    await recordSuccessfulCollectorCheck("2026-09-05T00:03:00.000Z");
    const body = await (await getLgus()).json();
    expect(body.lgus).toHaveLength(17);
    expect(body.freshness).toEqual({ lastSuccessfulCheckAt: "2026-09-05T00:03:00.000Z" });
    expect(JSON.stringify(body)).not.toMatch(/runId|sourceHealth|lastErrorMessage|collectorProvenance|parserOutcome/);
  });
});
