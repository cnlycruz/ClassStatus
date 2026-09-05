import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import lockfile from "proper-lockfile";
import type { LGUId, SuspensionRecord } from "@/types";
import { ALL_LGU_IDS } from "@/data/lgus";
import type { DeploymentNamespace } from "@/lib/storage";
import { getDeploymentNamespace, getStorageDriver } from "@/lib/storage/driver";
import { manualNotificationStoreRpc, notificationStoreRpc } from "./supabaseRpc";
import { notificationFamilyFingerprint, notificationFingerprint } from "./fingerprint";
import { validatePushSubscription } from "./subscriptionValidation";
import type { ManualBroadcastHistoryEntry, NotificationDelivery, NotificationEvent, NotificationEventKind, PendingPushDelivery, PushSubscriptionRecord } from "./types";

interface LocalNotificationDocument {
  schemaVersion: 1;
  subscriptions: PushSubscriptionRecord[];
  events: NotificationEvent[];
  deliveries: NotificationDelivery[];
}

const EMPTY: LocalNotificationDocument = { schemaVersion: 1, subscriptions: [], events: [], deliveries: [] };
const lguSet = new Set<string>(ALL_LGU_IDS);

function localFile() {
  return path.join(path.resolve(process.env.CLASSSTATUS_DATA_DIR || path.join(process.cwd(), "data")), "push_notifications.json");
}

function readLocal(): LocalNotificationDocument {
  const file = localFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, `${JSON.stringify(EMPTY, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
  return JSON.parse(fs.readFileSync(file, "utf8")) as LocalNotificationDocument;
}

function writeLocal(value: LocalNotificationDocument) {
  const file = localFile();
  const temp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${randomUUID()}.tmp`);
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
  fs.renameSync(temp, file);
}

async function mutateLocal<T>(operation: (state: LocalNotificationDocument) => T): Promise<T> {
  const file = localFile();
  readLocal();
  const release = await lockfile.lock(file, { realpath: false, stale: 10_000, retries: { retries: 5, minTimeout: 10, maxTimeout: 75 } });
  try {
    const state = readLocal();
    const result = operation(state);
    writeLocal(state);
    return result;
  } finally { await release(); }
}

function namespace(): DeploymentNamespace {
  if (getStorageDriver() === "local-json") return process.env.CLASSSTATUS_SUPABASE_NAMESPACE === "production" ? "production" : "preview";
  return getDeploymentNamespace();
}

function cleanLguIds(ids: LGUId[]): LGUId[] {
  const values = [...new Set(ids)].filter((id): id is LGUId => lguSet.has(id));
  if (!values.length) throw new Error("notification-lgu-preferences-invalid");
  return values;
}

export async function savePushSubscription(input: { endpoint: string; p256dh: string; auth: string; lguIds: LGUId[] }): Promise<PushSubscriptionRecord> {
  // This is the shared persistence boundary, not only an HTTP-route concern.
  // Future server callers must not be able to bypass destination/key checks.
  validatePushSubscription(input);
  const value = { ...input, lguIds: cleanLguIds(input.lguIds) };
  const deploymentNamespace = namespace();
  const now = new Date().toISOString();
  if (getStorageDriver() === "local-json") return mutateLocal((state) => {
    const prior = state.subscriptions.find((subscription) => subscription.deploymentNamespace === deploymentNamespace && subscription.endpoint === value.endpoint);
    if (prior) {
      Object.assign(prior, value, { active: true, updatedAt: now });
      return { ...prior };
    }
    const created: PushSubscriptionRecord = { id: randomUUID(), deploymentNamespace, ...value, active: true, createdAt: now, updatedAt: now };
    state.subscriptions.push(created);
    return { ...created };
  });
  const data = await notificationStoreRpc<{ id: string; createdAt: string; updatedAt: string }>("save-subscription", { endpoint: value.endpoint, p256dh: value.p256dh, auth: value.auth, lguIds: value.lguIds, now });
  return { id: data.id, deploymentNamespace, ...value, active: true, createdAt: data.createdAt, updatedAt: data.updatedAt };
}

