import { createHash, randomUUID } from "crypto";
import { suspensionStore } from "@/lib/storage";
import { getAdminConfig } from "./config";
import { hmac, safeEqual, sha256, stableJson } from "./crypto";
import { normalizeManualDraft } from "./validation";
import type { AdminStateDocument, AuditEntry, NormalizedManualDraft } from "./types";
import type { SuspensionRecord } from "@/types";
import { effectiveAdminState } from "@/utils/administrativeState";

const CONFIRMATION_MS = 10 * 60 * 1000;
const RECEIPT_MS = 24 * 60 * 60 * 1000;

function audit(state: AdminStateDocument, entry: Omit<AuditEntry, "id" | "timestamp">): void {
  state.audit.unshift({ id: randomUUID(), timestamp: new Date().toISOString(), ...entry });
  state.audit = state.audit.slice(0, 1000);
}
function payloadHash(value: unknown): string { return sha256(stableJson(value)); }
function eventKey(record: Pick<SuspensionRecord, "lguId" | "schoolId" | "effectiveDate" | "status" | "affectedLevels" | "schoolSector" | "isAllDay" | "startTime" | "endTime">): string {
  return createHash("sha256").update([record.lguId, record.schoolId || "lgu", record.effectiveDate, record.status, [...record.affectedLevels].sort().join(","), record.schoolSector, record.isAllDay ? "all-day" : `${record.startTime}-${record.endTime}`].join("|")).digest("hex");
}
function prune(state: AdminStateDocument, now = Date.now()): void {
  state.confirmations = state.confirmations.filter((item) => !item.consumedAt && Date.parse(item.expiresAt) > now);
  state.idempotency = state.idempotency.filter((item) => now - Date.parse(item.createdAt) < RECEIPT_MS);
}

export function createPublicationPreview(input: unknown, sessionId: string) {
  const normalized = normalizeManualDraft(input); const hash = payloadHash(normalized); const id = randomUUID(); const expiresAt = new Date(Date.now() + CONFIRMATION_MS).toISOString();
  suspensionStore.mutateState((state) => { prune(state); state.confirmations.push({ id, sessionId, payloadHash: hash, expiresAt }); });
  const signature = hmac(`confirmation:${id}:${sessionId}:${hash}`, getAdminConfig().sessionSecret);
  return {
    normalizedDraft: normalized, confirmationToken: `${id}.${signature}`, expiresAt,
    preview: { heading: `${normalized.targetName} — Classes Suspended`, scope: `${normalized.affectedLevels.join(", ")} · ${normalized.sector}`, reason: normalized.resolvedReason, effectiveDate: normalized.effectiveDate, duration: normalized.resolvedDuration, evidence: normalized.resolvedEvidenceProvider, proofUrl: normalized.normalizedProofUrl, publication: "Manually verified by ClassStatus Admin" },
  };
}

export function publishManualSuspension(input: { draft: unknown; confirmationToken: string; idempotencyKey: string }, sessionId: string): SuspensionRecord {
  const normalized = normalizeManualDraft(input.draft); const hash = payloadHash(normalized); const [confirmationId, signature] = input.confirmationToken.split(".");
  if (!/^[0-9a-f-]{36}$/i.test(input.idempotencyKey) || !confirmationId || !signature) throw new Error("confirmation-invalid");
  const expected = hmac(`confirmation:${confirmationId}:${sessionId}:${hash}`, getAdminConfig().sessionSecret);
  if (!safeEqual(signature, expected)) throw new Error("confirmation-invalid");
  return suspensionStore.mutateState((state) => {
    prune(state); const requestHash = payloadHash({ normalized, confirmationId });
    const prior = state.idempotency.find((item) => item.key === input.idempotencyKey && item.sessionId === sessionId && item.operation === "publish");
    if (prior) { if (prior.payloadHash !== requestHash) throw new Error("idempotency-conflict"); return prior.response as SuspensionRecord; }
    const confirmation = state.confirmations.find((item) => item.id === confirmationId && item.sessionId === sessionId && item.payloadHash === hash);
    if (!confirmation || confirmation.consumedAt || Date.parse(confirmation.expiresAt) <= Date.now()) throw new Error("confirmation-invalid");
    const now = new Date().toISOString();
    const record: SuspensionRecord = {
      id: randomUUID(), lguId: normalized.lguId, ...(normalized.schoolId ? { schoolId: normalized.schoolId } : {}), status: normalized.status,
      affectedLevels: normalized.affectedLevels, schoolSector: normalized.sector, effectiveDate: normalized.effectiveDate,
      ...(normalized.duration.startTime ? { startTime: normalized.duration.startTime } : {}), ...(normalized.duration.endTime ? { endTime: normalized.duration.endTime } : {}),
      isAllDay: normalized.duration.isAllDay === true, untilFurtherNotice: normalized.duration.preset === "until-further-notice",
      durationLabel: normalized.resolvedDuration, reason: normalized.resolvedReason,
      announcementSummary: `${normalized.targetName}: ${normalized.resolvedReason}. ${normalized.resolvedDuration}.`,
      source: { id: `manual-${recordIdPart(normalized.resolvedEvidenceProvider)}`, name: normalized.resolvedEvidenceProvider, organization: normalized.resolvedEvidenceProvider, url: normalized.normalizedProofUrl, type: "manual-evidence", verified: true, publishedAt: now },
      confidence: "admin-verified", discoveredAt: now, publishedAt: now, lifecycleState: "validated", isUpcoming: false, isActive: false, isExpired: false,
      publicationProvenance: { type: "manual-admin", publicLabel: "Manually verified by ClassStatus Admin" }, administrativeState: "active", revision: 1,
      manualEvidence: { providerPreset: normalized.evidence.preset, providerName: normalized.resolvedEvidenceProvider, proofUrl: normalized.normalizedProofUrl, ...(normalized.publicNote ? { publicNote: normalized.publicNote } : {}) },
    };
    record.eventKey = eventKey(record);
    const duplicate = state.records.find((item) => effectiveAdminState(item) === "active" && (item.eventKey === record.eventKey || eventKey(item) === record.eventKey));
    if (duplicate) throw new Error("duplicate-publication");
    confirmation.consumedAt = now; state.records.unshift(record);
    audit(state, { action: "manual-publication", outcome: "success", recordId: record.id, targetSummary: normalized.targetName, correlationId: input.idempotencyKey });
    state.idempotency.push({ key: input.idempotencyKey, sessionId, operation: "publish", payloadHash: requestHash, createdAt: now, response: record });
    return record;
  });
}

