import type { NextRequest } from "next/server";
import { z } from "zod";
import { appendAudit } from "@/lib/admin/audit";
import {
  adminErrorResponse,
  readBoundedJson,
  requireAdminMutation,
} from "@/lib/admin/requestSecurity";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { getDeploymentNamespace } from "@/lib/storage/driver";

export const dynamic = "force-dynamic";

const inputSchema = z.object({
  message: z.string().trim().min(1).max(120),
}).strict();

const announcementSchema = z.object({
  id: z.string().uuid(),
  message: z.string().min(1).max(120),
  createdAt: z.string(),
  expiresAt: z.string(),
});

export async function POST(request: NextRequest) {
  try {
    await requireAdminMutation(request);
    const input = inputSchema.parse(await readBoundedJson(request, 2048));
    const client = await createUserSupabaseClient();
    const namespace = getDeploymentNamespace();
    const { data, error } = await client.rpc(
      `classstatus_${namespace}_create_announcement`,
      { p_message: input.message }
    );
    if (error) throw new Error("ADMIN_STORAGE_UNAVAILABLE");
    const announcement = announcementSchema.parse(data);
    await appendAudit({
      action: "send-announcement",
      outcome: "success",
      targetSummary: input.message,
      effectiveAt: announcement.createdAt,
    });
    return Response.json(
      { success: true, announcement },
      { headers: { "Cache-Control": "no-store, private" } }
    );
  } catch (error) {
    return adminErrorResponse(error);
  }
}
