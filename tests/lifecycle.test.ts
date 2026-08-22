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

  it("derives LGU overall status giving priority to active full suspension", () => {
    const derived = deriveLGUStatus("manila", [baseRecord], "2026-08-19");
    expect(derived.status).toBe("classes-suspended");
    expect(derived.primaryRecord?.lguId).toBe("manila");
  });

  it("derives LGU status with upcoming suspension notice flag", () => {
    const tomorrowRecord: SuspensionRecord = {
      ...baseRecord,
      lguId: "marikina",
      effectiveDate: "2026-08-20",
    };

    const derived = deriveLGUStatus("marikina", [tomorrowRecord], "2026-08-19");
    expect(derived.hasUpcoming).toBe(true);
    expect(derived.status).toBe("classes-suspended");
    expect(derived.upcomingRecord?.effectiveDate).toBe("2026-08-20");
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
