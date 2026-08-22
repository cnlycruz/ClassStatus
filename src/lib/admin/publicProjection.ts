import type { SuspensionRecord } from "@/types";

export function projectPublicSuspension(record: SuspensionRecord) {
  const manual = record.publicationProvenance?.type === "manual-admin";
  return {
    id: record.id, lguId: record.lguId, ...(record.schoolId ? { schoolId: record.schoolId } : {}),
    status: record.status, affectedLevels: record.affectedLevels, schoolSector: record.schoolSector,
    effectiveDate: record.effectiveDate, ...(record.endDate ? { endDate: record.endDate } : {}),
    ...(record.startTime ? { startTime: record.startTime } : {}), ...(record.endTime ? { endTime: record.endTime } : {}),
    isAllDay: record.isAllDay, untilFurtherNotice: record.untilFurtherNotice === true, durationLabel: record.durationLabel,
    reason: record.reason, announcementSummary: record.announcementSummary, source: record.source,
    additionalSources: record.additionalSources, confidence: record.confidence, publishedAt: record.publishedAt,
    lifecycleState: record.lifecycleState, isUpcoming: record.isUpcoming, isActive: record.isActive, isExpired: record.isExpired,
    publication: manual ? "Manually verified by ClassStatus Admin" : record.publicationProvenance?.publicLabel || "Published from approved Tier 3 media evidence",
    publicationProvenance: manual ? { type: "manual-admin", publicLabel: "Manually verified by ClassStatus Admin" } : { type: "automatic-collector", publicLabel: record.publicationProvenance?.publicLabel || "Published from approved Tier 3 media evidence" },
    provenanceType: manual ? "manual-admin" : "automatic-collector",
    evidenceProvider: manual ? record.manualEvidence?.providerName : record.source.organization,
    proofUrl: manual ? record.manualEvidence?.proofUrl : record.source.url,
    publicNote: manual ? record.manualEvidence?.publicNote : undefined,
    manualEvidence: manual ? { providerPreset: record.manualEvidence?.providerPreset, providerName: record.manualEvidence?.providerName, proofUrl: record.manualEvidence?.proofUrl, publicNote: record.manualEvidence?.publicNote } : undefined,
  };
}
