import { buildPublicNcrProjection } from "@/lib/publicNcrProjection";
import { getStatusPresentation, STATUS_PRESENTATION } from "@/lib/statusPresentation";
import type { LGUId, SuspensionRecord, SuspensionStatus } from "@/types";
import { formatManilaDateReadable, getManilaDateString, MANILA_TIMEZONE } from "@/utils/philippineTime";

export const NCR_SHARE_IMAGE_SIZE = { width: 1200, height: 1200 } as const;
export const NCR_SHARE_SOURCE_NOTE = "Source: Verified public advisories and Class Status NCR aggregation";

export interface NcrShareCardData {
  effectiveDate: string;
  effectiveDateLabel: string;
  asOfIso: string;
  asOfLabel: string;
  siteLabel: string;
  sourceNote: string;
  counts: Record<"full" | "partial" | "open" | "awaiting", number>;
  legend: Array<{ status: SuspensionStatus; label: string; color: string }>;
  lgus: Array<{ id: LGUId; name: string; status: SuspensionStatus; color: string }>;
}

export function parseNcrShareDate(value: string | null, now: Date = new Date()): string | null {
  if (value === null || value === "") return getManilaDateString(now);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00+08:00`);
  return Number.isNaN(parsed.getTime()) || getManilaDateString(parsed) !== value ? null : value;
}

function formatAsOf(now: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: MANILA_TIMEZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(now) + " PHT";
}

export function prepareNcrShareCardData(
  records: readonly SuspensionRecord[],
  options: { effectiveDate?: string; now?: Date; siteLabel?: string } = {},
): NcrShareCardData {
  const now = options.now || new Date();
  const effectiveDate = options.effectiveDate || getManilaDateString(now);
  const projection = buildPublicNcrProjection(records, { effectiveDate, now });

  return {
    effectiveDate,
    effectiveDateLabel: formatManilaDateReadable(effectiveDate),
    asOfIso: projection.summary.updatedAt,
    asOfLabel: formatAsOf(now),
    siteLabel: options.siteLabel || "classstatus.vercel.app",
    sourceNote: NCR_SHARE_SOURCE_NOTE,
    counts: {
      full: projection.summary.suspendedCount,
      partial: projection.summary.partialCount,
      open: projection.summary.continueCount,
      awaiting: projection.summary.awaitingCount,
    },
    legend: (Object.keys(STATUS_PRESENTATION) as SuspensionStatus[]).map((status) => ({
      status,
      label: getStatusPresentation(status).label,
      color: getStatusPresentation(status).color,
    })),
    lgus: projection.lgus.map((lgu) => ({
      id: lgu.id,
      name: lgu.name,
      status: lgu.status,
      color: getStatusPresentation(lgu.status).color,
    })),
  };
}
