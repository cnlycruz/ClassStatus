import type { NextRequest } from "next/server";
import { runCollectorWithLease } from "@/collector/execution";
import { adminErrorResponse, requireAdminMutation } from "@/lib/admin/requestSecurity";

export async function POST(request: NextRequest) {
  try {
    await requireAdminMutation(request);
    const result = await runCollectorWithLease();
    if (result.skipped) {
      return Response.json({
        success: false,
        error: "COLLECTOR_ALREADY_RUNNING",
      }, { status: 409, headers: { "Cache-Control": "no-store, private" } });
    }
    return Response.json({
      success: true,
      summary: result.summary,
    }, { headers: { "Cache-Control": "no-store, private" } });
  } catch (err) { return adminErrorResponse(err); }
}
