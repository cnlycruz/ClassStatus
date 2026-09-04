import type { NextRequest } from "next/server";
import { z } from "zod";
import { getPublicOrigin } from "@/lib/admin/config";
import { readBoundedJson } from "@/lib/admin/requestSecurity";
import { savePushSubscription } from "@/lib/notifications/storage";

const schema = z.object({
  subscription: z.object({ endpoint: z.string().url().max(2048), keys: z.object({ p256dh: z.string().min(16).max(512), auth: z.string().min(8).max(512) }).strict() }).strict(),
  lguIds: z.array(z.string()).min(1).max(17),
}).strict();

function sameOrigin(request: NextRequest) {
  try { return request.headers.get("origin") === getPublicOrigin() && request.headers.get("sec-fetch-site") === "same-origin"; } catch { return false; }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return Response.json({ error: "REQUEST_ORIGIN_REJECTED" }, { status: 403 });
  try {
    const body = schema.parse(await readBoundedJson(request, 8_192));
    const subscription = await savePushSubscription({ endpoint: body.subscription.endpoint, p256dh: body.subscription.keys.p256dh, auth: body.subscription.keys.auth, lguIds: body.lguIds as never });
    return Response.json({ subscriptionId: subscription.id }, { status: 201, headers: { "Cache-Control": "no-store, private" } });
  } catch { return Response.json({ error: "INVALID_SUBSCRIPTION" }, { status: 422, headers: { "Cache-Control": "no-store, private" } }); }
}
