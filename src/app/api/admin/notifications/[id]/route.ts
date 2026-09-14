import type { NextRequest } from "next/server";
import { z } from "zod";
import { appendAudit } from "@/lib/admin/audit";
import { adminErrorResponse, readBoundedJson, requireAdminMutation } from "@/lib/admin/requestSecurity";
import { deleteManualBroadcastHistory } from "@/lib/notifications/storage";

const bodySchema = z.object({}).strict();
const idSchema = z.string().uuid();

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminMutation(request);
    bodySchema.parse(await readBoundedJson(request, 256));
    const { id: rawId } = await context.params;
    const id = idSchema.parse(rawId);
    await deleteManualBroadcastHistory(id);
    await appendAudit({ action: "manual-broadcast-deletion", outcome: "success", recordId: id, targetSummary: "Manual broadcast history", correlationId: id });
    return Response.json({ deleted: true }, { headers: { "Cache-Control": "no-store, private" } });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof Error && (error.message === "manual-notification-history-invalid" || error.message === "manual-notification-history-not-found")) {
      return Response.json({ error: "MANUAL_BROADCAST_NOT_FOUND" }, { status: 404, headers: { "Cache-Control": "no-store, private" } });
    }
    return adminErrorResponse(error);
  }
}
