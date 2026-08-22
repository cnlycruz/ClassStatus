import { beforeEach, describe, expect, it, vi } from "vitest";
import { CollectorEngine } from "../src/collector/engine";
import {
  clearLiveSuspensions,
  getSuspensions,
  resetStorageCacheForTests,
  upsertCollectedSuspensionRecord,
} from "../src/collector/storage";
import { CollectorSourceConfig, SuspensionRecord } from "../src/types";
import { RawAnnouncementItem, SourceCollectorAdapter, SourceDiscoveryResult } from "../src/collector/sources/types";
import { GET as getLgus } from "../src/app/api/lgus/route";

const tier3Source = (id = "gma-news-walang-pasok", organization = "GMA Network"): CollectorSourceConfig => ({
  id,
  name: `${organization} Class Suspension Desk`,
  organization,
  url: `https://${id}.example/list`,
  type: "news-reputable",
  reliabilityTier: 3,
  operationalState: "operational",
  enabled: true,
  checkIntervalMinutes: 10,
  totalCollected: 0,
  consecutiveFailures: 0,
});

const rawItem = (): RawAnnouncementItem => ({
  title: "Walang Pasok: Class suspensions for August 23, 2026",
  rawText: "Manila - Classes are suspended in all levels, public and private, on August 23, 2026 due to heavy rainfall.",
  sourceUrl: "https://gma.example/article",
  canonicalUrl: "https://gma.example/article",
  sourceName: "GMA Class Suspension Desk",
  organization: "GMA Network",
  reliabilityTier: 3,
  sourceType: "news-reputable",
  publishedAt: "2026-08-22T21:00:00+08:00",
  evidenceFingerprint: "a".repeat(64),
});

class FakeAdapter implements SourceCollectorAdapter {
  calls = 0;
  constructor(private readonly items: RawAnnouncementItem[] = [rawItem()]) {}
  async fetchAnnouncements(): Promise<SourceDiscoveryResult> {
    this.calls++;
    return { health: this.items.length > 0 ? "healthy" : "reachable_no_candidates", items: this.items, candidateCount: this.items.length };
  }
}

function collectedRecord(sourceId: string, organization: string, fingerprint: string): SuspensionRecord {
  return {
    id: `record-${sourceId}`,
    lguId: "manila",
    status: "classes-suspended",
    affectedLevels: ["all-levels"],
    schoolSector: "all",
    effectiveDate: "2026-08-23",
    isAllDay: true,
    reason: "Heavy rainfall",
    announcementSummary: "Classes are suspended in Manila.",
    source: {
      id: sourceId,
      name: organization,
      organization,
      url: `https://${sourceId}.example/article`,
      type: "news-reputable",
      reliabilityTier: 3,
      verified: false,
      publishedAt: "2026-08-22T21:00:00+08:00",
      evidenceExcerpt: "Manila - classes suspended in all levels, public and private.",
      evidenceFingerprint: fingerprint,
    },
    confidence: "medium",
    discoveredAt: "2026-08-22T21:05:00+08:00",
    publishedAt: "2026-08-22T21:00:00+08:00",
    lifecycleState: "active",
    isActive: true,
    isUpcoming: false,
    isExpired: false,
    collectorProvenance: {
      pipeline: "tier3-media",
      runId: "test-run",
      collectedAt: "2026-08-22T21:05:00+08:00",
    },
  };
}

describe("Tier 3 collector policy and persistence", () => {
  beforeEach(() => {
    resetStorageCacheForTests();
    clearLiveSuspensions();
  });

  it("hard-disables Tier 1 even when a caller tries to enable it", async () => {
    const adapter = new FakeAdapter();
    const tier1: CollectorSourceConfig = {
      ...tier3Source("deped-ncr", "DepEd"),
      type: "deped",
      reliabilityTier: 1,
      operationalState: "under-development",
      enabled: true,
    };
    const engine = new CollectorEngine({ sources: [tier1], mediaAdapter: adapter, now: () => new Date("2026-08-23T08:00:00+08:00") });
    expect(engine.toggleSource("deped-ncr", true)).toBe(false);
    const summary = await engine.runSweep();
    expect(adapter.calls).toBe(0);
    expect(summary).toMatchObject({ sourcesConfigured: 1, sourcesEligible: 0, sourcesSkipped: 1, announcementsPublished: 0 });
  });

  it("does not operate a non-current Tier 3 source", async () => {
    const adapter = new FakeAdapter();
    const inquirer = tier3Source("inquirer-suspensions", "Philippine Daily Inquirer");
    const engine = new CollectorEngine({ sources: [inquirer], mediaAdapter: adapter, now: () => new Date("2026-08-23T08:00:00+08:00") });
    expect(engine.toggleSource(inquirer.id, true)).toBe(false);
    const summary = await engine.runSweep();
    expect(adapter.calls).toBe(0);
    expect(summary).toMatchObject({ sourcesConfigured: 1, sourcesEligible: 0, sourcesSkipped: 1, announcementsPublished: 0 });
  });

  it("runs a real-item pipeline and exposes it through /api/lgus", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-23T08:00:00+08:00"));
    try {
      const adapter = new FakeAdapter();
      const engine = new CollectorEngine({ sources: [tier3Source()], mediaAdapter: adapter, now: () => new Date() });
      const summary = await engine.runSweep();
      expect(summary).toMatchObject({ sourcesEligible: 1, sourcesSucceeded: 1, announcementsPublished: 1, announcementsHeld: 0 });
      expect(summary.logs.every((log) => log.runId === summary.runId)).toBe(true);
      expect(getSuspensions()).toHaveLength(1);
      expect(getSuspensions()[0].source.url).toBe("https://gma.example/article");
      expect(getSuspensions()[0].source.evidenceExcerpt).toContain("Manila");

      const response = await getLgus();
      const body = await response.json();
      expect(body.lgus.find((lgu: { id: string }) => lgu.id === "manila").status).toBe("classes-suspended");
    } finally {
      vi.useRealTimers();
    }
  });

  it("promotes matching independent evidence to high confidence", () => {
    const first = upsertCollectedSuspensionRecord(collectedRecord("gma-news-walang-pasok", "GMA Network", "a".repeat(64)));
    const second = upsertCollectedSuspensionRecord(collectedRecord("rappler-walang-pasok", "Rappler Philippines", "b".repeat(64)));
    expect(first.action).toBe("created");
    expect(second.action).toBe("merged");
    expect(second.record.confidence).toBe("high");
    expect(second.record.source.verified).toBe(true);
    expect(second.record.additionalSources).toHaveLength(1);
  });

  it("holds contradictory evidence out of live storage", () => {
    upsertCollectedSuspensionRecord(collectedRecord("gma-news-walang-pasok", "GMA Network", "a".repeat(64)));
    const conflicting = {
      ...collectedRecord("rappler-walang-pasok", "Rappler Philippines", "b".repeat(64)),
      status: "partial-suspension" as const,
    };
    const result = upsertCollectedSuspensionRecord(conflicting);
    expect(result.action).toBe("held");
    expect(getSuspensions()).toHaveLength(1);
  });

  it("rejects Tier 1 and records without collector provenance", () => {
    const invalid = collectedRecord("gma-news-walang-pasok", "GMA Network", "a".repeat(64));
    invalid.source.reliabilityTier = 1;
    expect(() => upsertCollectedSuspensionRecord(invalid)).toThrow(/operational Tier 3/);

    const inactive = collectedRecord("inquirer-suspensions", "Philippine Daily Inquirer", "b".repeat(64));
    expect(() => upsertCollectedSuspensionRecord(inactive)).toThrow(/operational Tier 3/);
  });
});
