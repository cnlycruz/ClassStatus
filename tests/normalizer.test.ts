import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { normalizeAnnouncementSegments } from "../src/collector/normalizer";
import { ALL_LGU_IDS } from "../src/data/lgus";
import { deriveLGUStatus } from "../src/collector/lifecycle";
import type { SuspensionRecord } from "../src/types";

const now = new Date("2026-08-23T08:00:00+08:00");
const context = {
  articleTitle: "Walang Pasok: Class suspensions for August 23, 2026",
  publishedAt: "2026-08-22T21:00:00+08:00",
  now,
};

function fixture(name: string): string {
  return fs.readFileSync(path.join(__dirname, "fixtures", name), "utf-8");
}

describe("Tier 3 statement normalizer", () => {
  it("segments LGUs and preserves different scope per line", () => {
    const results = normalizeAnnouncementSegments(
      [
        "Manila - Classes are suspended in all levels, public and private, on August 23, 2026 due to heavy rain.",
        "Pasig City - No face-to-face classes from preschool to senior high school in public schools only on August 23, 2026.",
      ].join("\n"),
      context
    );

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ matchedLguIds: ["manila"], status: "classes-suspended", schoolSector: "all", publishable: true });
    expect(results[1]).toMatchObject({ matchedLguIds: ["pasig"], status: "partial-suspension", schoolSector: "public", publishable: true });
    expect(results[1].affectedLevels).toEqual(expect.arrayContaining(["preschool", "elementary", "junior-high", "senior-high"]));
  });

  it("resolves tomorrow relative to article publication time, then checks the live Manila window", () => {
    const result = normalizeAnnouncementSegments(
      "Caloocan City - Classes are suspended tomorrow in all levels, public and private, due to a transport strike.",
      context
    )[0];
    expect(result.effectiveDate).toBe("2026-08-23");
    expect(result.publishable).toBe(true);
  });

  it("rejects stale, undated, and multi-date statements", () => {
    const stale = normalizeAnnouncementSegments(
      "Manila - Classes are suspended in all levels, public and private, on August 21, 2026.",
      context
    )[0];
    const undated = normalizeAnnouncementSegments(
      "Manila - Classes are suspended in all levels, public and private.",
      { ...context, articleTitle: "Breaking class suspension report" }
    )[0];
    const range = normalizeAnnouncementSegments(
      "Manila - Classes are suspended in all levels, public and private, on August 23, 2026 and August 24, 2026.",
      context
    )[0];
    expect(stale.rejectionReason).toBe("effective-date-outside-live-window");
    expect(undated.rejectionReason).toBe("missing-or-ambiguous-effective-date");
    expect(range.rejectionReason).toBe("multiple-or-range-dates");
  });

  it("rejects missing levels or sector instead of defaulting to all", () => {
    const noLevels = normalizeAnnouncementSegments(
      "Manila - Classes are suspended in public and private schools on August 23, 2026.",
      context
    )[0];
    const noSector = normalizeAnnouncementSegments(
      "Manila - Classes are suspended in all levels on August 23, 2026.",
      context
    )[0];
    expect(noLevels.rejectionReason).toBe("missing-education-level-scope");
    expect(noSector.rejectionReason).toBe("missing-school-sector-scope");
  });

  it("rejects negation, forecasts, and mere authority to suspend", () => {
    const negated = normalizeAnnouncementSegments(
      "Makati City - Classes are not suspended in all levels, public and private, on August 23, 2026.",
      context
    )[0];
    const uncertain = normalizeAnnouncementSegments(
      "Pasay City schools are authorized to suspend classes in all levels, public and private, on August 23, 2026.",
      context
    )[0];
    expect(negated.rejectionReason).toBe("explicit-no-suspension");
    expect(uncertain.rejectionReason).toBe("uncertain-or-advisory-language");
  });

  it("holds school-specific announcements outside live LGU publication", () => {
    const result = normalizeAnnouncementSegments(
      "University of Santo Tomas - Classes are suspended in all levels, public and private, on August 23, 2026.",
      context
    )[0];
    expect(result).toMatchObject({ scopeKind: "school", schoolId: "ust-manila", publishable: false, parserOutcome: "held:school-specific" });
  });

  it("builds bounded logical statements from GMA article, section, entry, and continuation context", () => {
    const results = normalizeAnnouncementSegments(
      fixture("gma-hierarchical-article.txt"),
      {
        ...context,
        articleTitle: "WALANG PASOK: Class suspensions for Thursday, August 23, 2026",
      }
    );

    const lguResults = results.filter((result) => result.scopeKind === "lgu");
    const schoolResult = results.find((result) => result.scopeKind === "school");

    expect(lguResults).toHaveLength(2);
    expect(lguResults.map((result) => result.matchedLguIds)).toEqual([["caloocan"], ["san-juan"]]);
    expect(lguResults.every((result) => result.publishable && result.effectiveDate === "2026-08-23")).toBe(true);
    expect(lguResults.every((result) => result.status === "classes-suspended")).toBe(true);
    expect(schoolResult).toMatchObject({
      scopeKind: "school",
      schoolId: "ue-caloocan",
      matchedLguIds: ["caloocan"],
      publishable: false,
      parserOutcome: "held:school-specific",
      rejectionReason: "school-specific-not-live",
    });
    expect(results.some((result) => result.evidenceExcerpt.startsWith("Below are"))).toBe(false);
  });

  it("does not leak NCR LGU context into a following non-NCR section", () => {
    const results = normalizeAnnouncementSegments(
      fixture("gma-hierarchical-article.txt"),
      { ...context, articleTitle: "Class suspensions for August 23, 2026" }
    );

    const lguResults = results.filter((result) => result.scopeKind === "lgu");
    expect(lguResults).toHaveLength(2);
    expect(lguResults.flatMap((result) => result.matchedLguIds)).toEqual(["caloocan", "san-juan"]);
  });

  it("requires explicit universal language for all-NCR expansion and ignores a Manila dateline", () => {
    const results = normalizeAnnouncementSegments(
      fixture("rappler-metro-manila-article.txt"),
      context
    );

    expect(results[0]).toMatchObject({
      isAllNCR: false,
      matchedLguIds: [],
      publishable: false,
      rejectionReason: "missing-ncr-lgu",
    });
    expect(results[1]).toMatchObject({
      isAllNCR: false,
      matchedLguIds: ["manila"],
      publishable: true,
    });
    expect(results).toHaveLength(2);

    const explicitRegionWide = normalizeAnnouncementSegments(
      "Classes are suspended throughout Metro Manila in all levels for public and private schools on August 23, 2026.",
      context
    )[0];
    expect(explicitRegionWide).toMatchObject({
      isAllNCR: true,
      matchedLguIds: ALL_LGU_IDS,
      publishable: true,
    });

    const datelineOnly = normalizeAnnouncementSegments(
      "MANILA, Philippines – Classes are suspended in all levels for public and private schools on August 23, 2026.",
      context
    )[0];
    expect(datelineOnly).toMatchObject({
      matchedLguIds: [],
      publishable: false,
      rejectionReason: "missing-ncr-lgu",
    });
  });

  it("keeps the today/tomorrow gate unchanged for inherited hierarchical statements", () => {
    const results = normalizeAnnouncementSegments(
      fixture("gma-hierarchical-article.txt"),
      {
        ...context,
        articleTitle: "WALANG PASOK: Class suspensions for Thursday, August 20, 2026",
      }
    );

    const lguResults = results.filter((result) => result.scopeKind === "lgu");
    expect(lguResults).toHaveLength(2);
    expect(lguResults.every((result) => result.rejectionReason === "effective-date-outside-live-window")).toBe(true);
    expect(lguResults.every((result) => !result.publishable)).toBe(true);

    const staleMetroManila = normalizeAnnouncementSegments(
      "MANILA, Philippines – Classes are suspended throughout Metro Manila in all levels for public and private schools on August 20, 2026.",
      { ...context, articleTitle: "Class suspensions for August 20, 2026" }
    )[0];
    expect(staleMetroManila).toMatchObject({
      isAllNCR: true,
      matchedLguIds: ALL_LGU_IDS,
      rejectionReason: "effective-date-outside-live-window",
    });
  });

  it("treats an NCR heading as section context and rejects non-NCR targets", () => {
    const agoo = normalizeAnnouncementSegments(
      "Metro Manila\nAgoo - Kindergarten to High School no face-to-face classes public and private",
      context
    );
    const malolos = normalizeAnnouncementSegments(
      "Metro Manila\nMalolos - no face-to-face classes all levels public and private",
      context
    );
    expect(agoo.filter((result) => result.publishable)).toHaveLength(0);
    expect(malolos.filter((result) => result.publishable)).toHaveLength(0);
  });

  it("publishes only exact NCR entries and ends context at a later region heading", () => {
    const results = normalizeAnnouncementSegments(
      [
        "Metro Manila",
        "Caloocan City - face-to-face classes in all levels (public and private)",
        "Las Piñas City - all levels (public and private)",
        "Central Luzon",
        "Malolos - no face-to-face classes all levels public and private",
      ].join("\n"),
      context
    ).filter((result) => result.publishable);
    expect(results.flatMap((result) => result.matchedLguIds)).toEqual(["caloocan", "las-pinas"]);
    expect(results.every((result) => !result.isAllNCR)).toBe(true);
  });

  it("classifies face-to-face notices from their actual level, sector, and time scope", () => {
    const results = normalizeAnnouncementSegments(
      [
        "City of Manila – face-to-face classes in all levels (public and private)",
        "Caloocan City – face-to-face classes in all levels (public and private)",
        "Makati City – face-to-face classes in all levels (public)",
        "Pasig City – face-to-face classes from preschool to senior high school (public and private)",
        "Pateros – face-to-face classes from preschool to senior high school (public and private)",
      ].join("\n"),
      context
    );
    expect(results.slice(0, 2).every((result) => result.status === "classes-suspended")).toBe(true);
    expect(results[0]).toMatchObject({ affectedLevels: ["all-levels"], schoolSector: "all" });
    expect(results[2]).toMatchObject({ status: "partial-suspension", affectedLevels: ["all-levels"], schoolSector: "public" });
    for (const result of results.slice(3)) {
      expect(result).toMatchObject({ status: "partial-suspension", schoolSector: "all" });
      expect(result.affectedLevels).toHaveLength(4);
      expect(result.affectedLevels).toEqual(expect.arrayContaining(["preschool", "elementary", "junior-high", "senior-high"]));
    }
  });

  it("produces the expected 14 full and 3 partial NCR statuses from a synthetic fixture", () => {
    const results = normalizeAnnouncementSegments(
      fixture("synthetic-ncr-scope-2026-08-28.txt"),
      {
        articleTitle: "Synthetic class suspensions for August 28, 2026",
        publishedAt: "2026-08-27T21:00:00+08:00",
        now: new Date("2026-08-28T08:00:00+08:00"),
      }
    ).filter((result) => result.publishable);
    const byLgu = new Map(results.flatMap((result) => result.matchedLguIds.map((lguId) => [lguId, result.status])));
    expect(byLgu.size).toBe(17);
    expect([...byLgu.values()].filter((status) => status === "classes-suspended")).toHaveLength(14);
    expect([...byLgu.entries()].filter(([, status]) => status === "partial-suspension").map(([id]) => id).sort()).toEqual(["makati", "pasig", "pateros"]);

    const records = results.flatMap((result, index) => result.matchedLguIds.map((lguId) => ({
      id: `synthetic-${index}-${lguId}`,
      lguId,
      status: result.status,
      affectedLevels: result.affectedLevels,
      schoolSector: result.schoolSector,
      effectiveDate: result.effectiveDate,
      isAllDay: result.isAllDay,
      reason: result.reason,
      announcementSummary: result.summary,
      source: { id: "synthetic", name: "Synthetic", organization: "Synthetic", url: "https://example.test/synthetic", type: "news-reputable" as const, reliabilityTier: 3 as const, verified: false, publishedAt: "2026-08-27T21:00:00+08:00" },
      confidence: "medium" as const,
      discoveredAt: "2026-08-27T21:05:00+08:00",
      publishedAt: "2026-08-27T21:00:00+08:00",
      lifecycleState: "upcoming" as const,
      isActive: false,
      isUpcoming: true,
      isExpired: false,
    } satisfies SuspensionRecord)));
    const mapStatuses = ALL_LGU_IDS.map((lguId) => deriveLGUStatus(lguId, records, "2026-08-28").status);
    expect(mapStatuses.filter((status) => status === "classes-suspended")).toHaveLength(14);
    expect(mapStatuses.filter((status) => status === "partial-suspension")).toHaveLength(3);
    expect(mapStatuses.filter((status) => status === "awaiting-information")).toHaveLength(0);
  });
});
