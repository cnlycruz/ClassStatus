import { describe, expect, it } from "vitest";
import {
  classifySuspensionScope,
  currentSources,
  noticeEventKey,
  noticeFamilyKey,
  noticeWindowsOverlap,
} from "@/lib/suspensions/noticeModel";
import type { SuspensionRecord } from "@/types";

const base = {
  lguId: "manila" as const,
  effectiveDate: "2026-08-28",
  isAllDay: true,
};

describe("collector notice model v2", () => {
  it("uses stable known canonical keys and excludes mutable scope from identity", () => {
    expect(noticeFamilyKey("production", base)).toBe("v2f:d7f37faaefb32c09ceffc755820be34939d2e566e5c38993a360987bb76f5d0e");
    expect(noticeEventKey("production", base)).toBe("v2e:5999ca0658abd9dd3fc9aaa47c5392c73983c63032876d81a33f1f2a66112e80");
    const partial = { ...base, status: "partial-suspension", affectedLevels: ["preschool"], schoolSector: "public" } as const;
    const full = { ...base, status: "classes-suspended", affectedLevels: ["all-levels"], schoolSector: "all" } as const;
    expect(noticeFamilyKey("production", partial)).toBe(noticeFamilyKey("production", full));
    expect(noticeEventKey("production", partial)).toBe(noticeEventKey("production", full));
  });

  it("separates non-overlapping time windows and school targets", () => {
    const morning = { ...base, isAllDay: false, startTime: "06:00", endTime: "11:00" };
    const afternoon = { ...base, isAllDay: false, startTime: "13:00", endTime: "18:00" };
    expect(noticeWindowsOverlap(morning, afternoon)).toBe(false);
    expect(noticeEventKey("production", morning)).not.toBe(noticeEventKey("production", afternoon));
    expect(noticeFamilyKey("production", { ...base, schoolId: "ust-manila" })).not.toBe(noticeFamilyKey("production", base));
  });

  it("classifies full scope within each target without conflating map coverage", () => {
    expect(classifySuspensionScope({ targetType: "lgu", affectedLevels: ["all-levels"], schoolSector: "all", isAllDay: true })).toBe("classes-suspended");
    expect(classifySuspensionScope({ targetType: "lgu", affectedLevels: ["all-levels"], schoolSector: "public", isAllDay: true })).toBe("partial-suspension");
    expect(classifySuspensionScope({ targetType: "school", affectedLevels: ["all-levels"], schoolSector: "private", isAllDay: true })).toBe("classes-suspended");
    expect(classifySuspensionScope({ targetType: "school", affectedLevels: ["all-levels"], schoolSector: "private", isAllDay: false })).toBe("partial-suspension");
  });

  it("keeps at most one current citation per organization", () => {
    const source = (id: string, organization: string) => ({ id, name: id, organization, url: `https://example.test/${id}`, type: "news-reputable" as const, reliabilityTier: 3 as const, verified: false, publishedAt: "2026-08-27T00:00:00+08:00" });
    const record = { source: source("gma-current", "GMA Network"), additionalSources: [source("gma-old", "gma network"), source("rappler", "Rappler Philippines")] } as SuspensionRecord;
    expect(currentSources(record).map((item) => item.id)).toEqual(["gma-current", "rappler"]);
  });
});
