import { beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";
import { getManilaDateString } from "@/utils/philippineTime";
import { createPublicationPreview, publishManualSuspension, reconcileExpiredRemovals, requestRemoval, undoRemoval } from "@/lib/admin/suspensions";
import { effectiveAdminState } from "@/utils/administrativeState";
import { suspensionStore } from "@/lib/storage";
import { getSuspensions } from "@/collector/storage";

const sessionId = "test-session";
function draft() { return { targetType: "lgu", targetId: "pasig", sector: "all", affectedLevels: ["all-levels"], effectiveDate: getManilaDateString(), reason: { preset: "flooding" }, duration: { preset: "whole-day", isAllDay: true }, evidence: { preset: "lgu-official-announcement" }, proofUrl: "https://pasigcity.gov.ph/proof" }; }

beforeEach(() => {
  process.env.CLASSSTATUS_SESSION_SECRET = Buffer.alloc(32, 9).toString("base64"); process.env.CLASSSTATUS_ADMIN_USERNAME = "admin"; process.env.CLASSSTATUS_ADMIN_PASSWORD_HASH = "$argon2id$v=19$m=8192,t=1,p=1$YQ$YQ"; process.env.CLASSSTATUS_PUBLIC_ORIGIN = "http://localhost:3000"; process.env.CLASSSTATUS_STORAGE_DRIVER = "local-json";
  suspensionStore.mutateState((state) => { state.records = []; state.audit = []; state.confirmations = []; state.idempotency = []; });
});

function publish() {
  const preview = createPublicationPreview(draft(), sessionId);
  return publishManualSuspension({ draft: preview.normalizedDraft, confirmationToken: preview.confirmationToken, idempotencyKey: randomUUID() }, sessionId);
}

describe("manual publication and durable removal lifecycle", () => {
  it("publishes manual-admin provenance without collector provenance", () => {
    const record = publish(); expect(record.publicationProvenance?.type).toBe("manual-admin"); expect(record.collectorProvenance).toBeUndefined(); expect(record.confidence).toBe("admin-verified"); expect(getSuspensions()).toHaveLength(1);
  });
  it("rejects duplicate normalized publication", () => { publish(); expect(() => publish()).toThrow("duplicate-publication"); });
  it("makes pending removal immediately non-public and restores exactly on undo", () => {
    const original = publish(); const pending = requestRemoval(original.id, 1, randomUUID(), sessionId);
    expect(pending.administrativeState).toBe("pending_removal"); expect(getSuspensions()).toHaveLength(0);
    const restored = undoRemoval(original.id, 2, randomUUID(), sessionId); expect(restored.administrativeState).toBe("active"); expect(restored.reason).toBe(original.reason); expect(restored.source.url).toBe(original.source.url); expect(getSuspensions()).toHaveLength(1);
  });
  it("treats the deadline as removed before physical reconciliation", () => {
    const original = publish(); requestRemoval(original.id, 1, randomUUID(), sessionId);
    suspensionStore.mutateState((state) => { const record = state.records[0]; record.undoDeadline = new Date(Date.now() - 1).toISOString(); });
    const stored = suspensionStore.readState().records[0]; expect(stored.administrativeState).toBe("pending_removal"); expect(effectiveAdminState(stored)).toBe("removed"); expect(getSuspensions()).toHaveLength(0);
    expect(() => undoRemoval(stored.id, 2, randomUUID(), sessionId)).toThrow("undo-window-expired");
    expect(reconcileExpiredRemovals()).toBe(1); expect(suspensionStore.readState().records[0].administrativeState).toBe("removed");
  });
  it("enforces revisions and idempotency payload consistency", () => {
    const original = publish(); const key = randomUUID(); const first = requestRemoval(original.id, 1, key, sessionId); const replay = requestRemoval(original.id, 1, key, sessionId); expect(replay.id).toBe(first.id);
    expect(() => undoRemoval(original.id, 1, randomUUID(), sessionId)).toThrow("stale-revision");
  });
  it("fails closed when local JSON is selected on Vercel production", () => {
    const previousVercel = process.env.VERCEL; const previousEnvironment = process.env.VERCEL_ENV;
    process.env.VERCEL = "1"; process.env.VERCEL_ENV = "production";
    try { expect(() => suspensionStore.readState()).toThrow("ADMIN_STORAGE_UNAVAILABLE"); }
    finally { if (previousVercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = previousVercel; if (previousEnvironment === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = previousEnvironment; }
  });
});
