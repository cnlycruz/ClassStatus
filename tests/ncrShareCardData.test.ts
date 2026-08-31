import { describe, expect, it } from "vitest";
import { deriveLGUStatus } from "@/collector/lifecycle";
import { ALL_LGU_IDS } from "@/data/lgus";
import { STATUS_PRESENTATION } from "@/lib/statusPresentation";
import {
  parseNcrShareDate,
  prepareNcrShareCardData,
} from "@/lib/share/ncrShareCardData";
import type { EducationLevel, LGUId, SuspensionRecord, SuspensionStatus } from "@/types";

const EFFECTIVE_DATE = "2026-08-31";
const NOW = new Date("2026-08-31T02:15:00.000Z");

function record(
  id: string,
  lguId: LGUId,
  status: SuspensionStatus,
  affectedLevels: EducationLevel[],
): SuspensionRecord {
  return {
    id,
    lguId,
    status,
    affectedLevels,
    schoolSector: "all",
    effectiveDate: EFFECTIVE_DATE,
    isAllDay: true,
    reason: "Verified public advisory",
    announcementSummary: "Fixture advisory",
    source: {
      id: `source-${id}`,
      name: "Fixture source",
      organization: "Fixture source",
      url: "https://example.com/advisory",
      type: "official-lgu",
      verified: true,
      publishedAt: "2026-08-31T01:00:00.000Z",
    },
    confidence: "high",
    discoveredAt: "2026-08-31T01:00:00.000Z",
    publishedAt: "2026-08-31T01:00:00.000Z",
    lifecycleState: "validated",
    isUpcoming: false,
    isActive: false,
    isExpired: false,
  };
}

function fixtureRecords(): SuspensionRecord[] {
  return [
    record("full-caloocan", "caloocan", "classes-suspended", ["all-levels"]),
    record("partial-las-pinas", "las-pinas", "classes-suspended", ["preschool"]),
  ];
}

describe("NCR share-card data", () => {
  it("derives all 17 LGUs and counts from the shared public status logic", () => {
    const records = fixtureRecords();
    const data = prepareNcrShareCardData(records, {
      effectiveDate: EFFECTIVE_DATE,
      now: NOW,
      siteLabel: "classstatus.example",
    });

    expect(data.lgus).toHaveLength(17);
    expect(data.counts).toEqual({ full: 1, partial: 1, open: 0, awaiting: 15 });
    expect(Object.values(data.counts).reduce((sum, count) => sum + count, 0)).toBe(ALL_LGU_IDS.length);
    expect(data.effectiveDateLabel).toBe("Monday, August 31, 2026");
    expect(data.siteLabel).toBe("classstatus.example");

    for (const lgu of data.lgus) {
      expect(lgu.status).toBe(deriveLGUStatus(lgu.id, records, EFFECTIVE_DATE).status);
    }
  });

  it("uses the shared status presentation colors and public wording", () => {
    const data = prepareNcrShareCardData(fixtureRecords(), { effectiveDate: EFFECTIVE_DATE, now: NOW });

    expect(data.legend).toEqual([
      { status: "classes-suspended", label: "Full suspension", color: "#EF4444" },
      { status: "partial-suspension", label: "Partial suspension", color: "#F59E0B" },
      { status: "classes-continue", label: "Classes open", color: "#10B981" },
      { status: "awaiting-information", label: "Awaiting info", color: "#94A3B8" },
    ]);
    for (const lgu of data.lgus) expect(lgu.color).toBe(STATUS_PRESENTATION[lgu.status].color);
  });

  it("does not mutate public records while shaping the card", () => {
    const records = fixtureRecords();
    records[0].administrativeState = "active";
    records[0].eventKey = "private-storage-key";
    const before = structuredClone(records);

    prepareNcrShareCardData(records, { effectiveDate: EFFECTIVE_DATE, now: NOW });

    expect(records).toEqual(before);
  });

  it("defaults to the Manila live date and rejects invalid date parameters", () => {
    expect(parseNcrShareDate(null, NOW)).toBe(EFFECTIVE_DATE);
    expect(parseNcrShareDate("2026-09-01", NOW)).toBe("2026-09-01");
    expect(parseNcrShareDate("2026-02-30", NOW)).toBeNull();
    expect(parseNcrShareDate("08-31-2026", NOW)).toBeNull();
  });
});
