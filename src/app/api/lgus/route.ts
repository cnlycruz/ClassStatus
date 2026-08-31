import { NextResponse } from "next/server";
import { getSuspensions } from "@/collector/storage";
import { buildPublicNcrProjection } from "@/lib/publicNcrProjection";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const records = await getSuspensions();
  return NextResponse.json(buildPublicNcrProjection(records), {
    headers: { "Cache-Control": "no-store" },
  });
}
