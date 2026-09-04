import { dispatchPendingPushNotifications } from "@/lib/notifications/dispatch";
import {
  createManualBroadcast,
  type ManualBroadcastInput,
  previewManualBroadcast,
} from "@/lib/notifications/storage";

/**
 * Recipient counts are only an administrator convenience. A broadcast still
 * calculates recipients authoritatively when it is created, so callers can
 * safely continue when the count store is temporarily unavailable.
 */
export class RecipientPreviewUnavailableError extends Error {
  constructor() {
    super("recipient-preview-unavailable");
    this.name = "RecipientPreviewUnavailableError";
  }
}

export async function previewAdminNotification(input: ManualBroadcastInput): Promise<{ recipientCount: number }> {
  try {
    return { recipientCount: await previewManualBroadcast(input) };
  } catch (error) {
    // The storage RPC intentionally conceals its database details. Reclassify
    // only that known operational failure; validation and security failures
    // must retain their normal route-level responses.
    if (error instanceof Error && error.message === "notification-storage-unavailable") {
      throw new RecipientPreviewUnavailableError();
    }
    throw error;
  }
}

export async function sendAdminNotification(input: ManualBroadcastInput): Promise<{ broadcastId: string; recipientCount: number; created: boolean }> {
  const broadcast = await createManualBroadcast(input);
  // Outbox/delivery errors are intentionally independent of broadcast creation.
  try { await dispatchPendingPushNotifications(); } catch { /* retained for safe retry */ }
  return { broadcastId: broadcast.event.id, recipientCount: broadcast.recipientCount, created: broadcast.created };
}
