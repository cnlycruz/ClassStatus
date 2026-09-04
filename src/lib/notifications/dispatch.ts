import webpush from "web-push";
import type { SuspensionRecord } from "@/types";
import { isLivePublicationRecord } from "@/collector/sourcePolicy";
import { evaluateSuspensionLifecycle } from "@/collector/lifecycle";
import { createNotificationEvent, invalidatePushSubscription, listPendingPushDeliveries, recordPushDelivery } from "./storage";
import type { NotificationEvent, PendingPushDelivery } from "./types";

function getVapidConfig() {
  const publicKey = process.env.CLASSSTATUS_VAPID_PUBLIC_KEY?.trim(); const privateKey = process.env.CLASSSTATUS_VAPID_PRIVATE_KEY?.trim(); const subject = process.env.CLASSSTATUS_VAPID_SUBJECT?.trim();
  return publicKey && privateKey && subject ? { publicKey, privateKey, subject } : null;
}

function levelText(record: SuspensionRecord): string {
  return record.affectedLevels.includes("all-levels") ? "All Levels" : record.affectedLevels.map((level) => level.replace(/-/g, " ")).join(", ");
}
function sectorText(record: SuspensionRecord): string { return record.schoolSector === "all" ? "Public & Private" : record.schoolSector === "public" ? "Public Only" : "Private Only"; }
function dateText(record: SuspensionRecord): string { return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", timeZone: "Asia/Manila" }).format(new Date(`${record.effectiveDate}T00:00:00+08:00`)); }

export function notificationPayload(event: NotificationEvent) {
  if (event.kind === "manual") {
    return {
      title: event.title || "Class Status Announcement",
      body: event.message || "Class Status announcement",
      url: event.recipientMode === "selected-lgus" && event.targetLguIds?.length === 1 ? `/?lgu=${encodeURIComponent(event.targetLguIds[0])}` : "/",
      tag: `class-status-${event.fingerprint}`,
    };
  }
  const record = event.record!;
  const name = record.lguId.split("-").map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");
  const isUpdate = event.kind === "update";
  return {
    title: isUpdate ? "Class Status Update" : "Class Status",
    body: `${isUpdate ? "Suspension updated in" : "Classes suspended in"} ${name}\n${levelText(record)} • ${sectorText(record)}\n${dateText(record)}`,
    url: `/?lgu=${encodeURIComponent(record.lguId)}`,
    tag: `class-status-${event.fingerprint}`,
  };
}

function retryAt(attempts: number): string { return new Date(Date.now() + Math.min(60 * 60 * 1000, 60_000 * 2 ** Math.max(0, attempts - 1))).toISOString(); }

export async function dispatchPendingPushNotifications(sender: (delivery: PendingPushDelivery, payload: ReturnType<typeof notificationPayload>) => Promise<void> = async (delivery, payload) => {
  const vapid = getVapidConfig();
  if (!vapid) throw new Error("push-not-configured");
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
  await webpush.sendNotification({ endpoint: delivery.subscription.endpoint, keys: { p256dh: delivery.subscription.p256dh, auth: delivery.subscription.auth } }, JSON.stringify(payload));
}): Promise<void> {
  const pending = await listPendingPushDeliveries();
  for (const delivery of pending) {
    const attemptedAt = new Date().toISOString(); const attempts = delivery.delivery.attempts + 1;
    try {
      await sender(delivery, notificationPayload(delivery.event));
      await recordPushDelivery(delivery.delivery.id, { state: "delivered", attempts, nextAttemptAt: attemptedAt, lastAttemptAt: attemptedAt, deliveredAt: attemptedAt });
    } catch (error: unknown) {
      const statusCode = typeof error === "object" && error && "statusCode" in error ? Number((error as { statusCode?: unknown }).statusCode) : 0;
      if (statusCode === 404 || statusCode === 410) {
        await invalidatePushSubscription(delivery.subscription.id);
        await recordPushDelivery(delivery.delivery.id, { state: "invalid", attempts, nextAttemptAt: attemptedAt, lastAttemptAt: attemptedAt, lastErrorCode: "subscription-gone" });
      } else {
        await recordPushDelivery(delivery.delivery.id, { state: "failed", attempts, nextAttemptAt: retryAt(attempts), lastAttemptAt: attemptedAt, lastErrorCode: statusCode ? `push-${statusCode}` : "push-failed" });
      }
    }
  }
}

export async function enqueuePublicationNotification(record: SuspensionRecord, action: "created" | "updated"): Promise<void> {
  // This is intentionally called only with storage's safe publication result.
  if (!isLivePublicationRecord(record) || record.isExpired || evaluateSuspensionLifecycle(record).isExpired || record.status === "awaiting-information") return;
  try {
    const result = await createNotificationEvent(record);
    // A retry sweep is safe: delivery rows, not collector runs, govern attempts.
    if (result.created) await dispatchPendingPushNotifications();
  } catch {
    // Publication is durable already. Push/outbox failures must never alter it.
  }
  void action;
}
