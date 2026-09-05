import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createECDH } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ALL_LGU_IDS } from "@/data/lgus";
import { enqueuePublicationNotification, dispatchPendingPushNotifications, notificationPayload } from "@/lib/notifications/dispatch";
import { createNotificationEvent, deactivatePushSubscription, savePushSubscription } from "@/lib/notifications/storage";
import { notificationFingerprint } from "@/lib/notifications/fingerprint";
import type { SuspensionRecord } from "@/types";

let directory = "";
const savedEnvironment = { data: process.env.CLASSSTATUS_DATA_DIR, driver: process.env.CLASSSTATUS_STORAGE_DRIVER, namespace: process.env.CLASSSTATUS_SUPABASE_NAMESPACE };
const ecdh = createECDH("prime256v1");
ecdh.generateKeys();
const pushKeys = { p256dh: ecdh.getPublicKey().toString("base64url"), auth: Buffer.alloc(16, 9).toString("base64url") };
const endpoint = (name: string) => `https://fcm.googleapis.com/fcm/send/${name}`;

function record(overrides: Partial<SuspensionRecord> = {}): SuspensionRecord {
  return {
    id: "safe-caloocan", lguId: "caloocan", status: "classes-suspended", affectedLevels: ["all-levels"], schoolSector: "all", effectiveDate: "2026-09-08", isAllDay: true,
    reason: "Heavy rain", announcementSummary: "All classes suspended.",
    source: { id: "gma-news-walang-pasok", name: "GMA News", organization: "GMA Network", url: "https://example.test/advisory", type: "news-reputable", reliabilityTier: 3, verified: false, publishedAt: "2026-09-07T20:00:00+08:00" },
    confidence: "medium", discoveredAt: "2026-09-07T20:01:00+08:00", publishedAt: "2026-09-07T20:00:00+08:00", lifecycleState: "upcoming", isActive: false, isUpcoming: true, isExpired: false,
    parserOutcome: "accepted:tier3-lgu-suspension:v2", collectorProvenance: { pipeline: "tier3-media", runId: "run-private", collectedAt: "2026-09-07T20:01:00+08:00" }, publicationProvenance: { type: "automatic-collector", publicLabel: "Published from approved Tier 3 media evidence" }, administrativeState: "active", revision: 1,
    ...overrides,
  };
}

function document() { const file = path.join(directory, "push_notifications.json"); return (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : { events: [], deliveries: [], subscriptions: [] }) as { events: Array<{ fingerprint: string; kind: string }>; deliveries: Array<{ state: string }>; subscriptions: Array<{ active: boolean; endpoint?: string }> }; }

