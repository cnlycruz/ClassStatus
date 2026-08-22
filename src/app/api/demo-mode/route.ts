import { NextResponse } from "next/server";
import { getSuspensions } from "@/collector/storage";

export async function GET() {
  const records = getSuspensions();
  return NextResponse.json({
    isDemoMode: false,
    totalRecords: records.length,
    demoRecords: 0,
  });
}

export async function POST() {
  return NextResponse.json({ error: "Bulk live-data clearing is unavailable." }, { status: 405, headers: { Allow: "GET" } });
}
