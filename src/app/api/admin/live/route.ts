import { z } from "zod";
import { requireAdmin, adminErrorResponse } from "@/lib/admin/requestSecurity";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { getDeploymentNamespace } from "@/lib/storage/driver";

export const dynamic = "force-dynamic";

const trafficSchema = z.object({
  totalVisits: z.coerce.number().int().nonnegative(),
  todayVisits: z.coerce.number().int().nonnegative(),
  last15Minutes: z.coerce.number().int().nonnegative(),
});

const announcementSchema = z.object({
  id: z.string().uuid(),
  message: z.string().min(1).max(120),
  createdAt: z.string(),
  expiresAt: z.string(),
});

export async function GET() {
  try {
    const session = await requireAdmin();
    const client = await createUserSupabaseClient();
    const namespace = getDeploymentNamespace();
    const [trafficResult, announcementResult] = await Promise.all([
      client.rpc(`classstatus_${namespace}_admin_traffic_metrics`),
      client.rpc(`classstatus_${namespace}_list_announcements`, { p_limit: 50 }),
    ]);

    if (trafficResult.error || announcementResult.error) throw new Error("ADMIN_STORAGE_UNAVAILABLE");

    return Response.json({
      session: { csrfToken: session.csrfToken },
      traffic: trafficSchema.parse(trafficResult.data),
      announcements: z.array(announcementSchema).parse(announcementResult.data),
    }, { headers: { "Cache-Control": "no-store, private" } });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
