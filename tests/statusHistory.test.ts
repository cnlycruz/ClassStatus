import { describe, expect, it } from "vitest";
import { buildPublicNcrProjection } from "@/lib/publicNcrProjection";
import type { SuspensionRecord } from "@/types";

function record(effectiveDate: string, status: SuspensionRecord["status"], levels: SuspensionRecord["affectedLevels"] = ["all-levels"]): SuspensionRecord {
  return {
    id: `manila-${effectiveDate}`, lguId: "manila", status, affectedLevels: levels, schoolSector: "all",
    effectiveDate, isAllDay: true, reason: "Rain", announcementSummary: "Verified notice.",
    source: { id: "gma-news-walang-pasok", name: "GMA", organization: "GMA", url: "https://example.test", type: "news-reputable", reliabilityTier: 3, verified: false, publishedAt: `${effectiveDate}T00:00:00.000Z` },
    confidence: "medium", discoveredAt: `${effectiveDate}T00:00:00.000Z`, publishedAt: `${effectiveDate}T00:00:00.000Z`, lifecycleState: "validated", isActive: false, isUpcoming: false, isExpired: false,
    publicationProvenance: { type: "automatic-collector", publicLabel: "Published from approved Tier 3 media evidence" },
  };
}

describe("public status history projection", () => {
  it("keeps verified published entries newest-first and does not invent empty dates", () => {
    const old = record("2026-09-03", "classes-suspended", ["elementary"]);
    const latest = record("2026-09-05", "partial-suspension", ["all-levels"]);
    const projection = buildPublicNcrProjection([], { now: new Date("2026-09-06T00:00:00+08:00"), history: [old, latest] });
    expect(projection.lgus.find((lgu) => lgu.id === "manila")?.history).toEqual([
      { effectiveDate: "2026-09-05", status: "partial-suspension", affectedLevels: ["all-levels"], schoolSector: "all" },
      { effectiveDate: "2026-09-03", status: "classes-suspended", affectedLevels: ["elementary"], schoolSector: "all" },
    ]);
    expect(projection.lgus.find((lgu) => lgu.id === "manila")?.history).not.toContainEqual(expect.objectContaining({ effectiveDate: "2026-09-04" }));
  });

  it("uses the final same-day snapshot once", () => {
    const obsolete = record("2026-09-05", "partial-suspension", ["elementary"]);
    const final = record("2026-09-05", "classes-suspended");
    const projection = buildPublicNcrProjection([], { history: [obsolete, final] });
    expect(projection.lgus.find((lgu) => lgu.id === "manila")?.history).toEqual([
      { effectiveDate: "2026-09-05", status: "classes-suspended", affectedLevels: ["all-levels"], schoolSector: "all" },
    ]);
  });
});
