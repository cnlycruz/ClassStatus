import type { NextRequest } from "next/server";
import { runScheduledCollectorWithLease } from "@/collector/execution";
import { isAuthorizedCronRequest } from "@/lib/cron/authorization";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const RESPONSE_HEADERS = { "Cache-Control": "no-store, private" };

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return Response.json(
      { compatible: false, error: "UNAUTHORIZED" },
      { status: 401, headers: RESPONSE_HEADERS }
    );
  }

  // This cutover probe is deliberately static: it acquires no lease, invokes
  // no collector code, and discloses no runtime configuration.
  return Response.json(
    { compatible: true, collectorPolicyVersion: 2 },
    { headers: RESPONSE_HEADERS }
  );
}

export async function POST(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return Response.json(
      { success: false, error: "UNAUTHORIZED" },
      { status: 401, headers: RESPONSE_HEADERS }
    );
  }

  try {
    const result = await runScheduledCollectorWithLease();
    return Response.json(result, { headers: RESPONSE_HEADERS });
  } catch {
    console.error("Scheduled collector execution failed.");
    return Response.json(
      { success: false, error: "COLLECTOR_FAILED" },
      { status: 500, headers: RESPONSE_HEADERS }
    );
  }
}
