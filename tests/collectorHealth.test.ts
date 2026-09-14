import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { deriveCollectorHealth } from "@/collector/health";
import { OPERATIONAL_COLLECTOR_SOURCES } from "@/data/sources";
import type { CollectorLog, SourceHealthStatus } from "@/types";

function log(
  sourceId: string,
  timestamp: string,
  level: CollectorLog["level"],
  message: string,
  health?: SourceHealthStatus,
): CollectorLog {
  return {
    id: `${sourceId}-${timestamp}`,
    runId: "run-1",
    sourceId,
    sourceName: sourceId,
    timestamp,
    level,
    message,
    details: health ? { health } : undefined,
  };
}

function sweepComplete(timestamp = "2026-09-05T00:02:01.000Z"): CollectorLog {
  return log("engine", timestamp, "success", "Sweep complete: 0 published, 0 held, 0 rejected.");
}
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

  it("treats reachable_no_candidates as a successful attempted source", () => {
    const source = OPERATIONAL_COLLECTOR_SOURCES[0];
    const timestamp = "2026-09-05T00:02:00.000Z";
    const health = deriveCollectorHealth(
      [source],
      [
        log(source.id, timestamp, "success", "Discovery succeeded with 12 usable entries but no recent relevant candidates", "reachable_no_candidates"),
        sweepComplete(),
      ],
      { lastSuccessfulCheckAt: timestamp },
      now,
    );

    expect(health.sources[0]).toMatchObject({ state: "healthy", lastAttemptAt: timestamp, lastSuccessAt: timestamp });
    expect(health.latestRun).toMatchObject({ sourcesAttempted: 1, sourcesSucceeded: 1 });
  });

  it("reports a healthy and reachable_no_candidates sweep as 2/2 and overall healthy", () => {
    const [rappler, gma] = OPERATIONAL_COLLECTOR_SOURCES;
    const timestamp = "2026-09-05T00:02:00.000Z";
    const health = deriveCollectorHealth(
      OPERATIONAL_COLLECTOR_SOURCES,
      [
        log(rappler.id, timestamp, "success", "Discovery succeeded with 12 usable entries but no recent relevant candidates", "reachable_no_candidates"),
        log(gma.id, timestamp, "success", "Discovery healthy: 1 candidate(s), 8 article(s) fetched.", "healthy"),
        sweepComplete(),
      ],
      { lastSuccessfulCheckAt: timestamp },
      now,
    );

    expect(health.overall).toBe("healthy");
    expect(health.sources).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: rappler.id, state: "healthy" }),
      expect.objectContaining({ id: gma.id, state: "healthy" }),
    ]));
    expect(health.latestRun).toMatchObject({ sourcesAttempted: 2, sourcesSucceeded: 2 });
  });

  it("preserves the previous success when a structured failed observation becomes latest", () => {
    const source = OPERATIONAL_COLLECTOR_SOURCES[0];
    const health = deriveCollectorHealth(
      [source],
      [
        log(source.id, "2026-09-05T00:01:00.000Z", "success", "Discovery healthy.", "healthy"),
        log(source.id, "2026-09-05T00:02:00.000Z", "error", "Request ended.", "failed"),
      ],
      { lastSuccessfulCheckAt: "2026-09-05T00:01:00.000Z" },
      now,
    );

    expect(health.sources[0]).toMatchObject({
      state: "error",
      lastAttemptAt: "2026-09-05T00:02:00.000Z",
      lastSuccessAt: "2026-09-05T00:01:00.000Z",
    });
  });

  it("prefers structured health over contradictory human-readable text", () => {
    const source = OPERATIONAL_COLLECTOR_SOURCES[0];
    const health = deriveCollectorHealth(
      [source],
      [log(source.id, "2026-09-05T00:02:00.000Z", "success", "Discovery healthy.", "failed")],
      { lastSuccessfulCheckAt: null },
      now,
    );

    expect(health.sources[0]).toMatchObject({ state: "error", lastAttemptAt: "2026-09-05T00:02:00.000Z" });
    expect(health.sources[0].lastSuccessAt).toBeUndefined();
  });

  it.each(["blocked", "degraded"] as const)("treats structured %s health as attempted and non-unknown", (status) => {
    const source = OPERATIONAL_COLLECTOR_SOURCES[0];
    const timestamp = "2026-09-05T00:02:00.000Z";
    const health = deriveCollectorHealth(
      [source],
      [log(source.id, timestamp, "error", "Source observation recorded.", status), sweepComplete()],
      { lastSuccessfulCheckAt: null },
      now,
    );

    expect(health.sources[0]).toMatchObject({ state: "error", lastAttemptAt: timestamp });
    expect(health.sources[0].lastSuccessAt).toBeUndefined();
    expect(health.latestRun).toMatchObject({ sourcesAttempted: 1, sourcesSucceeded: 0 });
  });

  it("uses legacy discovery messages when structured health is absent", () => {
    const [rappler, gma] = OPERATIONAL_COLLECTOR_SOURCES;
    const timestamp = "2026-09-05T00:02:00.000Z";
    const health = deriveCollectorHealth(
      OPERATIONAL_COLLECTOR_SOURCES,
      [
        log(rappler.id, timestamp, "success", "Discovery reachable with no recent candidates."),
        log(gma.id, timestamp, "success", "Discovery healthy: 0 candidate(s), 4 article(s) fetched."),
        sweepComplete(),
      ],
      { lastSuccessfulCheckAt: timestamp },
      now,
    );

    expect(health.overall).toBe("healthy");
    expect(health.latestRun).toMatchObject({ sourcesAttempted: 2, sourcesSucceeded: 2 });
  });

  it("recognizes the persisted zero-candidate success message without structured details", () => {
    const source = OPERATIONAL_COLLECTOR_SOURCES[0];
    const timestamp = "2026-09-05T00:02:00.000Z";
    const health = deriveCollectorHealth(
      [source],
      [log(source.id, timestamp, "success", "Discovery succeeded with 12 usable entries but no recent relevant candidates")],
      { lastSuccessfulCheckAt: timestamp },
      now,
    );

    expect(health.sources[0]).toMatchObject({ state: "healthy", lastAttemptAt: timestamp, lastSuccessAt: timestamp });
  });

  it("uses enabled operational Tier 3 sources as the latest-run denominator", () => {
    const source = OPERATIONAL_COLLECTOR_SOURCES[0];
    const health = deriveCollectorHealth(
      OPERATIONAL_COLLECTOR_SOURCES,
      [log(source.id, "2026-09-05T00:02:00.000Z", "success", "Discovery healthy.", "healthy"), sweepComplete()],
      { lastSuccessfulCheckAt: null },
      now,
    );

    expect(health.latestRun).toMatchObject({ sourcesAttempted: 2, sourcesSucceeded: 1 });
  });

  it("drives the overview Source health count from derived persisted-log health", () => {
    const adminConsole = fs.readFileSync(path.join(process.cwd(), "src", "app", "collector", "AdminConsoleClient.tsx"), "utf8");

    expect(adminConsole).toContain('data.health.sources.filter((source) => source.state === "healthy")');
    expect(adminConsole).not.toContain("data.sources.filter((s) => s.healthStatus");
  });
});
