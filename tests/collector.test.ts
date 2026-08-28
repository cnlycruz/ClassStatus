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
import { COLLECTOR_PARSER_OUTCOME_V2 } from "../src/lib/suspensions/noticeModel";
import { getAdminStateFileVersion, localStateStore } from "../src/lib/storage/localJson";

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
    parserOutcome: COLLECTOR_PARSER_OUTCOME_V2,
  };
}

function storedLegacyRecord(
  id: string,
  overrides: Partial<SuspensionRecord> = {}
): SuspensionRecord {
  return {
    ...collectedRecord("gma-news-walang-pasok", "GMA Network", "a".repeat(64)),
    id,
    eventKey: id.padEnd(64, "0").slice(0, 64).replace(/[^0-9a-f]/g, "a"),
    parserOutcome: "accepted:tier3-explicit-lgu-suspension",
    publicationProvenance: {
      type: "automatic-collector",
      publicLabel: "Published from approved Tier 3 media evidence",
    },
    administrativeState: "active",
    revision: 1,
    ...overrides,
  };
}

function installStoredRecords(records: SuspensionRecord[]): void {
  localStateStore.mutateState((state) => {
    state.records = records;
  });
}

describe("Tier 3 collector policy and persistence", () => {
  beforeEach(async () => {
    resetStorageCacheForTests();
    await clearLiveSuspensions();
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
      expect(await getSuspensions()).toHaveLength(1);
      expect((await getSuspensions())[0].source.url).toBe("https://gma.example/article");
      expect((await getSuspensions())[0].source.evidenceExcerpt).toContain("Manila");

      const response = await getLgus();
      const body = await response.json();
      expect(body.lgus.find((lgu: { id: string }) => lgu.id === "manila").status).toBe("classes-suspended");
    } finally {
      vi.useRealTimers();
    }
  });

  it("promotes matching independent evidence to high confidence", async () => {
    const first = await upsertCollectedSuspensionRecord(collectedRecord("gma-news-walang-pasok", "GMA Network", "a".repeat(64)));
    const second = await upsertCollectedSuspensionRecord(collectedRecord("rappler-walang-pasok", "Rappler Philippines", "b".repeat(64)));
    expect(first.action).toBe("created");
    expect(second.action).toBe("merged");
    expect(second.record.confidence).toBe("high");
    expect(second.record.source.verified).toBe(true);
    expect(second.record.additionalSources).toHaveLength(1);
  });

  it("treats an identical compatible corroborator rescan as unchanged despite outlet prose differences", async () => {
    await upsertCollectedSuspensionRecord(
      collectedRecord("rappler-walang-pasok", "Rappler Philippines", "a".repeat(64))
    );
    const corroborator = collectedRecord("gma-news-walang-pasok", "GMA Network", "b".repeat(64));
    const merged = await upsertCollectedSuspensionRecord(corroborator);
    const fileVersion = getAdminStateFileVersion();
    const repeated = {
      ...corroborator,
      reason: "GMA weather desk wording",
      announcementSummary: "GMA describes the same authoritative suspension with different prose.",
      collectorProvenance: { ...corroborator.collectorProvenance!, runId: "repeat-corroborator" },
    };

    const result = await upsertCollectedSuspensionRecord(repeated);

    expect(merged.action).toBe("merged");
    expect(result.action).toBe("unchanged");
    expect(result.record.revision).toBe(merged.record.revision);
    expect(result.record.additionalSources).toHaveLength(1);
    expect(getAdminStateFileVersion()).toBe(fileVersion);
  });

  it("preserves the same-primary-source v2 reinterpretation conflict", async () => {
    const primary = collectedRecord("gma-news-walang-pasok", "GMA Network", "c".repeat(64));
    const created = await upsertCollectedSuspensionRecord(primary);
    const fileVersion = getAdminStateFileVersion();
    const reinterpreted = {
      ...primary,
      reason: "Changed interpretation under the same evidence",
      announcementSummary: "The same primary evidence was parsed into different v2 prose.",
    };

    const result = await upsertCollectedSuspensionRecord(reinterpreted);

    expect(result).toMatchObject({ action: "held", reason: "collector-policy-version-conflict" });
    expect(result.record.revision).toBe(created.record.revision);
    expect(getAdminStateFileVersion()).toBe(fileVersion);
  });

  it("holds contradictory evidence out of live storage", async () => {
    await upsertCollectedSuspensionRecord(collectedRecord("gma-news-walang-pasok", "GMA Network", "a".repeat(64)));
    const conflicting = {
      ...collectedRecord("rappler-walang-pasok", "Rappler Philippines", "b".repeat(64)),
      status: "partial-suspension" as const,
      affectedLevels: ["elementary" as const],
      schoolSector: "public" as const,
    };
    const result = await upsertCollectedSuspensionRecord(conflicting);
    expect(result.action).toBe("held");
    expect(await getSuspensions()).toHaveLength(1);
  });

  it("makes exact rescans true no-ops without revision or file timestamp churn", async () => {
    const record = collectedRecord("gma-news-walang-pasok", "GMA Network", "a".repeat(64));
    const first = await upsertCollectedSuspensionRecord(record);
    const fileVersion = getAdminStateFileVersion();
    const second = await upsertCollectedSuspensionRecord({ ...record, collectorProvenance: { ...record.collectorProvenance!, runId: "later-run" } });
    expect(first.action).toBe("created");
    expect(second.action).toBe("unchanged");
    expect(second.record.revision).toBe(first.record.revision);
    expect(getAdminStateFileVersion()).toBe(fileVersion);
    expect(await getSuspensions()).toHaveLength(1);
  });

  it("refines one logical notice when the same outlet expands its scope", async () => {
    const firstRecord = {
      ...collectedRecord("gma-news-walang-pasok", "GMA Network", "a".repeat(64)),
      lguId: "quezon-city" as const,
      status: "partial-suspension" as const,
      affectedLevels: ["preschool", "elementary", "junior-high", "senior-high"] as SuspensionRecord["affectedLevels"],
    };
    const first = await upsertCollectedSuspensionRecord(firstRecord);
    const refined = {
      ...collectedRecord("gma-news-walang-pasok", "GMA Network", "b".repeat(64)),
      lguId: "quezon-city" as const,
      source: {
        ...collectedRecord("gma-news-walang-pasok", "GMA Network", "b".repeat(64)).source,
        updatedAt: "2026-08-22T22:00:00+08:00",
      },
    };
    const second = await upsertCollectedSuspensionRecord(refined);
    expect(first.action).toBe("created");
    expect(second.action).toBe("updated");
    expect(second.record.id).toBe(first.record.id);
    expect(second.record).toMatchObject({ status: "classes-suspended", affectedLevels: ["all-levels"] });
    expect((await getSuspensions()).filter((record) => record.lguId === "quezon-city")).toHaveLength(1);
  });

  it("holds without mutation when one exact and one overlapping legacy candidate are plausible", async () => {
    const candidate = collectedRecord("gma-news-walang-pasok", "GMA Network", "b".repeat(64));
    const exact = storedLegacyRecord("exact-legacy", {
      status: "partial-suspension",
      affectedLevels: ["preschool"],
    });
    const overlap = storedLegacyRecord("overlap-legacy", {
      isAllDay: false,
      startTime: "06:00",
      endTime: "11:00",
      status: "partial-suspension",
      affectedLevels: ["preschool"],
    });
    installStoredRecords([exact, overlap]);
    const before = localStateStore.readState().records;
    const fileVersion = getAdminStateFileVersion();

    const result = await upsertCollectedSuspensionRecord(candidate);

    expect(result).toMatchObject({ action: "held", reason: "legacy-duplicates-require-cleanup" });
    expect(localStateStore.readState().records).toEqual(before);
    expect(getAdminStateFileVersion()).toBe(fileVersion);
  });

  it("holds without mutation when two overlapping legacy candidates and no exact match are plausible", async () => {
    const candidate = {
      ...collectedRecord("gma-news-walang-pasok", "GMA Network", "c".repeat(64)),
      isAllDay: false,
      startTime: "08:00",
      endTime: "17:00",
      status: "partial-suspension" as const,
    };
    const early = storedLegacyRecord("early-legacy", {
      isAllDay: false,
      startTime: "06:00",
      endTime: "10:00",
      status: "partial-suspension",
    });
    const late = storedLegacyRecord("late-legacy", {
      isAllDay: false,
      startTime: "09:00",
      endTime: "18:00",
      status: "partial-suspension",
    });
    installStoredRecords([early, late]);
    const before = localStateStore.readState().records;
    const fileVersion = getAdminStateFileVersion();

    const result = await upsertCollectedSuspensionRecord(candidate);

    expect(result).toMatchObject({ action: "held", reason: "legacy-duplicates-require-cleanup" });
    expect(localStateStore.readState().records).toEqual(before);
    expect(getAdminStateFileVersion()).toBe(fileVersion);
  });

  it("allows one exact legacy candidate to refine normally", async () => {
    const exact = storedLegacyRecord("one-exact", {
      status: "partial-suspension",
      affectedLevels: ["preschool", "elementary", "junior-high", "senior-high"],
    });
    installStoredRecords([exact]);

    const result = await upsertCollectedSuspensionRecord(
      collectedRecord("gma-news-walang-pasok", "GMA Network", "a".repeat(64))
    );

    expect(result).toMatchObject({
      action: "updated",
      record: {
        id: exact.id,
        status: "classes-suspended",
        affectedLevels: ["all-levels"],
        parserOutcome: COLLECTOR_PARSER_OUTCOME_V2,
      },
    });
    expect(localStateStore.readState().records).toHaveLength(1);
  });

  it("allows one compatible overlapping legacy candidate to refine normally", async () => {
    const overlap = storedLegacyRecord("one-overlap", {
      isAllDay: false,
      startTime: "06:00",
      endTime: "11:00",
      status: "partial-suspension",
      affectedLevels: ["preschool"],
    });
    installStoredRecords([overlap]);

    const result = await upsertCollectedSuspensionRecord(
      collectedRecord("gma-news-walang-pasok", "GMA Network", "a".repeat(64))
    );

    expect(result).toMatchObject({
      action: "updated",
      record: { id: overlap.id, status: "classes-suspended", isAllDay: true },
    });
    expect(localStateStore.readState().records).toHaveLength(1);
  });

  it("counts one record matching both exact and overlap predicates only once", async () => {
    const candidate = collectedRecord("gma-news-walang-pasok", "GMA Network", "a".repeat(64));
    const exactAndOverlapping = storedLegacyRecord("exact-and-overlap");
    installStoredRecords([exactAndOverlapping]);

    const result = await upsertCollectedSuspensionRecord(candidate);

    expect(result.action).toBe("unchanged");
    expect(result.reason).toBeUndefined();
    expect(result.record.parserOutcome).toBe("accepted:tier3-explicit-lgu-suspension");
    expect(localStateStore.readState().records).toHaveLength(1);
  });

  it("marks a same-scope v2 update as parser v2 even when legacy semantics remain preferred", async () => {
    const legacy = storedLegacyRecord("legacy-same-scope-update");
    installStoredRecords([legacy]);
    const candidate = collectedRecord("gma-news-walang-pasok", "GMA Network", "d".repeat(64));
    candidate.source = {
      ...candidate.source,
      updatedAt: "2026-08-22T22:00:00+08:00",
    };

    const result = await upsertCollectedSuspensionRecord(candidate);

    expect(result).toMatchObject({
      action: "updated",
      record: { id: legacy.id, parserOutcome: COLLECTOR_PARSER_OUTCOME_V2 },
    });
  });

  it("marks a v2 corroboration merge as parser v2 when the preferred record was legacy", async () => {
    const legacy = storedLegacyRecord("legacy-corroboration-merge");
    installStoredRecords([legacy]);

    const result = await upsertCollectedSuspensionRecord(
      collectedRecord("rappler-walang-pasok", "Rappler Philippines", "e".repeat(64))
    );

    expect(result).toMatchObject({
      action: "merged",
      record: { id: legacy.id, parserOutcome: COLLECTOR_PARSER_OUTCOME_V2 },
    });
  });

  it("replaces stale same-outlet evidence instead of exposing it as corroboration", async () => {
    const firstRecord = collectedRecord("gma-news-walang-pasok", "GMA Network", "a".repeat(64));
    await upsertCollectedSuspensionRecord(firstRecord);
    const secondRecord = collectedRecord("gma-news-walang-pasok", "GMA Network", "b".repeat(64));
    secondRecord.source = { ...secondRecord.source, url: "https://gma-news-walang-pasok.example/revised", updatedAt: "2026-08-22T22:00:00+08:00" };
    const result = await upsertCollectedSuspensionRecord(secondRecord);
    expect(result.action).toBe("updated");
    expect(result.record.source.url).toContain("revised");
    expect(result.record.additionalSources).toEqual([]);
  });

  it("keeps genuinely non-overlapping windows as separate notices", async () => {
    const morning = { ...collectedRecord("gma-news-walang-pasok", "GMA Network", "a".repeat(64)), isAllDay: false, startTime: "06:00", endTime: "11:00", status: "partial-suspension" as const };
    const afternoon = { ...collectedRecord("gma-news-walang-pasok", "GMA Network", "b".repeat(64)), id: "record-afternoon", isAllDay: false, startTime: "13:00", endTime: "18:00", status: "partial-suspension" as const };
    expect((await upsertCollectedSuspensionRecord(morning)).action).toBe("created");
    expect((await upsertCollectedSuspensionRecord(afternoon)).action).toBe("created");
    expect(await getSuspensions()).toHaveLength(2);
  });

  it("holds a collector notice that overlaps an active legacy-key manual publication", async () => {
    const manual = {
      ...collectedRecord("gma-news-walang-pasok", "GMA Network", "a".repeat(64)),
      id: "manual-precedence",
      eventKey: "f".repeat(64),
      parserOutcome: undefined,
      collectorProvenance: undefined,
      confidence: "admin-verified" as const,
      publicationProvenance: { type: "manual-admin" as const, publicLabel: "Manually verified by ClassStatus Admin" as const },
      manualEvidence: { providerPreset: "lgu-official-announcement", providerName: "City of Manila", proofUrl: "https://manila.example/manual" },
    };
    localStateStore.mutateState((state) => state.records.unshift(manual));
    try {
      const result = await upsertCollectedSuspensionRecord(collectedRecord("gma-news-walang-pasok", "GMA Network", "b".repeat(64)));
      expect(result).toMatchObject({ action: "held", reason: "duplicates-manual:manual-precedence" });
    } finally {
      localStateStore.mutateState((state) => { state.records = state.records.filter((record) => record.id !== manual.id); });
    }
  });

  it("rejects Tier 1 and records without collector provenance", async () => {
    const invalid = collectedRecord("gma-news-walang-pasok", "GMA Network", "a".repeat(64));
    invalid.source.reliabilityTier = 1;
    await expect(upsertCollectedSuspensionRecord(invalid)).rejects.toThrow(/operational Tier 3/);

    const inactive = collectedRecord("inquirer-suspensions", "Philippine Daily Inquirer", "b".repeat(64));
    await expect(upsertCollectedSuspensionRecord(inactive)).rejects.toThrow(/operational Tier 3/);

    const legacyParser = collectedRecord("gma-news-walang-pasok", "GMA Network", "c".repeat(64));
    legacyParser.parserOutcome = "accepted:tier3-explicit-lgu-suspension";
    await expect(upsertCollectedSuspensionRecord(legacyParser)).rejects.toThrow(/parser-policy v2/);
  });
});
