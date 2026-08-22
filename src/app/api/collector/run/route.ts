import type { NextRequest } from "next/server";
import { globalCollector } from "@/collector/engine";
import { adminErrorResponse, requireAdminMutation } from "@/lib/admin/requestSecurity";

export async function POST(request: NextRequest) {
  try {
    await requireAdminMutation(request);
    const summary = await globalCollector.runSweep();
    return Response.json({
      success: true,
      summary,
    }, { headers: { "Cache-Control": "no-store, private" } });
  } catch (err) { return adminErrorResponse(err); }
}
