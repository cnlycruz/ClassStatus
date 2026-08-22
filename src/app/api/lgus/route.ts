import { NextResponse } from "next/server";
import { ALL_LGU_IDS, NCR_LGUS } from "@/data/lgus";
import { getSuspensions } from "@/collector/storage";
import { deriveLGUStatus } from "@/collector/lifecycle";
import { formatManilaDateReadable, formatManilaTime } from "@/utils/philippineTime";
import { projectPublicSuspension } from "@/lib/admin/publicProjection";

export async function GET() {
  const records = getSuspensions();

  let suspendedCount = 0;
  let partialCount = 0;
  let continueCount = 0;
  let awaitingCount = 0;
  let upcomingCount = 0;
  let activeSuspensionCount = 0;

  const lgusData = ALL_LGU_IDS.map((lguId) => {
    const lguInfo = NCR_LGUS[lguId];
    const derived = deriveLGUStatus(lguId, records);

    if (derived.status === "classes-suspended") suspendedCount++;
    else if (derived.status === "partial-suspension") partialCount++;
    else if (derived.status === "classes-continue") continueCount++;
    else awaitingCount++;

    if (derived.hasUpcoming) upcomingCount++;
    if (derived.activeRecords.some((record) => record.status === "classes-suspended" || record.status === "partial-suspension")) {
      activeSuspensionCount++;
    }

    return {
      ...lguInfo,
      status: derived.status,
      primaryRecord: derived.primaryRecord ? projectPublicSuspension(derived.primaryRecord) : undefined,
      hasUpcoming: derived.hasUpcoming,
      upcomingRecord: derived.upcomingRecord ? projectPublicSuspension(derived.upcomingRecord) : undefined,
      activeRecords: derived.activeRecords.map(projectPublicSuspension),
    };
  });

  const overallHeadline =
    activeSuspensionCount > 0
      ? `🚨 Active Class Suspensions in ${activeSuspensionCount} ${activeSuspensionCount === 1 ? "LGU" : "LGUs"} across Metro Manila`
      : partialCount > 0
      ? `⚠️ Partial Class Suspensions in ${partialCount} LGUs`
      : upcomingCount > 0
      ? `🔔 ${upcomingCount} upcoming suspension notice(s) declared for tomorrow`
      : awaitingCount === ALL_LGU_IDS.length
      ? `Checking Tier 3 class-suspension reports across Metro Manila`
      : `No active Tier 3 class-suspension report for NCR`;

  return NextResponse.json({
    summary: {
      updatedAt: new Date().toISOString(),
      philippineTimeFormatted: formatManilaTime(),
      todayDateFormatted: formatManilaDateReadable(),
      totalLgus: ALL_LGU_IDS.length,
      suspendedCount,
      partialCount,
      continueCount,
      awaitingCount,
      upcomingCount,
      hasUpcomingSuspensions: upcomingCount > 0,
      overallStatusHeadline: overallHeadline,
    },
    lgus: lgusData,
  });
}
