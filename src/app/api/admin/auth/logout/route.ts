import type { NextRequest } from "next/server";
import { appendAudit } from "@/lib/admin/audit";
import { revokeAdminSession } from "@/lib/admin/auth";
import { adminErrorResponse, requireAdminMutation } from "@/lib/admin/requestSecurity";

export async function POST(request: NextRequest) {
  try { const session = await requireAdminMutation(request); let auditError: unknown; try { await appendAudit({ action: "logout", outcome: "success", correlationId: session.id }); } catch (error) { auditError = error; } await revokeAdminSession(); if (auditError) throw auditError; return Response.json({ success: true }, { headers: { "Cache-Control": "no-store, private" } }); }
  catch (error) { return adminErrorResponse(error); }
}