export async function updatePushPreferences(id: string, lguIds: LGUId[]): Promise<boolean> {
  const values = cleanLguIds(lguIds); const deploymentNamespace = namespace(); const now = new Date().toISOString();
  if (getStorageDriver() === "local-json") return mutateLocal((state) => {
    const subscription = state.subscriptions.find((item) => item.id === id && item.deploymentNamespace === deploymentNamespace && item.active);
    if (!subscription) return false;
    subscription.lguIds = values; subscription.updatedAt = now; return true;
  });
  return notificationStoreRpc<boolean>("update-preferences", { id, lguIds: values, now });
}

export async function deactivatePushSubscription(id: string): Promise<void> {
  const deploymentNamespace = namespace(); const now = new Date().toISOString();
  if (getStorageDriver() === "local-json") { await mutateLocal((state) => { const item = state.subscriptions.find((subscription) => subscription.id === id && subscription.deploymentNamespace === deploymentNamespace); if (item) { item.active = false; item.updatedAt = now; } }); return; }
  await notificationStoreRpc("deactivate-subscription", { id, now });
}

export async function createNotificationEvent(record: SuspensionRecord): Promise<{ event: NotificationEvent; created: boolean }> {
  const deploymentNamespace = namespace(); const fingerprint = notificationFingerprint(deploymentNamespace, record); const familyFingerprint = notificationFamilyFingerprint(deploymentNamespace, record); const now = new Date().toISOString();
  if (getStorageDriver() === "local-json") return mutateLocal((state) => {
    const prior = state.events.find((event) => event.deploymentNamespace === deploymentNamespace && event.fingerprint === fingerprint);
    if (prior) return { event: { ...prior }, created: false };
    const kind: NotificationEventKind = state.events.some((event) => event.deploymentNamespace === deploymentNamespace && event.familyFingerprint === familyFingerprint) ? "update" : "initial";
    const event: NotificationEvent = { id: randomUUID(), deploymentNamespace, fingerprint, familyFingerprint, kind, record, createdAt: now };
    state.events.push(event);
    for (const subscription of state.subscriptions.filter((item) => item.deploymentNamespace === deploymentNamespace && item.active && item.lguIds.includes(record.lguId))) {
      state.deliveries.push({ id: randomUUID(), eventId: event.id, subscriptionId: subscription.id, state: "pending", attempts: 0, nextAttemptAt: now });
    }
    return { event, created: true };
  });
  const data = await notificationStoreRpc<{ id: string; kind: NotificationEventKind; createdAt: string; created: boolean }>("create-event", { fingerprint, familyFingerprint, record, now });
  return { event: { id: data.id, deploymentNamespace, fingerprint, familyFingerprint, kind: data.kind, record, createdAt: data.createdAt }, created: data.created };
}

export async function listPendingPushDeliveries(now = new Date(), limit = 100): Promise<PendingPushDelivery[]> {
  if (getStorageDriver() === "local-json") {
    const deploymentNamespace = namespace();
    const state = readLocal(); const events = new Map(state.events.map((event) => [event.id, event])); const subscriptions = new Map(state.subscriptions.map((subscription) => [subscription.id, subscription]));
    return state.deliveries.filter((delivery) => (delivery.state === "pending" || delivery.state === "failed") && Date.parse(delivery.nextAttemptAt) <= now.getTime()).flatMap((delivery) => {
      const event = events.get(delivery.eventId); const subscription = subscriptions.get(delivery.subscriptionId);
      return event?.deploymentNamespace === deploymentNamespace && subscription?.deploymentNamespace === deploymentNamespace && subscription.active
        ? [{ delivery: { ...delivery }, event: { ...event }, subscription: { ...subscription } }] : [];
    }).slice(0, Math.max(1, Math.min(limit, 100)));
  }
  return notificationStoreRpc<PendingPushDelivery[]>("list-pending", { now: now.toISOString(), limit });
}

export async function recordPushDelivery(id: string, update: Pick<NotificationDelivery, "state" | "attempts" | "nextAttemptAt"> & Partial<Pick<NotificationDelivery, "lastAttemptAt" | "deliveredAt" | "lastErrorCode">>): Promise<void> {
  if (getStorageDriver() === "local-json") {
    const deploymentNamespace = namespace();
    await mutateLocal((state) => {
      const delivery = state.deliveries.find((item) => item.id === id);
      if (delivery && state.events.some((event) => event.id === delivery.eventId && event.deploymentNamespace === deploymentNamespace)
        && state.subscriptions.some((subscription) => subscription.id === delivery.subscriptionId && subscription.deploymentNamespace === deploymentNamespace)) Object.assign(delivery, update);
    }); return;
  }
  await notificationStoreRpc("record-delivery", { id, update });
}