function recordIdPart(value: string): string { return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "evidence"; }
export function requestRemoval(recordId: string, expectedRevision: number, idempotencyKey: string, sessionId: string): SuspensionRecord {
  return mutateLifecycle("remove", recordId, expectedRevision, idempotencyKey, sessionId);
}
export function undoRemoval(recordId: string, expectedRevision: number, idempotencyKey: string, sessionId: string): SuspensionRecord {
  return mutateLifecycle("undo", recordId, expectedRevision, idempotencyKey, sessionId);
}
function mutateLifecycle(operation: "remove" | "undo", recordId: string, expectedRevision: number, key: string, sessionId: string): SuspensionRecord {
  if (!/^[0-9a-f-]{36}$/i.test(key)) throw new Error("idempotency-invalid");
  return suspensionStore.mutateState((state) => {
    prune(state); const requestHash = payloadHash({ recordId, expectedRevision });
    const prior = state.idempotency.find((item) => item.key === key && item.sessionId === sessionId && item.operation === operation);
    if (prior) { if (prior.payloadHash !== requestHash) throw new Error("idempotency-conflict"); return prior.response as SuspensionRecord; }
    const record = state.records.find((item) => item.id === recordId); if (!record) throw new Error("record-not-found");
    if ((record.revision || 1) !== expectedRevision) throw new Error("stale-revision");
    const now = new Date();
    if (operation === "remove") {
      if (effectiveAdminState(record, now) !== "active") throw new Error("invalid-state-transition");
      record.administrativeState = "pending_removal"; record.removalRequestedAt = now.toISOString(); record.undoDeadline = new Date(now.getTime() + 30_000).toISOString();
    } else {
      if (record.administrativeState !== "pending_removal" || !record.undoDeadline || now.getTime() >= Date.parse(record.undoDeadline)) throw new Error("undo-window-expired");
      record.administrativeState = "active"; delete record.removalRequestedAt; delete record.undoDeadline;
    }
    record.revision = expectedRevision + 1;
    audit(state, { action: operation === "remove" ? "removal-request" : "removal-undo", outcome: "success", recordId, targetSummary: record.schoolId || record.lguId, correlationId: key });
    state.idempotency.push({ key, sessionId, operation, payloadHash: requestHash, createdAt: now.toISOString(), response: record });
    return { ...record };
  });
}

export function reconcileExpiredRemovals(now = new Date()): number {
  return suspensionStore.mutateState((state) => {
    let count = 0;
    for (const record of state.records) if (record.administrativeState === "pending_removal" && record.undoDeadline && now.getTime() >= Date.parse(record.undoDeadline)) {
      record.administrativeState = "removed"; record.removalFinalizedAt = now.toISOString(); record.revision = (record.revision || 1) + 1; count++;
      audit(state, { action: "removal-finalized", outcome: "success", recordId: record.id, targetSummary: record.schoolId || record.lguId, effectiveAt: record.undoDeadline });
    }
    return count;
  });
}
