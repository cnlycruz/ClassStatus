import { listAudit } from "@/lib/admin/audit";
import { adminErrorResponse, requireAdmin } from "@/lib/admin/requestSecurity";
import type { NextRequest } from "next/server";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) { try { await requireAdmin(); const { searchParams } = new URL(request.url); const page = Math.max(1, Number.parseInt(searchParams.get("page") || "1", 10) || 1); const limit = Math.max(1, Math.min(50, Number.parseInt(searchParams.get("limit") || "50", 10) || 50)); const result = await (await import("@/lib/storage")).suspensionStore.listAudit(limit, (page - 1) * limit); return Response.json({ entries: result.entries, total: result.total, page, pages: Math.max(1, Math.ceil(result.total / limit)) }, { headers: { "Cache-Control": "no-store, private" } }); } catch (error) { return adminErrorResponse(error); } }
