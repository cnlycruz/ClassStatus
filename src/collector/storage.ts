import { createHash } from "crypto";
import { CollectorLog, SuspensionRecord } from "@/types";
import { isLivePublicationRecord, isLiveTier3Record } from "./sourcePolicy";
import { suspensionStore } from "@/lib/storage";
import { effectiveAdminState } from "@/utils/administrativeState";

export async function getSuspensions(): Promise<SuspensionRecord[]> {
  return (await suspensionStore.listPublicRecords()).filter((record) => isLivePublicationRecord(record) && effectiveAdminState(record) === "active");
}

export async function clearLiveSuspensions(): Promise<SuspensionRecord[]> {
  await suspensionStore.clearCollected();
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

export type CollectedUpsertResult = {
  action: "created" | "updated" | "merged" | "held";
  record: SuspensionRecord;
  reason?: string;
};

export async function upsertCollectedSuspensionRecord(newRecord: SuspensionRecord): Promise<CollectedUpsertResult> {
  if (!isLiveTier3Record(newRecord)) {
    throw new Error("Live storage accepts only current operational Tier 3 collector-provenance records");
  }

  const eventKey = normalizedEventKey(newRecord);
  const candidate = { ...newRecord, eventKey, confidence: "medium" as const, publicationProvenance: { type: "automatic-collector" as const, publicLabel: "Published from approved Tier 3 media evidence" }, administrativeState: "active" as const, revision: newRecord.revision || 1 };
  return suspensionStore.upsertCollected({ candidate, eventKey, conflictKey: normalizedConflictKey(candidate) });
}

export function appendCollectorLogs(logs: CollectorLog[]): Promise<void> {
  return suspensionStore.appendCollectorLogs(logs);
}

export function getCollectorLogs(): Promise<CollectorLog[]> {
  return suspensionStore.listCollectorLogs(200);
}

export function resetStorageCacheForTests(): void {
  // Local reads are intentionally uncached so external edits remain visible.
}
