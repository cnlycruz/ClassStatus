import { listAudit } from "@/lib/admin/audit";
import { adminErrorResponse, requireAdmin } from "@/lib/admin/requestSecurity";
import type { NextRequest } from "next/server";
import { suspensionStore } from "@/lib/storage";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) { try { await requireAdmin(); const { searchParams } = new URL(request.url); const page = Math.max(1, Number.parseInt(searchParams.get("page") || "1", 10) || 1); const limit = Math.max(1, Math.min(50, Number.parseInt(searchParams.get("limit") || "50", 10) || 50)); const all = suspensionStore.readState().audit; const start = (page - 1) * limit; return Response.json({ entries: all.slice(start, start + limit), total: all.length, page, pages: Math.max(1, Math.ceil(all.length / limit)) }, { headers: { "Cache-Control": "no-store, private" } }); } catch (error) { return adminErrorResponse(error); } }
