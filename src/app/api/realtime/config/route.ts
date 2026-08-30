import { getDeploymentNamespace } from "@/lib/storage/driver";
import { getSupabaseRuntimeConfig } from "@/lib/supabase/runtimeConfig";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { url, publishableKey } = getSupabaseRuntimeConfig();
    return Response.json(
      { url, publishableKey, namespace: getDeploymentNamespace() },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return Response.json(
      { error: "REALTIME_UNAVAILABLE" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
