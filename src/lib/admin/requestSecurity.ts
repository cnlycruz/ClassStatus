import type { NextRequest } from "next/server";
import { getAdminConfig, getConfiguredAdminUserId, getPublicOrigin, getSecurityPepper } from "./config";
import { getAdminSession } from "./auth";
import { safeEqual } from "./crypto";
import { securityStore } from "@/lib/storage";
import { getDeploymentNamespace, getStorageDriver } from "@/lib/storage/driver";
import { getSupabaseRuntimeConfig } from "@/lib/supabase/runtimeConfig";

export class AdminHttpError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}

function assertAdminRuntime(): void {
  const driver = getStorageDriver();
  getPublicOrigin();
  if (driver === "local-json") {
    getAdminConfig();
    securityStore.readSecurity();
    return;
  }
  getDeploymentNamespace();
  getSupabaseRuntimeConfig();
  getConfiguredAdminUserId();
  getSecurityPepper();
}

export async function requireAdmin(): Promise<NonNullable<Awaited<ReturnType<typeof getAdminSession>>>> {
  try { assertAdminRuntime(); }
  catch { throw new AdminHttpError(503, "ADMIN_UNAVAILABLE"); }
  const session = await getAdminSession();
  if (!session) throw new AdminHttpError(401, "UNAUTHENTICATED");
  return session;
}

export async function requireAdminMutation(request: NextRequest) {
  let publicOrigin; try { assertAdminRuntime(); publicOrigin = getPublicOrigin(); } catch { throw new AdminHttpError(503, "ADMIN_UNAVAILABLE"); }
  const session = await requireAdmin();
  validateMutationEnvelope(request, publicOrigin, session.csrfToken);
  return session;
}

export function validateMutationEnvelope(request: NextRequest, publicOrigin: string, expectedCsrf: string): void {
  if (request.headers.get("origin") !== publicOrigin || request.headers.get("sec-fetch-site") !== "same-origin") throw new AdminHttpError(403, "REQUEST_ORIGIN_REJECTED");
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new AdminHttpError(403, "JSON_REQUIRED");
  const csrf = request.headers.get("x-csrf-token") || "";
  if (!csrf || !safeEqual(csrf, expectedCsrf)) throw new AdminHttpError(403, "CSRF_REJECTED");
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 16_384) throw new AdminHttpError(413, "REQUEST_TOO_LARGE");
}

export async function readBoundedJson(request: NextRequest, maximumBytes = 16_384): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new AdminHttpError(422, "INVALID_JSON");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytesRead = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > maximumBytes) throw new AdminHttpError(413, "REQUEST_TOO_LARGE");
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text);
  } catch (error) {
    // Do not drain a chunked/lying-length request after reaching its budget.
    // Cancellation must not delay the rejection if a transport stalls.
    void reader.cancel().catch(() => undefined);
    if (error instanceof AdminHttpError) throw error;
    throw new AdminHttpError(422, "INVALID_JSON");
  } finally {
    reader.releaseLock();
  }
}

export function adminErrorResponse(error: unknown): Response {
  const status = error instanceof AdminHttpError ? error.status : error instanceof Error && error.message.includes("UNAVAILABLE") ? 503 : 500;
  const code = error instanceof AdminHttpError ? error.code : status === 503 ? "ADMIN_UNAVAILABLE" : "INTERNAL_ERROR";
  return Response.json({ success: false, error: code }, { status, headers: { "Cache-Control": "no-store, private" } });
}
