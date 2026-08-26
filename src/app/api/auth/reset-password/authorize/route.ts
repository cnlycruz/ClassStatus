import type { NextRequest } from "next/server";
import { getConfiguredAdminUserId, getPublicOrigin } from "@/lib/admin/config";
import { createPublicSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const MAX_AUTHORIZATION_HEADER_LENGTH = 8_192;
const RESPONSE_HEADERS = { "Cache-Control": "no-store, private" };

function authorizationResponse(authorized: boolean): Response {
  return Response.json(
    { authorized },
    { status: authorized ? 200 : 401, headers: RESPONSE_HEADERS }
  );
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    if (
      request.headers.get("origin") !== getPublicOrigin()
      || request.headers.get("sec-fetch-site") !== "same-origin"
    ) return authorizationResponse(false);

    const authorization = request.headers.get("authorization");
    if (!authorization || authorization.length > MAX_AUTHORIZATION_HEADER_LENGTH) {
      return authorizationResponse(false);
    }

    const match = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(authorization);
    if (!match) return authorizationResponse(false);

    const { data, error } = await createPublicSupabaseClient().auth.getUser(match[1]);
    if (error || data.user?.id.toLowerCase() !== getConfiguredAdminUserId()) {
      return authorizationResponse(false);
    }

    return authorizationResponse(true);
  } catch {
    return authorizationResponse(false);
  }
}
