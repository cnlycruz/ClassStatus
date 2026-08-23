import type { DeploymentNamespace } from "./contracts";

export type StorageDriver = "local-json" | "supabase";

function isVercelRuntime(): boolean {
  return process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV);
}

export function getStorageDriver(): StorageDriver {
  const configured = process.env.CLASSSTATUS_STORAGE_DRIVER?.trim();
  if (isVercelRuntime()) {
    if (configured !== "supabase") throw new Error("ADMIN_STORAGE_UNAVAILABLE");
    return "supabase";
  }
  if (!configured || configured === "local-json") return "local-json";
  if (configured === "supabase") return "supabase";
  throw new Error("ADMIN_STORAGE_UNAVAILABLE");
}

export function getDeploymentNamespace(): DeploymentNamespace {
  if (isVercelRuntime()) {
    if (process.env.VERCEL_ENV === "production") return "production";
    if (process.env.VERCEL_ENV === "preview") return "preview";
    throw new Error("ADMIN_STORAGE_UNAVAILABLE");
  }
  const configured = process.env.CLASSSTATUS_SUPABASE_NAMESPACE?.trim();
  if (configured === "preview" || configured === "production") return configured;
  throw new Error("ADMIN_STORAGE_UNAVAILABLE");
}

export function assertLocalJsonAvailable(): void {
  if (getStorageDriver() !== "local-json" || isVercelRuntime()) {
    throw new Error("ADMIN_STORAGE_UNAVAILABLE");
  }
}

export function isSupabaseStorage(): boolean {
  return getStorageDriver() === "supabase";
}
