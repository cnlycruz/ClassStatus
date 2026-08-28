import { describe, it, expect } from "vitest";
import { evaluateSuspensionLifecycle, deriveLGUStatus, suspensionAppliesToSchool } from "../src/collector/lifecycle";
import { SuspensionRecord } from "../src/types";

describe("Suspension Lifecycle & Timezone Engine", () => {
  const baseRecord: SuspensionRecord = {
    id: "test-record-1",
    lguId: "manila",
    status: "classes-suspended",
    affectedLevels: ["all-levels"],
    schoolSector: "all",
    effectiveDate: "2026-08-19",
    isAllDay: true,
    reason: "Typhoon Enteng",
    announcementSummary: "Classes suspended in all levels",
    source: {
      id: "gma-news-walang-pasok",
      name: "GMA News",
      organization: "GMA Network",
      url: "https://gmanetwork.com/news/article",
      type: "news-reputable",
      reliabilityTier: 3,
      verified: false,
      publishedAt: new Date().toISOString(),
    },
    confidence: "high",
    discoveredAt: new Date().toISOString(),
    publishedAt: new Date().toISOString(),
    lifecycleState: "validated",
    isActive: false,
    isUpcoming: false,
    isExpired: false,
    collectorProvenance: {
      pipeline: "tier3-media",
      runId: "test-run",
      collectedAt: new Date().toISOString(),
    },
  };

  const projectedAutomaticRecord = (overrides: Partial<SuspensionRecord> = {}): SuspensionRecord => ({
    ...baseRecord,
    publicationProvenance: {
      type: "automatic-collector",
      publicLabel: "Published from approved Tier 3 media evidence",
    },
    collectorProvenance: undefined,
    administrativeState: undefined,
    eventKey: undefined,
    revision: undefined,
    ...overrides,
  });

  it("evaluates a suspension on the current date as ACTIVE", () => {
    const evaluated = evaluateSuspensionLifecycle(baseRecord, "2026-08-19", "08:00");
    expect(evaluated.state).toBe("active");
    expect(evaluated.isActive).toBe(true);
    expect(evaluated.isUpcoming).toBe(false);
    expect(evaluated.isExpired).toBe(false);
  });

  it("evaluates a suspension for tomorrow as UPCOMING", () => {
    const evaluated = evaluateSuspensionLifecycle(
      { ...baseRecord, effectiveDate: "2026-08-20" },
      "2026-08-19",
      "21:00"
    );
    expect(evaluated.state).toBe("upcoming");
    expect(evaluated.isActive).toBe(false);
    expect(evaluated.isUpcoming).toBe(true);
    expect(evaluated.isExpired).toBe(false);
  });

  it("evaluates a suspension for yesterday as EXPIRED", () => {
    const evaluated = evaluateSuspensionLifecycle(
      { ...baseRecord, effectiveDate: "2026-08-18", endDate: "2026-08-18" },
      "2026-08-19",
      "08:00"
    );
    expect(evaluated.state).toBe("expired");
    expect(evaluated.isActive).toBe(false);
    expect(evaluated.isUpcoming).toBe(false);
    expect(evaluated.isExpired).toBe(true);
  });

  it("evaluates a partial afternoon suspension correctly based on current time window", () => {
    const afternoonRecord: SuspensionRecord = {
      ...baseRecord,
      isAllDay: false,
      startTime: "12:00",
      endTime: "18:00",
    };

    // Before noon: upcoming
    const morningCheck = evaluateSuspensionLifecycle(afternoonRecord, "2026-08-19", "09:00");
    expect(morningCheck.state).toBe("upcoming");
    expect(morningCheck.isUpcoming).toBe(true);

    // During afternoon: active
    const afternoonCheck = evaluateSuspensionLifecycle(afternoonRecord, "2026-08-19", "14:00");
    expect(afternoonCheck.state).toBe("active");
    expect(afternoonCheck.isActive).toBe(true);

    // After 6 PM: expired
    const eveningCheck = evaluateSuspensionLifecycle(afternoonRecord, "2026-08-19", "19:00");
    expect(eveningCheck.state).toBe("expired");
    expect(eveningCheck.isExpired).toBe(true);

    const exactEndCheck = evaluateSuspensionLifecycle(afternoonRecord, "2026-08-19", "18:00");
    expect(exactEndCheck.state).toBe("expired");
  });

  it("derives an active full suspension from an automatic public projection", () => {
    const projected = projectedAutomaticRecord();
    const derived = deriveLGUStatus("manila", [projected], "2026-08-19");
    expect(derived.status).toBe("classes-suspended");
    expect(derived.primaryRecord?.lguId).toBe("manila");
    expect(derived.activeRecords).toHaveLength(1);
    expect(derived.primaryRecord?.collectorProvenance).toBeUndefined();
  });

  it("derives an active partial suspension from an automatic public projection", () => {
    const projected = projectedAutomaticRecord({
      status: "partial-suspension",
      affectedLevels: ["elementary"],
      schoolSector: "public",
    });
    const derived = deriveLGUStatus("manila", [projected], "2026-08-19");
    expect(derived.status).toBe("partial-suspension");
    expect(derived.activeRecords).toHaveLength(1);
  });

  it("keeps a full-target school notice full without promoting the LGU map", () => {
    const schoolSpecific = projectedAutomaticRecord({
      id: "school-full",
      schoolId: "ust-manila",
      status: "classes-suspended",
      affectedLevels: ["all-levels"],
      schoolSector: "private",
      isAllDay: true,
    });
    const derived = deriveLGUStatus("manila", [schoolSpecific], "2026-08-19");
    expect(schoolSpecific.status).toBe("classes-suspended");
    expect(derived.status).toBe("awaiting-information");
    expect(derived.activeRecords).toHaveLength(0);
  });

  it("derives LGU status with upcoming suspension notice flag", () => {
    const tomorrowRecord = projectedAutomaticRecord({
      lguId: "marikina",
      effectiveDate: "2026-08-20",
    });

    const derived = deriveLGUStatus("marikina", [tomorrowRecord], "2026-08-19");
    expect(derived.hasUpcoming).toBe(true);
    expect(derived.status).toBe("classes-suspended");
    expect(derived.upcomingRecord?.effectiveDate).toBe("2026-08-20");
  });

  it("recomputes an all-day lifecycle across the Manila effective date", () => {
    const storedUpcoming = projectedAutomaticRecord({
      effectiveDate: "2026-08-28",
      lifecycleState: "upcoming",
      isActive: false,
      isUpcoming: true,
      isExpired: false,
    });

    expect(evaluateSuspensionLifecycle(storedUpcoming, "2026-08-27", "23:59")).toMatchObject({
      state: "upcoming",
      isActive: false,
      isUpcoming: true,
    });
    expect(evaluateSuspensionLifecycle(storedUpcoming, "2026-08-28", "00:00")).toMatchObject({
      state: "active",
      isActive: true,
      isUpcoming: false,
    });
    expect(evaluateSuspensionLifecycle(storedUpcoming, "2026-08-29", "00:00")).toMatchObject({
      state: "expired",
      isActive: false,
      isExpired: true,
    });
  });

  it("applies scoped records only to matching school sector and levels", () => {
    const publicElementary = {
      id: "public-elem",
      name: "Public Elementary",
      aliases: [],
      acronym: "PE",
      lguId: "manila" as const,
      address: "Manila",
      sector: "public" as const,
      levelsOffered: ["elementary" as const],
    };
    const privateCollege = {
      ...publicElementary,
      id: "private-college",
      sector: "private" as const,
      levelsOffered: ["college" as const],
    };
    const scoped = { ...baseRecord, affectedLevels: ["elementary" as const], schoolSector: "public" as const };
    expect(suspensionAppliesToSchool(scoped, publicElementary)).toBe(true);
    expect(suspensionAppliesToSchool(scoped, privateCollege)).toBe(false);
  });
});
