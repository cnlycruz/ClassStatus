import { createCollectorCapability } from "@/lib/cron/collectorCapability";
import { getDeploymentNamespace } from "@/lib/storage/driver";
import { createPublicSupabaseClient } from "@/lib/supabase/server";

/**
 * Alert storage remains private while avoiding a service-role key at runtime.
 * The browser-facing route signs an operation with the existing cron secret;
 * Supabase validates that proof before exposing no subscription data publicly.
 */
export async function notificationStoreRpc<T>(operation: string, payload: Record<string, unknown>): Promise<T> {
  const namespace = getDeploymentNamespace();
  const { data, error } = await createPublicSupabaseClient().rpc(
    `classstatus_${namespace}_worker_notification_store`,
    // The established signed worker protocol deliberately has a fixed action
    // set. This private, validated payload reuses its durable-log capability
    // without widening anonymous database access.
    createCollectorCapability("logs.append", { operation, ...payload })
  );
  if (error) throw new Error("notification-storage-unavailable");
  return data as T;
}

export async function manualNotificationStoreRpc<T>(operation: string, payload: Record<string, unknown>): Promise<T> {
  const namespace = getDeploymentNamespace();
  const { data, error } = await createPublicSupabaseClient().rpc(
    `classstatus_${namespace}_worker_manual_notification_store`,
    createCollectorCapability("logs.append", { operation, ...payload })
  );
  if (error) throw new Error("notification-storage-unavailable");
  return data as T;
}
