import type { DeploymentNamespace } from "./contracts";

export type StorageDriver = "local-json";

// Stale hosted settings must fail closed rather than redirect writes silently.
export function getStorageDriver(): StorageDriver {
  const value = process.env.CLASSSTATUS_STORAGE_DRIVER?.trim();
  if (value && value !== "local-json") throw new Error("ADMIN_STORAGE_UNAVAILABLE");
  return "local-json";
}

// Preview and production are historical internal data partition labels only.
export function getDeploymentNamespace(): DeploymentNamespace {
  const value = process.env.CLASSSTATUS_LOCAL_NAMESPACE?.trim();
  if (!value || value === "preview") return "preview";
  if (value === "production") return "production";
  throw new Error("ADMIN_STORAGE_UNAVAILABLE");
}

export function assertLocalJsonAvailable(): void {
  getStorageDriver();
}
