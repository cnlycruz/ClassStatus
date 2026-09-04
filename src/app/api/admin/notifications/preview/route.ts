import type { NextRequest } from "next/server";
import { z } from "zod";
import { previewAdminNotification } from "@/lib/admin/notifications";
import { adminErrorResponse, readBoundedJson, requireAdminMutation } from "@/lib/admin/requestSecurity";

const schema = z.object({ requestKey: z.string().uuid(), title: z.string().max(100).optional(), message: z.string().trim().min(1).max(500), recipientMode: z.enum(["all", "selected-lgus"]), targetLguIds: z.array(z.string()).max(17) }).strict();

export async function POST(request: NextRequest) {
  try { await requireAdminMutation(request); return Response.json(await previewAdminNotification(schema.parse(await readBoundedJson(request, 4_096)) as never), { headers: { "Cache-Control": "no-store, private" } }); }
  catch (error) { if (error instanceof z.ZodError || error instanceof Error && error.message === "manual-notification-invalid") return Response.json({ error: "INVALID_NOTIFICATION" }, { status: 422, headers: { "Cache-Control": "no-store, private" } }); return adminErrorResponse(error); }
}
