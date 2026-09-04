import type { NextRequest } from "next/server";
import { z } from "zod";
import { previewAdminNotification, RecipientPreviewUnavailableError } from "@/lib/admin/notifications";
import { adminErrorResponse, readBoundedJson, requireAdminMutation } from "@/lib/admin/requestSecurity";

const schema = z.object({ requestKey: z.string().uuid(), title: z.string().max(100).optional(), message: z.string().trim().min(1).max(500), recipientMode: z.enum(["all", "selected-lgus"]), targetLguIds: z.array(z.string()).max(17) }).strict();
const noStore = { "Cache-Control": "no-store, private" };

function invalidNotificationResponse() {
  return Response.json({ error: "INVALID_NOTIFICATION" }, { status: 422, headers: noStore });
}

function isInvalidNotificationError(error: unknown): boolean {
  return error instanceof z.ZodError || error instanceof Error && (error.message === "manual-notification-invalid" || error.message === "notification-lgu-preferences-invalid");
}

export async function POST(request: NextRequest) {
  try {
    await requireAdminMutation(request);
    const input = schema.parse(await readBoundedJson(request, 4_096)) as never;
    const preview = await previewAdminNotification(input);
    return Response.json({ available: true, recipientCount: preview.recipientCount }, { headers: noStore });
  } catch (error) {
    if (isInvalidNotificationError(error)) return invalidNotificationResponse();
    if (error instanceof RecipientPreviewUnavailableError) {
      return Response.json({ available: false, recipientCount: null }, { headers: noStore });
    }
    return adminErrorResponse(error);
  }
}
