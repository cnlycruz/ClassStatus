import { NextResponse } from "next/server";
import { getCollectorFreshness, getSuspensionHistory, getSuspensions } from "@/collector/storage";
import { buildPublicNcrProjection } from "@/lib/publicNcrProjection";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const [records, freshness, history] = await Promise.all([getSuspensions(), getCollectorFreshness(), getSuspensionHistory()]);
  return NextResponse.json(buildPublicNcrProjection(records, { freshness, history }), {
    headers: { "Cache-Control": "no-store" },
  });
}
