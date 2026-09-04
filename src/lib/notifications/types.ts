import type { LGUId, SuspensionRecord } from "@/types";
import type { DeploymentNamespace } from "@/lib/storage/contracts";

export type NotificationEventKind = "initial" | "update" | "manual";
export type NotificationDeliveryState = "pending" | "delivered" | "failed" | "invalid";

export interface PushSubscriptionRecord {
  id: string;
  deploymentNamespace: DeploymentNamespace;
  endpoint: string;
  p256dh: string;
  auth: string;
  lguIds: LGUId[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationEvent {
  id: string;
  deploymentNamespace: DeploymentNamespace;
  fingerprint: string;
  familyFingerprint: string;
  kind: NotificationEventKind;
  /** Present for safe automatic publications only. */
  record?: SuspensionRecord;
  /** Private metadata for an intentional admin broadcast. */
  title?: string;
  message?: string;
  recipientMode?: "all" | "selected-lgus";
  targetLguIds?: LGUId[];
  recipientCount?: number;
  manualRequestKey?: string;
  createdAt: string;
}

export interface ManualBroadcastHistoryEntry {
  id: string;
  title: string;
  message: string;
  recipientMode: "all" | "selected-lgus";
  targetLguIds: LGUId[];
  recipientCount: number;
  createdAt: string;
  deliveredCount: number;
  pendingCount: number;
  failedCount: number;
}

export interface NotificationDelivery {
  id: string;
  eventId: string;
  subscriptionId: string;
  state: NotificationDeliveryState;
  attempts: number;
  nextAttemptAt: string;
  lastAttemptAt?: string;
  deliveredAt?: string;
  lastErrorCode?: string;
}

export interface PendingPushDelivery {
  delivery: NotificationDelivery;
  event: NotificationEvent;
  subscription: PushSubscriptionRecord;
}
