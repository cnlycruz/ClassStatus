import { beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";
import { getManilaDateString } from "@/utils/philippineTime";
import { createPublicationPreview, publishManualSuspension, reconcileExpiredRemovals, requestRemoval, undoRemoval } from "@/lib/admin/suspensions";
import { effectiveAdminState } from "@/utils/administrativeState";
import { localStateStore, suspensionStore } from "@/lib/storage";
import { getSuspensions } from "@/collector/storage";

const sessionId = "test-session";
function draft() { return { targetType: "lgu", targetId: "pasig", sector: "all", affectedLevels: ["all-levels"], effectiveDate: getManilaDateString(), reason: { preset: "flooding" }, duration: { preset: "whole-day", isAllDay: true }, evidence: { preset: "lgu-official-announcement" }, proofUrl: "https://pasigcity.gov.ph/proof" }; }

beforeEach(() => {
  delete process.env.VERCEL; delete process.env.VERCEL_ENV;
  process.env.CLASSSTATUS_SESSION_SECRET = Buffer.alloc(32, 9).toString("base64"); process.env.CLASSSTATUS_ADMIN_USERNAME = "admin"; process.env.CLASSSTATUS_ADMIN_PASSWORD_HASH = "$argon2id$v=19$m=8192,t=1,p=1$YQ$YQ"; process.env.CLASSSTATUS_PUBLIC_ORIGIN = "http://localhost:3000"; process.env.CLASSSTATUS_STORAGE_DRIVER = "local-json";
  localStateStore.mutateState((state) => { state.records = []; state.audit = []; state.confirmations = []; state.idempotency = []; });
});

async function publish() {
  const preview = await createPublicationPreview(draft(), sessionId);
  return publishManualSuspension({ draft: preview.normalizedDraft, confirmationToken: preview.confirmationToken, idempotencyKey: randomUUID() }, sessionId);
}

describe("manual publication and durable removal lifecycle", () => {
  it("publishes manual-admin provenance without collector provenance", async () => {
    const record = await publish(); expect(record.publicationProvenance?.type).toBe("manual-admin"); expect(record.collectorProvenance).toBeUndefined(); expect(record.confidence).toBe("admin-verified"); expect(await getSuspensions()).toHaveLength(1);
  });
  it("rejects duplicate normalized publication", async () => { await publish(); await expect(publish()).rejects.toThrow("duplicate-publication"); });
  it("makes pending removal immediately non-public and restores exactly on undo", async () => {
    const original = await publish(); const pending = await requestRemoval(original.id, 1, randomUUID(), sessionId);
    expect(pending.administrativeState).toBe("pending_removal"); expect(await getSuspensions()).toHaveLength(0);
    const restored = await undoRemoval(original.id, 2, randomUUID(), sessionId); expect(restored.administrativeState).toBe("active"); expect(restored.reason).toBe(original.reason); expect(restored.source.url).toBe(original.source.url); expect(await getSuspensions()).toHaveLength(1);
  });
  it("treats the deadline as removed before physical reconciliation", async () => {
    const original = await publish(); await requestRemoval(original.id, 1, randomUUID(), sessionId);
    localStateStore.mutateState((state) => { const record = state.records[0]; record.undoDeadline = new Date(Date.now() - 1).toISOString(); });
    const stored = localStateStore.readState().records[0]; expect(stored.administrativeState).toBe("pending_removal"); expect(effectiveAdminState(stored)).toBe("removed"); expect(await getSuspensions()).toHaveLength(0);
    await expect(undoRemoval(stored.id, 2, randomUUID(), sessionId)).rejects.toThrow("undo-window-expired");
    expect(await reconcileExpiredRemovals()).toBe(1); expect(localStateStore.readState().records[0].administrativeState).toBe("removed");
  });
  it("enforces revisions and idempotency payload consistency", async () => {
    const original = await publish(); const key = randomUUID(); const first = await requestRemoval(original.id, 1, key, sessionId); const replay = await requestRemoval(original.id, 1, key, sessionId); expect(replay.id).toBe(first.id);
    await expect(undoRemoval(original.id, 1, randomUUID(), sessionId)).rejects.toThrow("stale-revision");
  });
  it("requires canonical confirmation tokens, record IDs, and idempotency UUIDs", async () => {
    const preview = await createPublicationPreview(draft(), sessionId);
    await expect(publishManualSuspension({
      draft: preview.normalizedDraft,
      confirmationToken: `${preview.confirmationToken}.ignored`,
      idempotencyKey: randomUUID(),
    }, sessionId)).rejects.toThrow("confirmation-invalid");
    await expect(publishManualSuspension({
      draft: preview.normalizedDraft,
      confirmationToken: preview.confirmationToken,
      idempotencyKey: "------------------------------------",
    }, sessionId)).rejects.toThrow("confirmation-invalid");
    expect(() => requestRemoval("bad\u0000record", 1, randomUUID(), sessionId)).toThrow("record-id-invalid");
  });
  it("fails closed when local JSON is selected in every Vercel environment", async () => {
    const previousVercel = process.env.VERCEL; const previousEnvironment = process.env.VERCEL_ENV;
    process.env.VERCEL = "1"; process.env.VERCEL_ENV = "preview";
    try { await expect(suspensionStore.readState()).rejects.toThrow("ADMIN_STORAGE_UNAVAILABLE"); }
    finally { if (previousVercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = previousVercel; if (previousEnvironment === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = previousEnvironment; }
  });
});
