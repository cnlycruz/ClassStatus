import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { normalizeAnnouncementSegments } from "../src/collector/normalizer";
import { ALL_LGU_IDS } from "../src/data/lgus";

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
    expect(lguResults.every((result) => result.status === "partial-suspension")).toBe(true);
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

  it("maps Metro Manila to all NCR while excluding the Manila dateline and preserving explicit Manila City", () => {
    const results = normalizeAnnouncementSegments(
      fixture("rappler-metro-manila-article.txt"),
      context
    );

    expect(results[0]).toMatchObject({
      isAllNCR: true,
      matchedLguIds: ALL_LGU_IDS,
      publishable: true,
    });
    expect(results[1]).toMatchObject({
      isAllNCR: false,
      matchedLguIds: ["manila"],
      publishable: true,
    });
    expect(results).toHaveLength(2);

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
      "MANILA, Philippines – Classes are suspended in all levels for public and private schools in Metro Manila on August 20, 2026.",
      { ...context, articleTitle: "Class suspensions for August 20, 2026" }
    )[0];
    expect(staleMetroManila).toMatchObject({
      isAllNCR: true,
      matchedLguIds: ALL_LGU_IDS,
      rejectionReason: "effective-date-outside-live-window",
    });
  });
});
