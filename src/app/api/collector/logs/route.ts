import { NextResponse } from "next/server";
import { getCollectorLogs } from "@/collector/storage";
import { adminErrorResponse, requireAdmin } from "@/lib/admin/requestSecurity";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
    const logs = getCollectorLogs();
    return NextResponse.json(
    {
      count: logs.length,
      logs,
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
    );
  } catch (error) { return adminErrorResponse(error); }
}
