import { NextRequest, NextResponse } from "next/server";
import { globalCollector } from "@/collector/engine";
import { adminErrorResponse, requireAdmin } from "@/lib/admin/requestSecurity";

export async function GET() {
  try { await requireAdmin(); const sources = globalCollector.getSources(); return NextResponse.json({ count: sources.length, sources }, { headers: { "Cache-Control": "no-store, private" } }); }
  catch (error) { return adminErrorResponse(error); }
}

export async function PUT(request: NextRequest) {
  void request;
  return NextResponse.json({ error: "Source mutation is unavailable." }, { status: 405, headers: { Allow: "GET" } });
}
