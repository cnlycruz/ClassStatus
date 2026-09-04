import { dispatchPendingPushNotifications } from "@/lib/notifications/dispatch";
import {
  createManualBroadcast,
  type ManualBroadcastInput,
  previewManualBroadcast,
} from "@/lib/notifications/storage";

export async function previewAdminNotification(input: ManualBroadcastInput): Promise<{ recipientCount: number }> {
  return { recipientCount: await previewManualBroadcast(input) };
}

export async function sendAdminNotification(input: ManualBroadcastInput): Promise<{ broadcastId: string; recipientCount: number; created: boolean }> {
  const broadcast = await createManualBroadcast(input);
  // Outbox/delivery errors are intentionally independent of broadcast creation.
  try { await dispatchPendingPushNotifications(); } catch { /* retained for safe retry */ }
  return { broadcastId: broadcast.event.id, recipientCount: broadcast.recipientCount, created: broadcast.created };
}
