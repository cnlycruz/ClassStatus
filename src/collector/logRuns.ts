import { CollectorLog } from "@/types";

export interface CollectorLogRun {
  id: string;
  logs: CollectorLog[];
  startedAt: string;
  completedAt?: string;
  summary: string;
  hasExplicitRunId: boolean;
}

type MutableCollectorLogRun = Omit<CollectorLogRun, "summary">;

const RUN_START_PATTERN = /Starting Tier 3 collection sweep (run-[^.\s]+)\.?/;
const RUN_COMPLETE_PATTERN = /^Sweep complete:/;

function createRun(id: string, log: CollectorLog, hasExplicitRunId: boolean): MutableCollectorLogRun {
  return {
    id,
    logs: [],
    startedAt: log.timestamp,
    hasExplicitRunId,
  };
}

function appendLog(run: MutableCollectorLogRun, log: CollectorLog): void {
  run.logs.push(log);
  if (RUN_START_PATTERN.test(log.message)) run.startedAt = log.timestamp;
  if (RUN_COMPLETE_PATTERN.test(log.message)) run.completedAt = log.timestamp;
}

export function groupCollectorLogs(logs: CollectorLog[]): CollectorLogRun[] {
  const runs: MutableCollectorLogRun[] = [];
  const explicitRuns = new Map<string, MutableCollectorLogRun>();
  let activeLegacyRun: MutableCollectorLogRun | undefined;

  for (const log of logs) {
    if (log.runId) {
      let run = explicitRuns.get(log.runId);
      if (!run) {
        run = createRun(log.runId, log, true);
        explicitRuns.set(log.runId, run);
        runs.push(run);
      }
      appendLog(run, log);
      activeLegacyRun = undefined;
      continue;
    }

    const startMatch = log.message.match(RUN_START_PATTERN);
    if (startMatch) {
      activeLegacyRun = createRun(startMatch[1], log, false);
      runs.push(activeLegacyRun);
    } else if (!activeLegacyRun) {
      activeLegacyRun = createRun(`legacy-${log.timestamp}-${runs.length}`, log, false);
      runs.push(activeLegacyRun);
    }

    appendLog(activeLegacyRun, log);
    if (RUN_COMPLETE_PATTERN.test(log.message)) activeLegacyRun = undefined;
  }

  return runs.map((run) => {
    const completion = run.logs.find((log) => RUN_COMPLETE_PATTERN.test(log.message));
    return {
      ...run,
      summary: completion?.message || "Run has no retained completion summary.",
    };
  });
}

const MANILA_TIMESTAMP_FORMATTER = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
});

export function formatCollectorTimestamp(timestamp: string): string {
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return timestamp;
  return `${MANILA_TIMESTAMP_FORMATTER.format(parsed).replace(" at ", ", ")} PHT`;
}
