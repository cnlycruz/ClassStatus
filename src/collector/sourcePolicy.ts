import { CollectorSourceConfig, SuspensionRecord } from "@/types";
import { isCurrentOperationalSourceId } from "@/data/sources";

export const TIER_OPERATIONAL_STATE = {
  1: "under-development",
  2: "under-development",
  3: "operational",
} as const;

export function isSourceOperational(source: CollectorSourceConfig): boolean {
  return (
    isCurrentOperationalSourceId(source.id) &&
    source.reliabilityTier === 3 &&
    source.operationalState === "operational" &&
    source.type === "news-reputable"
  );
}

export function isSourceEligible(source: CollectorSourceConfig): boolean {
  return source.enabled && isSourceOperational(source);
}

export function isLiveTier3Record(record: SuspensionRecord): boolean {
  return (
    isCurrentOperationalSourceId(record.source.id) &&
    record.source.reliabilityTier === 3 &&
    record.source.type === "news-reputable" &&
    record.collectorProvenance?.pipeline === "tier3-media" &&
    record.isDemo !== true
  );
}

export function isManualAdminRecord(record: SuspensionRecord): boolean {
  return record.publicationProvenance?.type === "manual-admin" && record.confidence === "admin-verified" && Boolean(record.manualEvidence?.proofUrl);
}

export function isLivePublicationRecord(record: SuspensionRecord): boolean {
  return isLiveTier3Record(record) || isManualAdminRecord(record);
}
