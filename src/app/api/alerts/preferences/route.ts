import type { NextRequest } from "next/server";
import { z } from "zod";
import { getPublicOrigin } from "@/lib/admin/config";
import { readBoundedJson } from "@/lib/admin/requestSecurity";
import { deactivatePushSubscription, updatePushPreferences } from "@/lib/notifications/storage";

const idSchema = z.string().uuid();
function sameOrigin(request: NextRequest) { try { return request.headers.get("origin") === getPublicOrigin() && request.headers.get("sec-fetch-site") === "same-origin"; } catch { return false; } }

export async function PATCH(request: NextRequest) {
  if (!sameOrigin(request)) return Response.json({ error: "REQUEST_ORIGIN_REJECTED" }, { status: 403 });
  try {
    const body = z.object({ subscriptionId: idSchema, lguIds: z.array(z.string()).min(1).max(17) }).strict().parse(await readBoundedJson(request, 4_096));
    await updatePushPreferences(body.subscriptionId, body.lguIds as never);
    return Response.json({ success: true }, { headers: { "Cache-Control": "no-store, private" } });
  } catch { return Response.json({ error: "INVALID_PREFERENCES" }, { status: 422 }); }
}

export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request)) return Response.json({ error: "REQUEST_ORIGIN_REJECTED" }, { status: 403 });
  try {
    const body = z.object({ subscriptionId: idSchema }).strict().parse(await readBoundedJson(request, 1_024));
    await deactivatePushSubscription(body.subscriptionId);
    return Response.json({ success: true }, { headers: { "Cache-Control": "no-store, private" } });
  } catch { return Response.json({ error: "INVALID_SUBSCRIPTION" }, { status: 422 }); }
}
