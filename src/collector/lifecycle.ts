import { SuspensionRecord, SuspensionStatus, LifecycleState, LGUId, SchoolInfo } from "@/types";
import { getManilaDateString, getNow } from "@/utils/philippineTime";
import { isLivePublicationRecord } from "./sourcePolicy";
import { effectiveAdminState } from "@/utils/administrativeState";

export interface EvaluatedSuspension extends SuspensionRecord {
  isActiveNow: boolean;
  isUpcomingTomorrowOrLater: boolean;
  isExpiredPast: boolean;
}

/**
 * Computes the lifecycle state of a suspension record based on Manila Time.
 */
export function evaluateSuspensionLifecycle(
  record: SuspensionRecord,
  currentManilaDate: string = getManilaDateString(getNow()),
  currentHourMinutes: string = getCurrentManilaTimeHM()
): {
  state: LifecycleState;
  isActive: boolean;
  isUpcoming: boolean;
  isExpired: boolean;
} {
  const effectiveDate = record.effectiveDate;
  const endDate = record.untilFurtherNotice ? "9999-12-31" : record.endDate || effectiveDate;

  // Case 1: Past date -> Expired
  if (endDate < currentManilaDate) {
    return {
      state: "expired",
      isActive: false,
      isUpcoming: false,
      isExpired: true,
    };
  }

  // Case 2: Future date (Tomorrow or later) -> Upcoming
  if (effectiveDate > currentManilaDate) {
    return {
      state: "upcoming",
      isActive: false,
      isUpcoming: true,
      isExpired: false,
    };
  }

  // Case 3: Today
  if (effectiveDate === currentManilaDate || (effectiveDate <= currentManilaDate && endDate >= currentManilaDate)) {
    // If all day, it is active throughout the day
    if (record.isAllDay || !record.startTime || !record.endTime) {
      return {
        state: "active",
        isActive: true,
        isUpcoming: false,
        isExpired: false,
      };
    }

    // Check specific partial time window
    const startTime = record.startTime; // e.g. "12:00"
    const endTime = record.endTime;     // e.g. "18:00"

    if (currentHourMinutes < startTime) {
      // Starts later today -> Upcoming today
      return {
        state: "upcoming",
        isActive: false,
        isUpcoming: true,
        isExpired: false,
      };
    }

    if (currentHourMinutes >= endTime) {
      // Ended earlier today -> Expired
      return {
        state: "expired",
        isActive: false,
        isUpcoming: false,
        isExpired: true,
      };
    }

    // Currently in progress
    return {
      state: "active",
      isActive: true,
      isUpcoming: false,
      isExpired: false,
    };
  }

  return {
    state: record.lifecycleState || "validated",
    isActive: false,
    isUpcoming: false,
    isExpired: false,
  };
}

/**
 * Returns HH:mm in Manila Time
 */
function getCurrentManilaTimeHM(now: Date = getNow()): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return formatter.format(now);
}

/**
 * Derives the overall LGU status given its suspension records.
 * Prioritizes: Active Full Suspension > Active Partial Suspension > Upcoming Suspension > Classes Continue > Awaiting Information.
 */
export function deriveLGUStatus(
  lguId: LGUId,
  records: SuspensionRecord[],
  currentManilaDate: string = getManilaDateString(getNow())
): {
  status: SuspensionStatus;
  primaryRecord?: SuspensionRecord;
  hasUpcoming: boolean;
  upcomingRecord?: SuspensionRecord;
  activeRecords: SuspensionRecord[];
} {
  const lguRecords = records.filter((r) => r.lguId === lguId && !r.schoolId && isLivePublicationRecord(r) && effectiveAdminState(r) === "active");

  // Evaluate all records
  const evaluated = lguRecords.map((r) => {
    const lifecycle = evaluateSuspensionLifecycle(r, currentManilaDate);
    return {
      ...r,
      lifecycleState: lifecycle.state,
      isActive: lifecycle.isActive,
      isUpcoming: lifecycle.isUpcoming,
      isExpired: lifecycle.isExpired,
    };
  });

  const activeRecords = evaluated.filter((r) => r.isActive);
  const upcomingRecords = evaluated.filter((r) => r.isUpcoming);

  const upcomingRecord = upcomingRecords[0];
  const hasUpcoming = upcomingRecords.length > 0;

  // Active records check
  if (activeRecords.length > 0) {
    const hasFull = activeRecords.some(
      (r) =>
        r.status === "classes-suspended" &&
        r.affectedLevels.includes("all-levels")
    );

    if (hasFull) {
      return {
        status: "classes-suspended",
        primaryRecord: activeRecords.find((r) => r.status === "classes-suspended") || activeRecords[0],
        hasUpcoming,
        upcomingRecord,
        activeRecords,
      };
    }

    return {
      status: "partial-suspension",
      primaryRecord: activeRecords[0],
      hasUpcoming,
      upcomingRecord,
      activeRecords,
    };
  }

  // If no active suspension today, but has upcoming suspension (e.g. announced tonight for tomorrow)
  if (hasUpcoming) {
    return {
      status: upcomingRecord.status === "classes-suspended" ? "classes-suspended" : "partial-suspension",
      primaryRecord: upcomingRecord,
      hasUpcoming: true,
      upcomingRecord,
      activeRecords: [],
    };
  }

  // If explicit "classes-continue" record exists
  const continueRecord = evaluated.find((r) => r.status === "classes-continue" && !r.isExpired);
  if (continueRecord) {
    return {
      status: "classes-continue",
      primaryRecord: continueRecord,
      hasUpcoming: false,
      activeRecords: [],
    };
  }

  // Default fallback: awaiting information / normal
  return {
    status: "awaiting-information",
    hasUpcoming: false,
    activeRecords: [],
  };
}

export function suspensionAppliesToSchool(record: SuspensionRecord, school: SchoolInfo): boolean {
  if (!isLivePublicationRecord(record) || effectiveAdminState(record) !== "active" || record.lguId !== school.lguId) return false;
  if (record.schoolId) return record.schoolId === school.id;
  const sectorMatches = record.schoolSector === "all" || record.schoolSector === school.sector;
  const levelMatches =
    record.affectedLevels.includes("all-levels") ||
    record.affectedLevels.some((level) => school.levelsOffered.includes(level));
  return sectorMatches && levelMatches;
}

export function deriveSchoolStatus(school: SchoolInfo, records: SuspensionRecord[], currentManilaDate: string = getManilaDateString(getNow())) {
  const evaluated = records.filter((record) => suspensionAppliesToSchool(record, school)).map((record) => ({ ...record, ...(() => {
    const lifecycle = evaluateSuspensionLifecycle(record, currentManilaDate);
    return { lifecycleState: lifecycle.state, isActive: lifecycle.isActive, isUpcoming: lifecycle.isUpcoming, isExpired: lifecycle.isExpired };
  })() }));
  const active = evaluated.filter((record) => record.isActive);
  const upcoming = evaluated.filter((record) => record.isUpcoming);
  const primaryRecord = active.find((record) => record.status === "classes-suspended") || active[0] || upcoming[0];
  return { status: primaryRecord ? primaryRecord.status : "awaiting-information" as SuspensionStatus, primaryRecord, hasUpcoming: upcoming.length > 0, upcomingRecord: upcoming[0] };
}
