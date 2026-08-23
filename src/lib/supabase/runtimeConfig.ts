import { getStorageDriver } from "@/lib/storage/driver";

export interface SupabaseRuntimeConfig {
  url: string;
  publishableKey: string;
}

export function getSupabaseRuntimeConfig(): SupabaseRuntimeConfig {
  if (getStorageDriver() !== "supabase") throw new Error("ADMIN_STORAGE_UNAVAILABLE");
  const urlText = process.env.SUPABASE_URL?.trim();
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!urlText || !publishableKey) throw new Error("ADMIN_STORAGE_UNAVAILABLE");
  try {
    const url = new URL(urlText);
    if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash) throw new Error();
    return { url: url.origin, publishableKey };
  } catch { throw new Error("ADMIN_STORAGE_UNAVAILABLE"); }
}
