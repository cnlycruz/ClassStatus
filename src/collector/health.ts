import type { CollectorFreshness, CollectorLog, CollectorSourceConfig, SourceHealthStatus } from "@/types";
import { DELAYED_AFTER_MS } from "@/lib/freshness";

export type SourceHealthView = { id: string; name: string; state: "healthy" | "delayed" | "error" | "unknown"; lastAttemptAt?: string; lastSuccessAt?: string; failureSummary?: string };
export type CollectorHealthView = { overall: "healthy" | "partial-failure" | "delayed" | "unknown"; sources: SourceHealthView[]; latestAttemptAt?: string; lastCompleteSweepAt: string | null; latestRun?: { published: number; held: number; rejected: number; sourcesSucceeded?: number; sourcesAttempted?: number } };

type SourceObservation = { successful: boolean };

const SOURCE_HEALTH_VALUES = new Set<SourceHealthStatus>([
  "healthy",
  "reachable_no_candidates",
  "degraded",
  "blocked",
  "failed",
]);

function structuredHealth(log: CollectorLog): SourceHealthStatus | undefined {
  const health = log.details?.health;
  return typeof health === "string" && SOURCE_HEALTH_VALUES.has(health as SourceHealthStatus)
    ? health as SourceHealthStatus
    : undefined;
}

function observation(log: CollectorLog): SourceObservation | undefined {
  const health = structuredHealth(log);
  if (health) return { successful: health === "healthy" || health === "reachable_no_candidates" };

  // Compatibility for persisted logs written before discovery health was structured.
  if (log.level !== "error" && /Discovery (healthy|reachable)/.test(log.message)) return { successful: true };
  if (log.level !== "error" && /Discovery succeeded with \d+ usable entries but no recent relevant candidates/.test(log.message)) return { successful: true };
  if (log.level === "error" || /Discovery degraded|Discovery (blocked|failed)|Live source failed/.test(log.message)) return { successful: false };
  return undefined;
}

const attempt = (log: CollectorLog) => observation(log) !== undefined;
const successful = (log: CollectorLog) => observation(log)?.successful === true;

function safeFailure(message: string): string {
  const httpStatus = message.match(/\bHTTP\s+(\d{3})\b/i);
  if (httpStatus) return `HTTP ${httpStatus[1]}`;
  if (/timed? out/i.test(message)) return "Timed out";
  if (/unexpected response/i.test(message)) return "Unexpected response format";
  return "Source attempt failed.";
}

export function deriveCollectorHealth(sources: CollectorSourceConfig[], logs: CollectorLog[], freshness: CollectorFreshness, now = new Date()): CollectorHealthView {
  const enabled = sources.filter((source) => source.enabled && source.operationalState === "operational" && source.reliabilityTier === 3);
  const newest = [...logs].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
  const views = enabled.map((source) => {
    const sourceLogs = newest.filter((log) => log.sourceId === source.id && attempt(log));
    const latest = sourceLogs[0]; const lastSuccess = sourceLogs.find(successful);
    const state = !latest ? "unknown" as const : !successful(latest) ? "error" as const : !lastSuccess || now.getTime() - Date.parse(lastSuccess.timestamp) > DELAYED_AFTER_MS ? "delayed" as const : "healthy" as const;
    return { id: source.id, name: source.name, state, lastAttemptAt: latest?.timestamp, lastSuccessAt: lastSuccess?.timestamp, ...(latest && !successful(latest) ? { failureSummary: safeFailure(latest.message) } : {}) };
  });
  const attempted = views.filter((source) => source.lastAttemptAt).length;
  const overall = attempted === 0 ? "unknown" : views.some((source) => source.state === "error") ? "partial-failure" : views.some((source) => source.state === "unknown") ? "unknown" : views.some((source) => source.state === "delayed") ? "delayed" : "healthy";
  const latestRunLog = newest.find((log) => log.sourceId === "engine" && /^Sweep complete:/.test(log.message));
  const counts = latestRunLog?.message.match(/Sweep complete: (\d+) published, (\d+) held, (\d+) rejected/);
  const enabledSourceIds = new Set(enabled.map((source) => source.id));
  const latestRunAttempts = latestRunLog?.runId
    ? logs.filter((log) => log.runId === latestRunLog.runId && enabledSourceIds.has(log.sourceId) && attempt(log))
    : [];
  const latestRunSucceeded = latestRunAttempts.filter(successful);
  const sourceCounts = latestRunLog?.runId ? { sourcesSucceeded: new Set(latestRunSucceeded.map((log) => log.sourceId)).size, sourcesAttempted: enabled.length } : {};
  return { overall, sources: views, latestAttemptAt: views.map((source) => source.lastAttemptAt).filter(Boolean).sort().at(-1), lastCompleteSweepAt: freshness.lastSuccessfulCheckAt, ...(counts ? { latestRun: { published: Number(counts[1]), held: Number(counts[2]), rejected: Number(counts[3]), ...sourceCounts } } : {}) };
}
