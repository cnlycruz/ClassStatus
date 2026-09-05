import webpush from "web-push";
import type { SuspensionRecord } from "@/types";
import { NCR_LGUS } from "@/data/lgus";
import { isLivePublicationRecord } from "@/collector/sourcePolicy";
import { evaluateSuspensionLifecycle } from "@/collector/lifecycle";
import { createNotificationEvent, invalidatePushSubscription, listPendingPushDeliveries, recordPushDelivery } from "./storage";
import type { NotificationEvent, PendingPushDelivery } from "./types";
import { InvalidPushSubscriptionError, validatePushSubscription } from "./subscriptionValidation";

function getVapidConfig() {
  const publicKey = process.env.CLASSSTATUS_VAPID_PUBLIC_KEY?.trim(); const privateKey = process.env.CLASSSTATUS_VAPID_PRIVATE_KEY?.trim(); const subject = process.env.CLASSSTATUS_VAPID_SUBJECT?.trim();
  return publicKey && privateKey && subject ? { publicKey, privateKey, subject } : null;
}

const manilaTimeFormatter = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit", hour12: true });

function levelText(record: SuspensionRecord): string | null {
  if (record.affectedLevels.includes("all-levels")) return "all levels";
  const levels = record.affectedLevels.map((level) => level.replace(/-/g, " "));
  if (!levels.length) return null;
  return levels.length === 1 ? levels[0] : levels.length === 2 ? `${levels[0]} and ${levels[1]}` : `${levels.slice(0, -1).join(", ")}, and ${levels.at(-1)}`;
}

function scopeText(record: SuspensionRecord): string | null {
  const levels = levelText(record);
  if (!levels) return null;
  if (record.schoolSector === "all") return `suspended for ${levels}, public and private.`;
  if (record.schoolSector === "public") return `suspended for ${levels} in public schools.`;
  if (record.schoolSector === "private") return `suspended for ${levels} in private schools.`;
  return null;
}

function automaticBody(event: NotificationEvent, record: SuspensionRecord): string {
  const time = manilaTimeFormatter.format(new Date(event.createdAt));
  const lgu = NCR_LGUS[record.lguId].name;
  const scope = scopeText(record);
  return scope ? `As of ${time}, ${lgu} is ${scope}` : `As of ${time}, ${lgu} is suspended.`;
}

export function notificationPayload(event: NotificationEvent) {
  if (event.kind === "manual") {
    return {
      title: "Class Status",
      body: event.message?.trim() || "",
      url: event.recipientMode === "selected-lgus" && event.targetLguIds?.length === 1 ? `/?lgu=${encodeURIComponent(event.targetLguIds[0])}` : "/",
      tag: `class-status-${event.fingerprint}`,
    };
  }
  const record = event.record!;
  return {
    title: "Class Status",
    body: automaticBody(event, record),
    url: `/?lgu=${encodeURIComponent(record.lguId)}`,
    tag: `class-status-${event.fingerprint}`,
  };
}

function retryAt(attempts: number): string { return new Date(Date.now() + Math.min(60 * 60 * 1000, 60_000 * 2 ** Math.max(0, attempts - 1))).toISOString(); }

export async function dispatchPendingPushNotifications(sender: (delivery: PendingPushDelivery, payload: ReturnType<typeof notificationPayload>) => Promise<void> = async (delivery, payload) => {
  const vapid = getVapidConfig();
  if (!vapid) throw new Error("push-not-configured");
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
  await webpush.sendNotification({ endpoint: delivery.subscription.endpoint, keys: { p256dh: delivery.subscription.p256dh, auth: delivery.subscription.auth } }, JSON.stringify(payload), { timeout: 10_000 });
}): Promise<void> {
  const pending = await listPendingPushDeliveries();
  for (const delivery of pending) {
    const attemptedAt = new Date().toISOString(); const attempts = delivery.delivery.attempts + 1;
    try {
      // Recheck stored records as well: subscriptions accepted before this
      // boundary must never reach any transport, including injected workers.
      validatePushSubscription(delivery.subscription);
      const record = delivery.event.record;
      // Enqueue-time validity is insufficient after an outage/backlog. A stale
      // suspension must not reach students merely because its delivery retries.
      if (delivery.event.kind !== "manual" && (!record || !isLivePublicationRecord(record)
        || record.isExpired || evaluateSuspensionLifecycle(record).isExpired || record.status === "awaiting-information")) {
        await recordPushDelivery(delivery.delivery.id, { state: "invalid", attempts: delivery.delivery.attempts, nextAttemptAt: attemptedAt, lastErrorCode: "event-not-publishable" });
        continue;
      }
      await sender(delivery, notificationPayload(delivery.event));
      await recordPushDelivery(delivery.delivery.id, { state: "delivered", attempts, nextAttemptAt: attemptedAt, lastAttemptAt: attemptedAt, deliveredAt: attemptedAt });
    } catch (error: unknown) {
      const statusCode = typeof error === "object" && error && "statusCode" in error ? Number((error as { statusCode?: unknown }).statusCode) : 0;
      if (error instanceof InvalidPushSubscriptionError || statusCode === 404 || statusCode === 410) {
        await invalidatePushSubscription(delivery.subscription.id);
        await recordPushDelivery(delivery.delivery.id, { state: "invalid", attempts, nextAttemptAt: attemptedAt, lastAttemptAt: attemptedAt, lastErrorCode: error instanceof InvalidPushSubscriptionError ? "subscription-invalid" : "subscription-gone" });
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
