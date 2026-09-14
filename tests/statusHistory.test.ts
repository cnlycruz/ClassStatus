import { describe, expect, it } from "vitest";
import { buildPublicNcrProjection, visiblePublicStatusHistory } from "@/lib/publicNcrProjection";
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

  it("keeps every persisted LGU suspension newest-first while initially exposing three", () => {
    const dates = ["2026-08-29", "2026-09-05", "2026-09-08", "2026-09-09", "2026-09-14"];
    const projection = buildPublicNcrProjection([], {
      now: new Date("2026-09-15T12:00:00+08:00"),
      history: dates.map((date) => record(date, "classes-suspended")),
    });
    const history = projection.lgus.find((lgu) => lgu.id === "manila")!.history;

    expect(history.map((entry) => entry.effectiveDate)).toEqual([
      "2026-09-14",
      "2026-09-09",
      "2026-09-08",
      "2026-09-05",
      "2026-08-29",
    ]);
    expect(visiblePublicStatusHistory(history, false)).toEqual(history.slice(0, 3));
    expect(visiblePublicStatusHistory(history, true)).toEqual(history);
  });

  it("does not cap expanded history at seven records", () => {
    const historyRecords = Array.from({ length: 10 }, (_, index) => record(`2026-08-${String(index + 1).padStart(2, "0")}`, "classes-suspended"));
    const history = buildPublicNcrProjection([], { history: historyRecords }).lgus.find((lgu) => lgu.id === "manila")!.history;

    expect(history).toHaveLength(10);
    expect(visiblePublicStatusHistory(history, true)).toHaveLength(10);
  });

  it("keeps each LGU history isolated in the shared desktop and mobile card payload", () => {
    const pasig = { ...record("2026-09-10", "partial-suspension"), id: "pasig-2026-09-10", lguId: "pasig" as const };
    const projection = buildPublicNcrProjection([], { history: [record("2026-09-14", "classes-suspended"), pasig] });

    expect(projection.lgus.find((lgu) => lgu.id === "manila")!.history.map((entry) => entry.effectiveDate)).toEqual(["2026-09-14"]);
    expect(projection.lgus.find((lgu) => lgu.id === "pasig")!.history).toEqual([
      { effectiveDate: "2026-09-10", status: "partial-suspension", affectedLevels: ["all-levels"], schoolSector: "all" },
    ]);
    expect(projection.lgus.find((lgu) => lgu.id === "pateros")!.history).toEqual([]);
  });
});
