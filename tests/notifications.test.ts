import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ALL_LGU_IDS } from "@/data/lgus";
import { enqueuePublicationNotification, dispatchPendingPushNotifications, notificationPayload } from "@/lib/notifications/dispatch";
import { createNotificationEvent, deactivatePushSubscription, savePushSubscription } from "@/lib/notifications/storage";
import { notificationFingerprint } from "@/lib/notifications/fingerprint";
import type { SuspensionRecord } from "@/types";

let directory = "";
const savedEnvironment = { data: process.env.CLASSSTATUS_DATA_DIR, driver: process.env.CLASSSTATUS_STORAGE_DRIVER, namespace: process.env.CLASSSTATUS_SUPABASE_NAMESPACE };

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

  it("does not make a failed push alter the event and retries the same delivery without a new event", async () => {
    await savePushSubscription({ endpoint: "https://push.example/caloocan", p256dh: "a".repeat(32), auth: "b".repeat(16), lguIds: ["caloocan"] });
    await createNotificationEvent(record());
    await dispatchPendingPushNotifications(async () => { throw new Error("network"); });
    expect(document().events).toHaveLength(1); expect(document().deliveries[0].state).toBe("failed");
    vi.advanceTimersByTime(60_000);
    const sent: string[] = [];
    await dispatchPendingPushNotifications(async (delivery) => { sent.push(delivery.subscription.id); });
    expect(sent).toHaveLength(1); expect(document().events).toHaveLength(1); expect(document().deliveries[0].state).toBe("delivered");
  });

  it("filters recipients by LGU, skips unsubscribed users, and deactivates permanently invalid subscriptions", async () => {
    const caloocan = await savePushSubscription({ endpoint: "https://push.example/caloocan", p256dh: "a".repeat(32), auth: "b".repeat(16), lguIds: ["caloocan"] });
    const manila = await savePushSubscription({ endpoint: "https://push.example/manila", p256dh: "c".repeat(32), auth: "d".repeat(16), lguIds: ["manila"] });
    await deactivatePushSubscription(manila.id);
    await createNotificationEvent(record());
    const endpoints: string[] = [];
    await dispatchPendingPushNotifications(async (delivery) => { endpoints.push(delivery.subscription.endpoint); });
    expect(endpoints).toEqual(["https://push.example/caloocan"]);
    const updated = record({ effectiveDate: "2026-09-09" });
    await createNotificationEvent(updated);
    vi.advanceTimersByTime(1);
    await dispatchPendingPushNotifications(async () => { throw { statusCode: 410 }; });
    expect(document().subscriptions.find((item) => item.endpoint === "https://push.example/caloocan")?.active).toBe(false);
    expect(caloocan.id).toBeTruthy();
  });

  it("uses only material public fields in the stable fingerprint and builds safe service-worker payloads", () => {
    const first = record(); const rescan = record({ discoveredAt: "2026-09-07T23:00:00+08:00", publishedAt: "2026-09-07T22:00:00+08:00", collectorProvenance: { ...first.collectorProvenance!, runId: "other-run" }, source: { ...first.source, url: "https://example.test/another-source" } });
    expect(notificationFingerprint("preview", first)).toBe(notificationFingerprint("preview", rescan));
    const payload = notificationPayload({ id: "event", deploymentNamespace: "preview", fingerprint: notificationFingerprint("preview", first), familyFingerprint: "v1f:test", kind: "initial", record: first, createdAt: first.discoveredAt });
    expect(payload.url).toBe("/?lgu=caloocan"); expect(payload.body).toContain("All Levels"); expect(payload.body).not.toContain("example.test");
  });

  it("retains exactly the 17 NCR preference options", () => expect(ALL_LGU_IDS).toHaveLength(17));
});
