import { createHash, randomUUID } from "crypto";
import { suspensionStore } from "@/lib/storage";
import { getSecurityPepper } from "./config";
import { hmac, safeEqual, sha256, stableJson } from "./crypto";
import { normalizeManualDraft } from "./validation";
import type { NormalizedManualDraft } from "./types";
import type { SuspensionRecord } from "@/types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function payloadHash(value: unknown): string { return sha256(stableJson(value)); }
function eventKey(record: Pick<SuspensionRecord, "lguId" | "schoolId" | "effectiveDate" | "status" | "affectedLevels" | "schoolSector" | "isAllDay" | "startTime" | "endTime">): string {
  return createHash("sha256").update([record.lguId, record.schoolId || "lgu", record.effectiveDate, record.status, [...record.affectedLevels].sort().join(","), record.schoolSector, record.isAllDay ? "all-day" : `${record.startTime}-${record.endTime}`].join("|")).digest("hex");
}
export async function createPublicationPreview(input: unknown, sessionId: string) {
  const normalized = normalizeManualDraft(input);
  const hash = payloadHash(normalized);
  const receipt = await suspensionStore.createConfirmation(sessionId, hash);
  const signature = hmac(`confirmation:${receipt.id}:${sessionId}:${hash}`, getSecurityPepper());
  return {
    normalizedDraft: normalized, confirmationToken: `${receipt.id}.${signature}`, expiresAt: receipt.expiresAt,
    preview: { heading: `${normalized.targetName} — Classes Suspended`, scope: `${normalized.affectedLevels.join(", ")} · ${normalized.sector}`, reason: normalized.resolvedReason, effectiveDate: normalized.effectiveDate, duration: normalized.resolvedDuration, evidence: normalized.resolvedEvidenceProvider, proofUrl: normalized.normalizedProofUrl, publication: "Manually verified by ClassStatus Admin" },
  };
}

export async function publishManualSuspension(input: { draft: unknown; confirmationToken: string; idempotencyKey: string }, sessionId: string): Promise<SuspensionRecord> {
  const normalized = normalizeManualDraft(input.draft); const hash = payloadHash(normalized); const tokenParts = input.confirmationToken.split(".");
  if (tokenParts.length !== 2 || !UUID_PATTERN.test(input.idempotencyKey) || !UUID_PATTERN.test(tokenParts[0]) || !/^[A-Za-z0-9_-]{43}$/.test(tokenParts[1])) throw new Error("confirmation-invalid");
  const [confirmationId, signature] = tokenParts;
  const expected = hmac(`confirmation:${confirmationId}:${sessionId}:${hash}`, getSecurityPepper());
  if (!safeEqual(signature, expected)) throw new Error("confirmation-invalid");
  const requestHash = payloadHash({ normalized, confirmationId });
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
  return suspensionStore.publishManual({
    record,
    confirmationId,
    confirmationPayloadHash: hash,
    requestHash,
    idempotencyKey: input.idempotencyKey,
    sessionId,
    targetSummary: normalized.targetName,
  });
}

function recordIdPart(value: string): string { return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "evidence"; }
export function requestRemoval(recordId: string, expectedRevision: number, idempotencyKey: string, sessionId: string): Promise<SuspensionRecord> {
  return mutateLifecycle("remove", recordId, expectedRevision, idempotencyKey, sessionId);
}
export function undoRemoval(recordId: string, expectedRevision: number, idempotencyKey: string, sessionId: string): Promise<SuspensionRecord> {
  return mutateLifecycle("undo", recordId, expectedRevision, idempotencyKey, sessionId);
}
function mutateLifecycle(operation: "remove" | "undo", recordId: string, expectedRevision: number, key: string, sessionId: string): Promise<SuspensionRecord> {
  if (!UUID_PATTERN.test(key)) throw new Error("idempotency-invalid");
  if (!recordId || recordId.length > 128 || /[\u0000-\u001F\u007F]/.test(recordId)) throw new Error("record-id-invalid");
  return suspensionStore.mutateLifecycle({ operation, recordId, expectedRevision, idempotencyKey: key, requestHash: payloadHash({ recordId, expectedRevision }), sessionId });
}

export function reconcileExpiredRemovals(now = new Date()): Promise<number> {
  return suspensionStore.reconcileExpiredRemovals(now);
}
