import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { ALL_LGU_IDS } from "@/data/lgus";
import { POST as sendManualNotification } from "@/app/api/admin/notifications/route";
import { POST as previewManualNotification } from "@/app/api/admin/notifications/preview/route";
import { sendAdminNotification } from "@/lib/admin/notifications";
import { dispatchPendingPushNotifications, notificationPayload } from "@/lib/notifications/dispatch";
import { createManualBroadcast, createNotificationEvent, deactivatePushSubscription, listManualBroadcastHistory, previewManualBroadcast, savePushSubscription } from "@/lib/notifications/storage";
import type { LGUId, SuspensionRecord } from "@/types";

let directory = "";
const environment = { data: process.env.CLASSSTATUS_DATA_DIR, driver: process.env.CLASSSTATUS_STORAGE_DRIVER, namespace: process.env.CLASSSTATUS_SUPABASE_NAMESPACE };
const requestKey = "11111111-1111-4111-8111-111111111111";
function input(overrides: Partial<{ requestKey: string; message: string; recipientMode: "all" | "selected-lgus"; targetLguIds: LGUId[] }> = {}) { return { requestKey, message: "Heavy rain is expected this afternoon. Stay safe.", recipientMode: "all" as const, targetLguIds: [] as LGUId[], ...overrides }; }
function document() { return JSON.parse(fs.readFileSync(path.join(directory, "push_notifications.json"), "utf8")) as { events: Array<{ kind: string }>; deliveries: Array<{ state: string }> }; }
function automaticRecord(): SuspensionRecord { return { id: "automatic", lguId: "caloocan", status: "classes-suspended", affectedLevels: ["all-levels"], schoolSector: "all", effectiveDate: "2026-09-08", isAllDay: true, reason: "Rain", announcementSummary: "Suspended", source: { id: "gma-news-walang-pasok", name: "GMA", organization: "GMA", url: "https://example.test", type: "news-reputable", reliabilityTier: 3, verified: false, publishedAt: "2026-09-07T00:00:00Z" }, confidence: "medium", discoveredAt: "2026-09-07T00:00:00Z", publishedAt: "2026-09-07T00:00:00Z", lifecycleState: "upcoming", isUpcoming: true, isActive: false, isExpired: false, collectorProvenance: { pipeline: "tier3-media", runId: "run", collectedAt: "2026-09-07T00:00:00Z" }, publicationProvenance: { type: "automatic-collector", publicLabel: "Published from approved Tier 3 media evidence" } }; }