export async function invalidatePushSubscription(id: string): Promise<void> { await deactivatePushSubscription(id); }

export interface ManualBroadcastInput {
  requestKey: string;
  title?: string;
  message: string;
  recipientMode: "all" | "selected-lgus";
  targetLguIds: LGUId[];
}

function cleanManualInput(input: ManualBroadcastInput): Required<Omit<ManualBroadcastInput, "title">> & { title: string } {
  const message = input.message.trim();
  const title = input.title?.trim() || "Class Status";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestKey) || !message || message.length > 500 || title.length > 100) throw new Error("manual-notification-invalid");
  const targetLguIds = input.recipientMode === "all" ? [] : cleanLguIds(input.targetLguIds);
  return { ...input, title, message, targetLguIds };
}

export async function previewManualBroadcast(input: ManualBroadcastInput): Promise<number> {
  const value = cleanManualInput(input); const deploymentNamespace = namespace();
  if (getStorageDriver() === "local-json") return readLocal().subscriptions.filter((subscription) => subscription.deploymentNamespace === deploymentNamespace && subscription.active && (value.recipientMode === "all" || subscription.lguIds.some((id) => value.targetLguIds.includes(id)))).length;
  return manualNotificationStoreRpc<number>("preview-manual", value);
}

export async function createManualBroadcast(input: ManualBroadcastInput): Promise<{ event: NotificationEvent; created: boolean; recipientCount: number }> {
  const value = cleanManualInput(input); const deploymentNamespace = namespace(); const now = new Date().toISOString();
  if (getStorageDriver() === "local-json") return mutateLocal((state) => {
    const prior = state.events.find((event) => event.deploymentNamespace === deploymentNamespace && event.kind === "manual" && event.manualRequestKey === value.requestKey);
    if (prior) return { event: { ...prior }, created: false, recipientCount: prior.recipientCount || 0 };
    const recipients = state.subscriptions.filter((subscription) => subscription.deploymentNamespace === deploymentNamespace && subscription.active && (value.recipientMode === "all" || subscription.lguIds.some((id) => value.targetLguIds.includes(id))));
    const event: NotificationEvent = { id: randomUUID(), deploymentNamespace, fingerprint: `manual:${value.requestKey}`, familyFingerprint: `manual:${value.requestKey}`, kind: "manual", title: value.title, message: value.message, recipientMode: value.recipientMode, targetLguIds: value.targetLguIds, recipientCount: recipients.length, manualRequestKey: value.requestKey, createdAt: now };
    state.events.push(event);
    for (const subscription of recipients) state.deliveries.push({ id: randomUUID(), eventId: event.id, subscriptionId: subscription.id, state: "pending", attempts: 0, nextAttemptAt: now });
    return { event, created: true, recipientCount: recipients.length };
  });
  return manualNotificationStoreRpc("create-manual", { ...value, now });
}

export async function listManualBroadcastHistory(limit = 10): Promise<ManualBroadcastHistoryEntry[]> {
  const deploymentNamespace = namespace();
  if (getStorageDriver() === "local-json") {
    const state = readLocal();
    return state.events.filter((event) => event.deploymentNamespace === deploymentNamespace && event.kind === "manual").sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)).slice(0, Math.max(1, Math.min(limit, 20))).map((event) => {
      const deliveries = state.deliveries.filter((delivery) => delivery.eventId === event.id);
      return { id: event.id, title: event.title || "Class Status Announcement", message: event.message || "", recipientMode: event.recipientMode || "all", targetLguIds: event.targetLguIds || [], recipientCount: event.recipientCount || deliveries.length, createdAt: event.createdAt, deliveredCount: deliveries.filter((delivery) => delivery.state === "delivered").length, pendingCount: deliveries.filter((delivery) => delivery.state === "pending" || delivery.state === "failed").length, failedCount: deliveries.filter((delivery) => delivery.state === "failed").length };
    });
  }
  return manualNotificationStoreRpc<ManualBroadcastHistoryEntry[]>("list-manual-history", { limit: Math.max(1, Math.min(limit, 20)) });
}
