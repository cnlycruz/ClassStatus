import { describe, expect, it } from "vitest";
import { formatCollectorTimestamp, groupCollectorLogs } from "../src/collector/logRuns";
import { CollectorLog } from "../src/types";

function log(
  id: string,
  timestamp: string,
  message: string,
  runId?: string
): CollectorLog {
  return {
    id,
    runId,
    timestamp,
    level: "info",
    sourceId: "engine",
    sourceName: "Collector Engine",
    message,
  };
}

describe("collector log runs", () => {
  it("groups explicit run IDs and infers legacy run boundaries", () => {
    const logs = [
      log("new-start", "2026-08-22T17:10:05.000Z", "Starting Tier 3 collection sweep run-200.", "run-200"),
      log("new-end", "2026-08-22T17:10:07.000Z", "Sweep complete: 0 published, 0 held, 1 rejected.", "run-200"),
      log("old-start", "2026-08-22T16:15:54.000Z", "Starting Tier 3 collection sweep run-100."),
      log("old-poll", "2026-08-22T16:15:55.000Z", "Polling live source: https://example.com/old"),
      log("old-end", "2026-08-22T16:15:56.000Z", "Sweep complete: 0 published, 0 held, 0 rejected."),
    ];

    const runs = groupCollectorLogs(logs);

    expect(runs).toHaveLength(2);
    expect(runs[0]).toMatchObject({
      id: "run-200",
      hasExplicitRunId: true,
      summary: "Sweep complete: 0 published, 0 held, 1 rejected.",
    });
    expect(runs[0].logs).toHaveLength(2);
    expect(runs[1]).toMatchObject({ id: "run-100", hasExplicitRunId: false });
    expect(runs[1].logs).toHaveLength(3);
  });

  it("formats full timestamps in Asia/Manila time", () => {
    const formatted = formatCollectorTimestamp("2026-08-22T17:10:05.000Z");
    expect(formatted).toContain("Aug 23, 2026");
    expect(formatted).toContain("1:10:05 AM");
    expect(formatted).toMatch(/PHT$/);
  });
});