describe("protected manual custom notifications", () => {
  beforeEach(() => { directory = fs.mkdtempSync(path.join(os.tmpdir(), "classstatus-manual-push-")); process.env.CLASSSTATUS_DATA_DIR = directory; process.env.CLASSSTATUS_STORAGE_DRIVER = "local-json"; process.env.CLASSSTATUS_SUPABASE_NAMESPACE = "preview"; process.env.CLASSSTATUS_ADMIN_USERNAME = "admin"; process.env.CLASSSTATUS_ADMIN_PASSWORD_HASH = "$argon2id$v=19$m=8192,t=1,p=1$YQ$YQ"; process.env.CLASSSTATUS_SESSION_SECRET = Buffer.alloc(32, 7).toString("base64"); process.env.CLASSSTATUS_PUBLIC_ORIGIN = "http://localhost:3000"; vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-07T12:00:00Z")); });
  afterEach(() => { vi.useRealTimers(); fs.rmSync(directory, { recursive: true, force: true }); for (const [key, value] of Object.entries(environment)) { const name = key === "data" ? "CLASSSTATUS_DATA_DIR" : key === "driver" ? "CLASSSTATUS_STORAGE_DRIVER" : "CLASSSTATUS_SUPABASE_NAMESPACE"; if (value === undefined) delete process.env[name]; else process.env[name] = value; } });

  it("keeps the route admin-only", async () => {
    const request = new NextRequest("http://localhost:3000/api/admin/notifications", { method: "POST", headers: { origin: "http://localhost:3000", "sec-fetch-site": "same-origin", "content-type": "application/json" }, body: JSON.stringify(input()) });
    expect((await sendManualNotification(request)).status).toBe(401);
  });

  it("keeps recipient preview admin-only", async () => {
    const request = new NextRequest("http://localhost:3000/api/admin/notifications/preview", { method: "POST", headers: { origin: "http://localhost:3000", "sec-fetch-site": "same-origin", "content-type": "application/json" }, body: JSON.stringify(input()) });
    expect((await previewManualNotification(request)).status).toBe(401);
  });

  it("creates one manual broadcast with all active subscribers, ignoring LGU preferences", async () => {
    await savePushSubscription({ endpoint: "https://push.test/caloocan", p256dh: "a".repeat(32), auth: "b".repeat(16), lguIds: ["caloocan"] });
    await savePushSubscription({ endpoint: "https://push.test/manila", p256dh: "c".repeat(32), auth: "d".repeat(16), lguIds: ["manila"] });
    const broadcast = await createManualBroadcast(input());
    expect(broadcast).toMatchObject({ created: true, recipientCount: 2, event: { kind: "manual", title: "Class Status" } });
    expect(notificationPayload(broadcast.event)).toMatchObject({ title: "Class Status", body: input().message, url: "/" });
    expect(notificationPayload(broadcast.event).title).not.toContain("Announcement");
    expect(notificationPayload(broadcast.event).body).not.toContain("from Class Status");
    expect(document().deliveries).toHaveLength(2);
  });

  it("uses exactly the trimmed administrator message without announcement wording", async () => {
    const broadcast = await createManualBroadcast(input({ message: "  Waiting pa rin sa suspension no?  " }));

    expect(notificationPayload(broadcast.event)).toMatchObject({ title: "Class Status", body: "Waiting pa rin sa suspension no?" });
    expect(notificationPayload(broadcast.event).body).not.toContain("from Class Status");
    expect(notificationPayload(broadcast.event).body).not.toContain("Announcement");
  });

  it("keeps the authoritative send path available independently of recipient preview", async () => {
    await savePushSubscription({ endpoint: "https://push.test/caloocan", p256dh: "a".repeat(32), auth: "b".repeat(16), lguIds: ["caloocan"] });

    await expect(sendAdminNotification(input())).resolves.toMatchObject({ created: true, recipientCount: 1 });
    expect(document().deliveries).toHaveLength(1);
  });

  it("calculates recipients for all-subscriber and selected-LGU previews without creating an event", async () => {
    await savePushSubscription({ endpoint: "https://push.test/caloocan", p256dh: "a".repeat(32), auth: "b".repeat(16), lguIds: ["caloocan"] });
    await savePushSubscription({ endpoint: "https://push.test/manila", p256dh: "c".repeat(32), auth: "d".repeat(16), lguIds: ["manila"] });
    await expect(previewManualBroadcast(input())).resolves.toBe(2);
    await expect(previewManualBroadcast(input({ recipientMode: "selected-lgus", targetLguIds: ["caloocan"] }))).resolves.toBe(1);
    expect(document().events).toHaveLength(0);
  });

  it("targets selected LGUs uniquely, excludes inactive subscribers, and keeps all 17 LGUs canonical", async () => {
    const matching = await savePushSubscription({ endpoint: "https://push.test/multi", p256dh: "a".repeat(32), auth: "b".repeat(16), lguIds: ["caloocan", "manila"] });
    const manila = await savePushSubscription({ endpoint: "https://push.test/manila", p256dh: "c".repeat(32), auth: "d".repeat(16), lguIds: ["manila"] });
    await deactivatePushSubscription(manila.id);
    const broadcast = await createManualBroadcast(input({ recipientMode: "selected-lgus", targetLguIds: ["caloocan", "manila"] }));
    expect(broadcast.recipientCount).toBe(1); expect(document().deliveries).toHaveLength(1); expect(matching.id).toBeTruthy();
    expect(ALL_LGU_IDS).toHaveLength(17); expect(new Set(ALL_LGU_IDS)).toHaveLength(17);
  });

  it("rejects empty or oversized messages", async () => {
    await expect(createManualBroadcast(input({ message: "   " }))).rejects.toThrow("manual-notification-invalid");
    await expect(createManualBroadcast(input({ message: "x".repeat(501) }))).rejects.toThrow("manual-notification-invalid");
  });

  it("uses request-key idempotency across retries/reload while allowing intentional repeated text", async () => {
    const first = await createManualBroadcast(input()); const retry = await createManualBroadcast(input());
    const intentional = await createManualBroadcast(input({ requestKey: "22222222-2222-4222-8222-222222222222" }));
    expect(first.created).toBe(true); expect(retry.created).toBe(false); expect(intentional.created).toBe(true); expect(document().events.filter((event) => event.kind === "manual")).toHaveLength(2);
  });

  it("uses the shared retry and invalid-subscription cleanup path without affecting the broadcast", async () => {
    await savePushSubscription({ endpoint: "https://push.test/caloocan", p256dh: "a".repeat(32), auth: "b".repeat(16), lguIds: ["caloocan"] });
    await createManualBroadcast(input());
    await dispatchPendingPushNotifications(async () => { throw new Error("network"); }); expect(document().events).toHaveLength(1); expect(document().deliveries[0].state).toBe("failed");
    vi.advanceTimersByTime(60_000); await dispatchPendingPushNotifications(async () => { throw { statusCode: 410 }; }); expect(document().deliveries[0].state).toBe("invalid");
  });

  it("keeps manual broadcasts separate from automatic publication events and compact history", async () => {
    await createManualBroadcast(input()); await createNotificationEvent(automaticRecord());
    const history = await listManualBroadcastHistory();
    expect(history).toHaveLength(1); expect(document().events.map((event) => event.kind)).toEqual(expect.arrayContaining(["manual", "initial"]));
  });
});
