import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import { CollectorLog, SourceCitation, SuspensionRecord } from "@/types";
import { isLivePublicationRecord, isLiveTier3Record } from "./sourcePolicy";
import { suspensionStore } from "@/lib/storage";
import { effectiveAdminState } from "@/utils/administrativeState";

function dataDirectory(): string {
  return path.resolve(process.env.CLASSSTATUS_DATA_DIR || path.join(process.cwd(), "data"));
}

function suspensionsFile(): string {
  return path.join(dataDirectory(), "suspensions.json");
}

function logsFile(): string {
  return path.join(dataDirectory(), "collector_logs.json");
}

let memoryLogs: CollectorLog[] | null = null;
let memoryLogsFileVersion: string | null = null;

function ensureDataDirectory(): void {
  fs.mkdirSync(dataDirectory(), { recursive: true });
}

function readJson<T>(file: string, fallback: T): T {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
  } catch (error) {
    console.warn(`Failed to read ${path.basename(file)}:`, error);
    return fallback;
  }
}

function writeJson(file: string, value: unknown): void {
  ensureDataDirectory();
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2), "utf-8");
  fs.renameSync(temporary, file);
}

function fileVersion(file: string): string | null {
  try {
    const stats = fs.statSync(file);
    return `${stats.mtimeMs}:${stats.size}`;
  } catch {
    return null;
  }
}

export function getSuspensions(): SuspensionRecord[] {
  return suspensionStore.readState().records.filter((record) => isLivePublicationRecord(record) && effectiveAdminState(record) === "active");
}

function saveLiveSuspensions(records: SuspensionRecord[]): void {
  const liveRecords = records.filter(isLiveTier3Record);
  suspensionStore.mutateState((state) => {
    const preserved = state.records.filter((record) => !isLiveTier3Record(record));
    state.records = [...liveRecords, ...preserved];
  });
}

export function clearLiveSuspensions(): SuspensionRecord[] {
  suspensionStore.mutateState((state) => { state.records = state.records.filter((record) => !isLiveTier3Record(record)); });
  return [];
}

function normalizedEventKey(record: SuspensionRecord): string {
  const scope = [
    record.lguId,
    record.schoolId || "lgu",
    record.effectiveDate,
    record.status,
    [...record.affectedLevels].sort().join(","),
    record.schoolSector,
    record.isAllDay ? "all-day" : `${record.startTime || ""}-${record.endTime || ""}`,
  ].join("|");
  return createHash("sha256").update(scope).digest("hex");
}

function normalizedConflictKey(record: SuspensionRecord): string {
  return [
    record.lguId,
    record.schoolId || "lgu",
    record.effectiveDate,
    [...record.affectedLevels].sort().join(","),
    record.schoolSector,
    record.isAllDay ? "all-day" : `${record.startTime || ""}-${record.endTime || ""}`,
  ].join("|");
}

function uniqueSources(sources: SourceCitation[]): SourceCitation[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const identity = `${source.organization.trim().toLowerCase()}|${source.url}`;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

function withVerification(sources: SourceCitation[], confidence: "medium" | "high"): SourceCitation[] {
  return sources.map((source) => ({ ...source, verified: confidence === "high" }));
}

export type CollectedUpsertResult = {
  action: "created" | "updated" | "merged" | "held";
  record: SuspensionRecord;
  reason?: string;
};

export function upsertCollectedSuspensionRecord(newRecord: SuspensionRecord): CollectedUpsertResult {
  if (!isLiveTier3Record(newRecord)) {
    throw new Error("Live storage accepts only current operational Tier 3 collector-provenance records");
  }

  return suspensionStore.mutateState((state) => {
    const eventKey = normalizedEventKey(newRecord);
    const candidate = { ...newRecord, eventKey, confidence: "medium" as const, publicationProvenance: { type: "automatic-collector" as const, publicLabel: "Published from approved Tier 3 media evidence" }, administrativeState: "active" as const, revision: newRecord.revision || 1 };
    const activeRecords = state.records.filter((record) => effectiveAdminState(record) === "active");
    const duplicateManual = activeRecords.find((record) => record.publicationProvenance?.type === "manual-admin" && (record.eventKey === eventKey || normalizedEventKey(record) === eventKey));
    if (duplicateManual) return { action: "held" as const, record: candidate, reason: `duplicates-manual:${duplicateManual.id}` };
    const conflict = activeRecords.find((record) => normalizedConflictKey(record) === normalizedConflictKey(candidate) && record.status !== candidate.status);
    if (conflict) return { action: "held" as const, record: candidate, reason: `conflicts-with:${conflict.id}` };
    const existingIndex = state.records.findIndex((record) => isLiveTier3Record(record) && (record.eventKey === eventKey || normalizedEventKey(record) === eventKey));
    if (existingIndex < 0) {
      candidate.source = { ...candidate.source, verified: false }; state.records.unshift(candidate);
      return { action: "created" as const, record: candidate };
    }
    const existing = state.records[existingIndex];
    if (effectiveAdminState(existing) !== "active") return { action: "held" as const, record: candidate, reason: `administratively-removed:${existing.id}` };
    const isNewer = new Date(candidate.publishedAt).getTime() > new Date(existing.publishedAt).getTime();
    const preferred = isNewer ? candidate : existing;
    const sources = uniqueSources([preferred.source, existing.source, ...(existing.additionalSources || []), candidate.source]);
    const confidence: "medium" | "high" = new Set(sources.map((source) => source.organization.trim().toLowerCase())).size >= 2 ? "high" : "medium";
    const verifiedSources = withVerification(sources, confidence);
    const merged: SuspensionRecord = { ...preferred, id: existing.id, eventKey, source: verifiedSources[0], additionalSources: verifiedSources.slice(1), confidence, collectorProvenance: preferred.collectorProvenance, publicationProvenance: { type: "automatic-collector", publicLabel: "Published from approved Tier 3 media evidence" }, administrativeState: "active", revision: (existing.revision || 1) + 1 };
    state.records[existingIndex] = merged;
    const sameOutlet = [existing.source, ...(existing.additionalSources || [])].some((source) => source.organization === candidate.source.organization && source.url === candidate.source.url);
    return { action: sameOutlet ? "updated" as const : "merged" as const, record: merged };
  });
}

export function appendCollectorLogs(logs: CollectorLog[]): void {
  const current = getCollectorLogs();
  memoryLogs = [...logs, ...current].slice(0, 200);
  const file = logsFile();
  writeJson(file, memoryLogs);
  memoryLogsFileVersion = fileVersion(file);
}

export function getCollectorLogs(): CollectorLog[] {
  const file = logsFile();
  const currentFileVersion = fileVersion(file);
  if (memoryLogs && currentFileVersion === memoryLogsFileVersion) return memoryLogs;
  memoryLogs = readJson<CollectorLog[]>(file, []);
  memoryLogsFileVersion = currentFileVersion;
  return memoryLogs;
}

export function resetStorageCacheForTests(): void {
  memoryLogs = null;
  memoryLogsFileVersion = null;
}
