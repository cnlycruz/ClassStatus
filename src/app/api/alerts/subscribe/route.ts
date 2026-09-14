import type { NextRequest } from "next/server";
import { z } from "zod";
import { ALL_LGU_IDS } from "@/data/lgus";
import { getPublicOrigin } from "@/lib/admin/config";
import { AdminHttpError, readBoundedJson } from "@/lib/admin/requestSecurity";
import { pushRegistrationIdentityHash, PushRegistrationRateLimitError } from "@/lib/notifications/registrationSecurity";
import { registerPushSubscription } from "@/lib/notifications/storage";
import { InvalidPushSubscriptionError, validatePushSubscription } from "@/lib/notifications/subscriptionValidation";
import type { LGUId } from "@/types";

const MAXIMUM_BODY_BYTES = 8_192;
const lguIds = new Set<string>(ALL_LGU_IDS);
const schema = z.object({
  subscription: z.object({ endpoint: z.string().min(1).max(2048), keys: z.object({ p256dh: z.string().length(87), auth: z.string().length(22) }).strict() }).strict(),
  lguIds: z.array(z.string().refine((value) => lguIds.has(value))).min(1).max(17)
    .refine((values) => new Set(values).size === values.length),
}).strict();

function sameOrigin(request: NextRequest) {
  try { return request.headers.get("origin") === getPublicOrigin() && request.headers.get("sec-fetch-site") === "same-origin"; } catch { return false; }
}

function response(error: string, status: number, retryAfter?: number) {
  const headers: Record<string, string> = { "Cache-Control": "no-store, private" };
  if (retryAfter) headers["Retry-After"] = String(retryAfter);
  return Response.json({ error }, { status, headers });
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return response("REQUEST_ORIGIN_REJECTED", 403);
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    return response("JSON_REQUIRED", 415);
  }
  const contentLength = request.headers.get("content-length");
  if (contentLength && (!/^\d+$/.test(contentLength) || Number(contentLength) > MAXIMUM_BODY_BYTES)) {
    return response(Number(contentLength) > MAXIMUM_BODY_BYTES ? "REQUEST_TOO_LARGE" : "INVALID_SUBSCRIPTION", Number(contentLength) > MAXIMUM_BODY_BYTES ? 413 : 422);
  }
  try {
    const body = schema.parse(await readBoundedJson(request, MAXIMUM_BODY_BYTES));
    const input = { endpoint: body.subscription.endpoint, p256dh: body.subscription.keys.p256dh, auth: body.subscription.keys.auth, lguIds: body.lguIds as LGUId[] };
    validatePushSubscription(input);
    const subscription = await registerPushSubscription(input, pushRegistrationIdentityHash(request));
    return Response.json({ subscriptionId: subscription.id }, { status: 201, headers: { "Cache-Control": "no-store, private" } });
  } catch (error) {
    if (error instanceof PushRegistrationRateLimitError) return response("RATE_LIMITED", 429, error.retryAfterSeconds);
    if (error instanceof AdminHttpError && error.status === 413) return response("REQUEST_TOO_LARGE", 413);
    if (error instanceof AdminHttpError || error instanceof z.ZodError || error instanceof InvalidPushSubscriptionError) {
      return response("INVALID_SUBSCRIPTION", 422);
    }
    return response("SUBSCRIPTION_UNAVAILABLE", 503);
  }
}