describe("durable publication push notifications", () => {
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "classstatus-push-"));
    process.env.CLASSSTATUS_DATA_DIR = directory; process.env.CLASSSTATUS_STORAGE_DRIVER = "local-json"; process.env.CLASSSTATUS_SUPABASE_NAMESPACE = "preview";
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-07T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers(); fs.rmSync(directory, { recursive: true, force: true });
    for (const [key, value] of Object.entries(savedEnvironment)) { const name = key === "data" ? "CLASSSTATUS_DATA_DIR" : key === "driver" ? "CLASSSTATUS_STORAGE_DRIVER" : "CLASSSTATUS_SUPABASE_NAMESPACE"; if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  });

  it("creates one durable event for a new safe publication and survives reload semantics", async () => {
    await enqueuePublicationNotification(record(), "created");
    await enqueuePublicationNotification({ ...record(), collectorProvenance: { ...record().collectorProvenance!, runId: "next-run" } }, "created");
    expect(document().events).toHaveLength(1);
    await expect(createNotificationEvent(record())).resolves.toMatchObject({ created: false });
    expect(document().events).toHaveLength(1);
  });

  it("deduplicates a same-state corroborator because source evidence is not part of the fingerprint", async () => {
    await enqueuePublicationNotification(record(), "created");
    await enqueuePublicationNotification(record({ source: { ...record().source, id: "rappler-walang-pasok", organization: "Rappler Philippines", url: "https://example.test/corroborates" }, additionalSources: [record().source] }), "created");
    expect(document().events).toHaveLength(1);
  });

  it("creates one update event for a material scope expansion and not for its repeat", async () => {
    const partial = record({ status: "partial-suspension", affectedLevels: ["elementary", "junior-high"], schoolSector: "public" });
    await enqueuePublicationNotification(partial, "created");
    await enqueuePublicationNotification(record({ revision: 2 }), "updated");
    await enqueuePublicationNotification(record({ revision: 3, source: { ...record().source, updatedAt: "2026-09-07T21:00:00+08:00" } }), "updated");
    expect(document().events.map((event) => event.kind)).toEqual(["initial", "update"]);
  });

  it("will not create events for stale, malformed/rejected, or held-style records", async () => {
    await enqueuePublicationNotification(record({ effectiveDate: "2026-09-01", isExpired: false }), "created");
    await enqueuePublicationNotification(record({ collectorProvenance: undefined }), "created");
    await enqueuePublicationNotification(record({ status: "awaiting-information" }), "created");
    expect(document().events).toHaveLength(0);
  });

  it("does not make a failed push alter the event and preserves its original publication time on retry", async () => {
    await savePushSubscription({ endpoint: endpoint("caloocan"), ...pushKeys, lguIds: ["caloocan"] });
    await createNotificationEvent(record());
    const firstAttempt: string[] = [];
    await dispatchPendingPushNotifications(async (_delivery, payload) => { firstAttempt.push(payload.body); throw new Error("network"); });
    expect(document().events).toHaveLength(1); expect(document().deliveries[0].state).toBe("failed");
    vi.advanceTimersByTime(60_000);
    const sent: Array<{ id: string; body: string }> = [];
    await dispatchPendingPushNotifications(async (delivery, payload) => { sent.push({ id: delivery.subscription.id, body: payload.body }); });
    expect(sent).toHaveLength(1); expect(document().events).toHaveLength(1); expect(document().deliveries[0].state).toBe("delivered");
    expect(sent[0].body).toBe(firstAttempt[0]);
    expect(sent[0].body).toBe("As of 8:00 PM, Caloocan is suspended for all levels, public and private.");
  });

  it("filters recipients by LGU, skips unsubscribed users, and deactivates permanently invalid subscriptions", async () => {
    const caloocan = await savePushSubscription({ endpoint: endpoint("caloocan"), ...pushKeys, lguIds: ["caloocan"] });
    const manila = await savePushSubscription({ endpoint: endpoint("manila"), ...pushKeys, lguIds: ["manila"] });
    await deactivatePushSubscription(manila.id);
    await createNotificationEvent(record());
    const endpoints: string[] = [];
    await dispatchPendingPushNotifications(async (delivery) => { endpoints.push(delivery.subscription.endpoint); });
    expect(endpoints).toEqual([endpoint("caloocan")]);
    const updated = record({ effectiveDate: "2026-09-09" });
    await createNotificationEvent(updated);
    vi.advanceTimersByTime(1);
    await dispatchPendingPushNotifications(async () => { throw { statusCode: 410 }; });
    expect(document().subscriptions.find((item) => item.endpoint === endpoint("caloocan"))?.active).toBe(false);
    expect(caloocan.id).toBeTruthy();
  });

  it("uses only material public fields in the stable fingerprint and builds the approved automatic payload", () => {
    const first = record(); const rescan = record({ discoveredAt: "2026-09-07T23:00:00+08:00", publishedAt: "2026-09-07T22:00:00+08:00", collectorProvenance: { ...first.collectorProvenance!, runId: "other-run" }, source: { ...first.source, url: "https://example.test/another-source" } });
    expect(notificationFingerprint("preview", first)).toBe(notificationFingerprint("preview", rescan));
    const payload = notificationPayload({ id: "event", deploymentNamespace: "preview", fingerprint: notificationFingerprint("preview", first), familyFingerprint: "v1f:test", kind: "initial", record: first, createdAt: first.discoveredAt });
    expect(payload).toMatchObject({ title: "Class Status", body: "As of 8:01 PM, Caloocan is suspended for all levels, public and private.", url: "/?lgu=caloocan" });
    expect(payload.body).not.toContain("example.test");
  });

  it("uses truthful scoped and unknown-scope automatic wording", () => {
    const base = { id: "event", deploymentNamespace: "preview" as const, fingerprint: "fingerprint", familyFingerprint: "family", kind: "initial" as const, createdAt: "2026-09-07T12:00:00.000Z" };
    expect(notificationPayload({ ...base, record: record({ status: "partial-suspension", affectedLevels: ["elementary", "junior-high"], schoolSector: "public" }) }).body).toBe("As of 8:00 PM, Caloocan is suspended for elementary and junior high in public schools.");
    expect(notificationPayload({ ...base, record: record({ affectedLevels: [] }) }).body).toBe("As of 8:00 PM, Caloocan is suspended.");
  });

  it("retains exactly the 17 NCR preference options", () => expect(ALL_LGU_IDS).toHaveLength(17));

  it("does not send an automatic retry after its suspension has expired", async () => {
    await savePushSubscription({ endpoint: endpoint("caloocan"), ...pushKeys, lguIds: ["caloocan"] });
    await createNotificationEvent(record());
    vi.setSystemTime(new Date("2026-09-09T00:00:00+08:00"));
    const sender = vi.fn(async () => undefined);
    await dispatchPendingPushNotifications(sender);
    expect(sender).not.toHaveBeenCalled();
    expect(document().deliveries[0]).toMatchObject({ state: "invalid" });
    expect(document().subscriptions[0].active).toBe(true);
  });
});
