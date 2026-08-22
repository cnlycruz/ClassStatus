import type { NextRequest } from "next/server";
import { z } from "zod";
import { appendAudit } from "@/lib/admin/audit";
import { checkLoginThrottle, issueAdminSession, recordLoginFailure, revokeAdminSession, verifyAdminCredentials, verifyLoginChallenge } from "@/lib/admin/auth";
import { getAdminConfig } from "@/lib/admin/config";
import { AdminHttpError, adminErrorResponse, readBoundedJson } from "@/lib/admin/requestSecurity";

const schema = z.object({ username: z.string().min(1).max(128), password: z.string().min(1).max(128), challenge: z.string().min(1).max(512) }).strict();
export async function POST(request: NextRequest) {
  try {
    const config = getAdminConfig();
    if (request.headers.get("origin") !== config.publicOrigin || request.headers.get("sec-fetch-site") !== "same-origin") throw new AdminHttpError(403, "REQUEST_ORIGIN_REJECTED");
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new AdminHttpError(403, "JSON_REQUIRED");
    if (Number(request.headers.get("content-length") || 0) > 4096) throw new AdminHttpError(413, "REQUEST_TOO_LARGE");
    let body: z.infer<typeof schema>;
    try { body = schema.parse(await readBoundedJson(request, 4096)); } catch { throw new AdminHttpError(401, "AUTHENTICATION_FAILED"); }
    if (!verifyLoginChallenge(body.challenge)) throw new AdminHttpError(403, "LOGIN_CHALLENGE_REJECTED");
    const normalizedUsername = body.username.normalize("NFKC").trim();
    const throttle = checkLoginThrottle(normalizedUsername);
    if (!throttle.allowed) return Response.json({ success: false, error: "AUTHENTICATION_FAILED", retryAfterSeconds: throttle.retryAfterSeconds }, { status: 429, headers: { "Cache-Control": "no-store, private", "Retry-After": String(throttle.retryAfterSeconds || 30) } });
    const valid = await verifyAdminCredentials(normalizedUsername, body.password);
    if (!valid) {
      recordLoginFailure(normalizedUsername);
      try { appendAudit({ action: "login", outcome: "failure", reasonCode: "invalid-credentials" }); } catch { /* security storage remains authoritative */ }
      return Response.json({ success: false, error: "AUTHENTICATION_FAILED" }, { status: 401, headers: { "Cache-Control": "no-store, private" } });
    }
    const session = await issueAdminSession();
    try { appendAudit({ action: "login", outcome: "success", correlationId: session.id }); }
    catch (error) { await revokeAdminSession(); throw error; }
    return Response.json({ success: true, destination: "/collector" }, { headers: { "Cache-Control": "no-store, private" } });
  } catch (error) { return adminErrorResponse(error); }
}
