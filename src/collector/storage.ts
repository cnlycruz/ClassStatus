import { CollectorFreshness, CollectorLog, SuspensionRecord } from "@/types";
import { isLiveTier3Record } from "./sourcePolicy";
import { suspensionStore } from "@/lib/storage";
import { getDeploymentNamespace, getStorageDriver } from "@/lib/storage/driver";
import {
  COLLECTOR_PARSER_OUTCOME_V2,
  noticeEventKey,
  noticeFamilyKey,
} from "@/lib/suspensions/noticeModel";
import { enqueuePublicationNotification } from "@/lib/notifications/dispatch";

export async function getSuspensions(): Promise<SuspensionRecord[]> {
  return suspensionStore.listPublicRecords();
}

export async function getSuspensionHistory(): Promise<SuspensionRecord[]> {
  return suspensionStore.listPublicHistory();
}

export async function clearLiveSuspensions(): Promise<SuspensionRecord[]> {
  await suspensionStore.clearCollected();
  return [];
}

function identityNamespace() {
  if (getStorageDriver() === "local-json") {
    return process.env.CLASSSTATUS_SUPABASE_NAMESPACE === "production" ? "production" : "preview";
  }
  return getDeploymentNamespace();
}

export type CollectedUpsertResult = {
  action: "created" | "updated" | "merged" | "unchanged" | "held";
  record: SuspensionRecord;
  reason?: string;
};

export async function upsertCollectedSuspensionRecord(newRecord: SuspensionRecord): Promise<CollectedUpsertResult> {
  if (!isLiveTier3Record(newRecord)) {
    throw new Error("Live storage accepts only current operational Tier 3 collector-provenance records");
  }
  if (newRecord.parserOutcome !== COLLECTOR_PARSER_OUTCOME_V2) {
    throw new Error("Live storage accepts only collector parser-policy v2 records");
  }

  const namespace = identityNamespace();
  const eventKey = noticeEventKey(namespace, newRecord);
  const conflictKey = noticeFamilyKey(namespace, newRecord);
  const candidate = { ...newRecord, eventKey, confidence: "medium" as const, publicationProvenance: { type: "automatic-collector" as const, publicLabel: "Published from approved Tier 3 media evidence" }, administrativeState: "active" as const, revision: newRecord.revision || 1 };
  const result = await suspensionStore.upsertCollected({ candidate, eventKey, conflictKey });
  if (result.action === "created" || result.action === "updated") {
    await enqueuePublicationNotification(result.record, result.action);
  }
  return result;
}

export function appendCollectorLogs(logs: CollectorLog[]): Promise<void> {
  return suspensionStore.appendCollectorLogs(logs);
}

export function getCollectorLogs(): Promise<CollectorLog[]> {
  return suspensionStore.listCollectorLogs(200);
}

export function getCollectorFreshness(): Promise<CollectorFreshness> {
  return suspensionStore.getCollectorFreshness();
}

export function recordSuccessfulCollectorCheck(completedAt: string): Promise<void> {
  return suspensionStore.recordSuccessfulCollectorCheck(completedAt);
}

export function resetStorageCacheForTests(): void {
  // Local reads are intentionally uncached so external edits remain visible.
}
