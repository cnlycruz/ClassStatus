import { describe, expect, it } from "vitest";
import { deriveCollectorHealth } from "@/collector/health";
import { OPERATIONAL_COLLECTOR_SOURCES } from "@/data/sources";
import type { CollectorLog } from "@/types";

function log(sourceId: string, timestamp: string, level: CollectorLog["level"], message: string): CollectorLog { return { id: `${sourceId}-${timestamp}`, runId: "run-1", sourceId, sourceName: sourceId, timestamp, level, message }; }
const now = new Date("2026-09-05T00:03:00.000Z");

describe("collector health", () => {
  it("is healthy only when every enabled Tier 3 source has a recent successful attempt", () => {
    const logs = OPERATIONAL_COLLECTOR_SOURCES.map((source) => log(source.id, "2026-09-05T00:02:00.000Z", "success", "Discovery healthy: 0 candidate(s), 0 article(s) fetched."));
    expect(deriveCollectorHealth(OPERATIONAL_COLLECTOR_SOURCES, logs, { lastSuccessfulCheckAt: "2026-09-05T00:02:00.000Z" }, now).overall).toBe("healthy");
  });
  it("keeps a prior success but marks a failed latest attempt as error and overall partial failure", () => {
    const [rappler, gma] = OPERATIONAL_COLLECTOR_SOURCES;
    const health = deriveCollectorHealth(OPERATIONAL_COLLECTOR_SOURCES, [log(rappler.id, "2026-09-05T00:02:00.000Z", "success", "Discovery healthy: 0 candidate(s), 0 article(s) fetched."), log(gma.id, "2026-09-05T00:01:00.000Z", "success", "Discovery healthy: 0 candidate(s), 0 article(s) fetched."), log(gma.id, "2026-09-05T00:02:00.000Z", "error", "Live source failed: https://secret.example/token")], { lastSuccessfulCheckAt: "2026-09-05T00:01:00.000Z" }, now);
    expect(health.overall).toBe("partial-failure");
    expect(health.sources.find((source) => source.id === gma.id)).toMatchObject({ state: "error", lastSuccessAt: "2026-09-05T00:01:00.000Z" });
    expect(JSON.stringify(health)).not.toContain("secret.example");
  });
  it("keeps never-run sources unknown and excludes disabled sources", () => {
    expect(deriveCollectorHealth(OPERATIONAL_COLLECTOR_SOURCES, [], { lastSuccessfulCheckAt: null }, now).overall).toBe("unknown");
    expect(deriveCollectorHealth([{ ...OPERATIONAL_COLLECTOR_SOURCES[0], enabled: false }], [], { lastSuccessfulCheckAt: null }, now).sources).toEqual([]);
    const singleSuccess = [log(OPERATIONAL_COLLECTOR_SOURCES[0].id, "2026-09-05T00:02:00.000Z", "success", "Discovery healthy: 0 candidate(s), 0 article(s) fetched.")];
    expect(deriveCollectorHealth(OPERATIONAL_COLLECTOR_SOURCES, singleSuccess, { lastSuccessfulCheckAt: null }, now).overall).toBe("unknown");
  });
  it("uses the shared cadence to mark an otherwise successful source delayed", () => {
    const logs = OPERATIONAL_COLLECTOR_SOURCES.map((source) => log(source.id, "2026-09-05T00:00:00.000Z", "success", "Discovery reachable with no recent candidates."));
    expect(deriveCollectorHealth(OPERATIONAL_COLLECTOR_SOURCES, logs, { lastSuccessfulCheckAt: "2026-09-05T00:00:00.000Z" }, now).overall).toBe("delayed");
  });
  it("keeps the latest attempted sweep distinct from the last complete sweep and uses its actual counters", () => {
    const [rappler, gma] = OPERATIONAL_COLLECTOR_SOURCES;
    const logs = [
      log(rappler.id, "2026-09-05T00:02:00.000Z", "success", "Discovery healthy: 2 candidate(s), 4 article(s) fetched."),
      log(gma.id, "2026-09-05T00:02:01.000Z", "error", "Live source failed: timeout"),
      log("engine", "2026-09-05T00:02:02.000Z", "success", "Sweep complete: 1 published, 2 held, 3 rejected."),
    ];
    const health = deriveCollectorHealth(OPERATIONAL_COLLECTOR_SOURCES, logs, { lastSuccessfulCheckAt: "2026-09-05T00:00:00.000Z" }, now);
    expect(health).toMatchObject({ overall: "partial-failure", latestAttemptAt: "2026-09-05T00:02:01.000Z", lastCompleteSweepAt: "2026-09-05T00:00:00.000Z", latestRun: { published: 1, held: 2, rejected: 3, sourcesSucceeded: 1, sourcesAttempted: 2 } });
  });
});
