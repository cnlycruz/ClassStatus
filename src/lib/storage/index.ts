import type { SuspensionStore } from "./contracts";
import { getStorageDriver } from "./driver";
import { localSecurityStore, localStateStore, localSuspensionStore } from "./localJson";

async function selectedStore(): Promise<SuspensionStore> {
  if (getStorageDriver() === "local-json") return localSuspensionStore;
  return (await import("./supabase")).supabaseSuspensionStore;
}

export const suspensionStore: SuspensionStore = {
  async readState() { return (await selectedStore()).readState(); },
  async listPublicRecords() { return (await selectedStore()).listPublicRecords(); },
  async listPublicHistory() { return (await selectedStore()).listPublicHistory(); },
  async createConfirmation(sessionId, payloadHash) { return (await selectedStore()).createConfirmation(sessionId, payloadHash); },
  async publishManual(input) { return (await selectedStore()).publishManual(input); },
  async mutateLifecycle(input) { return (await selectedStore()).mutateLifecycle(input); },
  async reconcileExpiredRemovals(now) { return (await selectedStore()).reconcileExpiredRemovals(now); },
  async appendAudit(entry) { return (await selectedStore()).appendAudit(entry); },
  async listAudit(limit, offset) { return (await selectedStore()).listAudit(limit, offset); },
  async upsertCollected(input) { return (await selectedStore()).upsertCollected(input); },
  async clearCollected() { return (await selectedStore()).clearCollected(); },
  async appendCollectorLogs(logs) { return (await selectedStore()).appendCollectorLogs(logs); },
  async listCollectorLogs(limit) { return (await selectedStore()).listCollectorLogs(limit); },
  async getCollectorFreshness() { return (await selectedStore()).getCollectorFreshness(); },
  async recordSuccessfulCollectorCheck(completedAt) { return (await selectedStore()).recordSuccessfulCollectorCheck(completedAt); },
};

export { localSecurityStore as securityStore, localStateStore };
export type { SuspensionStore, DeploymentNamespace, CollectedUpsertResult } from "./contracts";
