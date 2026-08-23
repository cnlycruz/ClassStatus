import { NextRequest, NextResponse } from "next/server";
import { getSuspensions } from "@/collector/storage";
import { evaluateSuspensionLifecycle } from "@/collector/lifecycle";
import { projectPublicSuspension } from "@/lib/admin/publicProjection";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const lguId = searchParams.get("lgu");
  const filterStatus = searchParams.get("status");
  const upcomingOnly = searchParams.get("upcoming") === "true";

  const records = await getSuspensions();

  // Evaluate each record's current lifecycle dynamically
  const evaluated = records.map((r) => {
    const lifecycle = evaluateSuspensionLifecycle(r);
    return {
      ...r,
      lifecycleState: lifecycle.state,
      isActive: lifecycle.isActive,
      isUpcoming: lifecycle.isUpcoming,
      isExpired: lifecycle.isExpired,
    };
  });

  let filtered = evaluated;

  if (lguId) {
    filtered = filtered.filter((r) => r.lguId === lguId);
  }

  if (filterStatus) {
    filtered = filtered.filter((r) => r.status === filterStatus);
  }

  if (upcomingOnly) {
    filtered = filtered.filter((r) => r.isUpcoming);
  }

  return NextResponse.json({
    count: filtered.length,
    data: filtered.map(projectPublicSuspension),
  });
}

export async function POST(request: NextRequest) {
  void request;
  return NextResponse.json(
    { error: "Live suspensions are read-only and may only be written by the Tier 3 collector pipeline." },
    { status: 405, headers: { Allow: "GET" } }
  );
}
