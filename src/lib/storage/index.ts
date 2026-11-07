import type { SuspensionStore } from "./contracts";
import { localSecurityStore, localStateStore, localSuspensionStore } from "./localJson";
import { getStorageDriver } from "./driver";

// Keep configuration validation on every operation, not just at module load.
export const suspensionStore: SuspensionStore = new Proxy(localSuspensionStore, {
  get(target, property, receiver) {
    getStorageDriver();
    return Reflect.get(target, property, receiver);
  },
});

export { localSecurityStore as securityStore, localStateStore };
export type { SuspensionStore, DeploymentNamespace, CollectedUpsertResult } from "./contracts";
