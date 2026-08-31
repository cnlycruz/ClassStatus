import { deriveLGUStatus } from "@/collector/lifecycle";
import { ALL_LGU_IDS, NCR_LGUS } from "@/data/lgus";
import { projectPublicSuspension } from "@/lib/admin/publicProjection";
import type { LGUInfo, SuspensionRecord, SuspensionStatus } from "@/types";
import {
  formatManilaDateReadable,
  formatManilaTime,
  getManilaDateString,
} from "@/utils/philippineTime";

export type PublicSuspensionProjection = ReturnType<typeof projectPublicSuspension>;

export interface PublicNcrLguProjection extends LGUInfo {
  status: SuspensionStatus;
  primaryRecord?: PublicSuspensionProjection;
  hasUpcoming: boolean;
  upcomingRecord?: PublicSuspensionProjection;
  activeRecords: PublicSuspensionProjection[];
}

export interface PublicNcrProjection {
  summary: {
    updatedAt: string;
    philippineTimeFormatted: string;
    todayDateFormatted: string;
    totalLgus: number;
    suspendedCount: number;
    partialCount: number;
    continueCount: number;
    awaitingCount: number;
    upcomingCount: number;
    hasUpcomingSuspensions: boolean;
    overallStatusHeadline: string;
  };
  lgus: PublicNcrLguProjection[];
}

export function buildPublicNcrProjection(
  records: readonly SuspensionRecord[],
  options: { effectiveDate?: string; now?: Date } = {},
): PublicNcrProjection {
  const now = options.now || new Date();
  const effectiveDate = options.effectiveDate || getManilaDateString(now);
  let suspendedCount = 0;
  let partialCount = 0;
  let continueCount = 0;
  let awaitingCount = 0;
  let upcomingCount = 0;
  let activeSuspensionCount = 0;

  const lgus = ALL_LGU_IDS.map((lguId) => {
    const derived = deriveLGUStatus(lguId, records, effectiveDate);

    if (derived.status === "classes-suspended") suspendedCount++;
    else if (derived.status === "partial-suspension") partialCount++;
    else if (derived.status === "classes-continue") continueCount++;
    else awaitingCount++;

    if (derived.hasUpcoming) upcomingCount++;
    if (derived.activeRecords.some((record) => record.status === "classes-suspended" || record.status === "partial-suspension")) {
      activeSuspensionCount++;
    }

    return {
      ...NCR_LGUS[lguId],
      status: derived.status,
      primaryRecord: derived.primaryRecord ? projectPublicSuspension(derived.primaryRecord) : undefined,
      hasUpcoming: derived.hasUpcoming,
      upcomingRecord: derived.upcomingRecord ? projectPublicSuspension(derived.upcomingRecord) : undefined,
      activeRecords: derived.activeRecords.map(projectPublicSuspension),
    };
  });

  const overallStatusHeadline =
    activeSuspensionCount > 0
      ? `🚨 Active Class Suspensions in ${activeSuspensionCount} ${activeSuspensionCount === 1 ? "LGU" : "LGUs"} across Metro Manila`
      : partialCount > 0
        ? `⚠️ Partial Class Suspensions in ${partialCount} LGUs`
        : upcomingCount > 0
          ? `🔔 ${upcomingCount} upcoming suspension notice(s) declared for tomorrow`
          : awaitingCount === ALL_LGU_IDS.length
            ? "Checking Tier 3 class-suspension reports across Metro Manila"
            : "No active Tier 3 class-suspension report for NCR";

  return {
    summary: {
      updatedAt: now.toISOString(),
      philippineTimeFormatted: formatManilaTime(now),
      todayDateFormatted: formatManilaDateReadable(effectiveDate),
      totalLgus: ALL_LGU_IDS.length,
      suspendedCount,
      partialCount,
      continueCount,
      awaitingCount,
      upcomingCount,
      hasUpcomingSuspensions: upcomingCount > 0,
      overallStatusHeadline,
    },
    lgus,
  };
}
