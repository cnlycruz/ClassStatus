import { createHash } from "node:crypto";
import type {
  EducationLevel,
  SchoolSector,
  SourceCitation,
  SuspensionRecord,
  SuspensionStatus,
} from "@/types";
import type { DeploymentNamespace } from "@/lib/storage/contracts";

export const COLLECTOR_PARSER_OUTCOME_V2 = "accepted:tier3-lgu-suspension:v2";

const ALL_SPECIFIC_LEVELS: EducationLevel[] = [
  "preschool",
  "elementary",
  "junior-high",
  "senior-high",
  "college",
  "graduate",
];

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function normalizedOrganization(source: SourceCitation): string {
  return source.organization.normalize("NFKC").trim().toLocaleLowerCase("en");
}

function normalizedLevels(levels: EducationLevel[]): EducationLevel[] {
  return levels.includes("all-levels")
    ? ["all-levels"]
    : [...new Set(levels)].sort() as EducationLevel[];
}

export function classifySuspensionScope(input: {
  targetType: "lgu" | "school";
  affectedLevels: EducationLevel[];
  schoolSector: SchoolSector;
  isAllDay: boolean;
  hasNarrowerRestriction?: boolean;
}): SuspensionStatus {
  const fullTargetLevels = input.affectedLevels.includes("all-levels");
  const fullTargetSector = input.targetType === "school" || input.schoolSector === "all";
  return fullTargetLevels && fullTargetSector && input.isAllDay && !input.hasNarrowerRestriction
    ? "classes-suspended"
    : "partial-suspension";
}

export function noticeFamilyKey(
  namespace: DeploymentNamespace,
  record: Pick<SuspensionRecord, "lguId" | "schoolId" | "effectiveDate">
): string {
  const target = record.schoolId ? `school:${record.schoolId}` : `lgu:${record.lguId}`;
  const material = ["classstatus-notice-family-v2", namespace, target, record.effectiveDate].join("\n");
  return `v2f:${sha256(material)}`;
}

export function noticeWindowKey(
  record: Pick<SuspensionRecord, "effectiveDate" | "endDate" | "isAllDay" | "untilFurtherNotice" | "startTime" | "endTime">
): string {
  if (record.untilFurtherNotice) return "until-further-notice";
  const endDate = record.endDate || record.effectiveDate;
  if (record.isAllDay) return `all-day:${endDate}`;
  return `time:${record.startTime || ""}-${record.endTime || ""}:${endDate}`;
}

export function noticeEventKey(
  namespace: DeploymentNamespace,
  record: Pick<SuspensionRecord, "lguId" | "schoolId" | "effectiveDate" | "endDate" | "isAllDay" | "untilFurtherNotice" | "startTime" | "endTime">
): string {
  const family = noticeFamilyKey(namespace, record);
  const material = ["classstatus-notice-event-v2", family, noticeWindowKey(record)].join("\n");
  return `v2e:${sha256(material)}`;
}

export function hasCanonicalV2Keys(eventKey: string, familyKey: string): boolean {
  return /^v2e:[0-9a-f]{64}$/.test(eventKey) && /^v2f:[0-9a-f]{64}$/.test(familyKey);
}

export function sameNoticeFamily(
  namespace: DeploymentNamespace,
  left: Pick<SuspensionRecord, "lguId" | "schoolId" | "effectiveDate">,
  right: Pick<SuspensionRecord, "lguId" | "schoolId" | "effectiveDate">
): boolean {
  return noticeFamilyKey(namespace, left) === noticeFamilyKey(namespace, right);
}

function timeValue(value: string | undefined, fallback: number): number {
  if (!value || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return fallback;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function noticeWindowsOverlap(
  left: Pick<SuspensionRecord, "isAllDay" | "untilFurtherNotice" | "startTime" | "endTime">,
  right: Pick<SuspensionRecord, "isAllDay" | "untilFurtherNotice" | "startTime" | "endTime">
): boolean {
  if (left.isAllDay || left.untilFurtherNotice || right.isAllDay || right.untilFurtherNotice) return true;
  const leftStart = timeValue(left.startTime, 0);
  const leftEnd = timeValue(left.endTime, 24 * 60);
  const rightStart = timeValue(right.startTime, 0);
  const rightEnd = timeValue(right.endTime, 24 * 60);
  return leftStart < rightEnd && rightStart < leftEnd;
}

function levelsCover(covering: EducationLevel[], covered: EducationLevel[]): boolean {
  if (covering.includes("all-levels")) return true;
  if (covered.includes("all-levels")) return false;
  const set = new Set(covering);
  return covered.every((level) => set.has(level));
}

function sectorCovers(covering: SchoolSector, covered: SchoolSector): boolean {
  return covering === "all" || covering === covered;
}

function windowCovers(
  covering: Pick<SuspensionRecord, "isAllDay" | "untilFurtherNotice" | "startTime" | "endTime">,
  covered: Pick<SuspensionRecord, "isAllDay" | "untilFurtherNotice" | "startTime" | "endTime">
): boolean {
  if (covering.untilFurtherNotice) return true;
  if (covering.isAllDay) return !covered.untilFurtherNotice;
  if (covered.isAllDay || covered.untilFurtherNotice) return false;
  return timeValue(covering.startTime, 0) <= timeValue(covered.startTime, 0)
    && timeValue(covering.endTime, 24 * 60) >= timeValue(covered.endTime, 24 * 60);
}

export type ScopeRelation = "equal" | "expands" | "narrows" | "incompatible";

export function compareNoticeScope(existing: SuspensionRecord, candidate: SuspensionRecord): ScopeRelation {
  if (!noticeWindowsOverlap(existing, candidate)) return "incompatible";
  const candidateCovers = levelsCover(candidate.affectedLevels, existing.affectedLevels)
    && sectorCovers(candidate.schoolSector, existing.schoolSector)
    && windowCovers(candidate, existing);
  const existingCovers = levelsCover(existing.affectedLevels, candidate.affectedLevels)
    && sectorCovers(existing.schoolSector, candidate.schoolSector)
    && windowCovers(existing, candidate);

  const sameStatus = existing.status === candidate.status;
  const sameReason = existing.reason === candidate.reason;
  if (candidateCovers && existingCovers && sameStatus && sameReason) return "equal";
  if (candidateCovers && !existingCovers) return "expands";
  if (existingCovers && !candidateCovers) return "narrows";
  if (candidateCovers && existingCovers) return "equal";
  return "incompatible";
}

export function semanticNoticeFingerprint(record: SuspensionRecord): string {
  return sha256(JSON.stringify({
    status: record.status,
    affectedLevels: normalizedLevels(record.affectedLevels),
    schoolSector: record.schoolSector,
    effectiveDate: record.effectiveDate,
    endDate: record.endDate || null,
    isAllDay: record.isAllDay,
    untilFurtherNotice: record.untilFurtherNotice === true,
    startTime: record.startTime || null,
    endTime: record.endTime || null,
    reason: record.reason,
    announcementSummary: record.announcementSummary,
  }));
}

export function sourceEvidenceFingerprint(source: SourceCitation): string {
  return source.evidenceFingerprint || sha256(JSON.stringify({
    organization: normalizedOrganization(source),
    url: source.url,
    publishedAt: source.publishedAt,
    updatedAt: source.updatedAt || null,
    evidenceExcerpt: source.evidenceExcerpt || null,
  }));
}

export function sameSourceOrganization(left: SourceCitation, right: SourceCitation): boolean {
  return normalizedOrganization(left) === normalizedOrganization(right);
}

export function currentSources(record: SuspensionRecord): SourceCitation[] {
  const result: SourceCitation[] = [];
  const seen = new Set<string>();
  for (const source of [record.source, ...(record.additionalSources || [])]) {
    const organization = normalizedOrganization(source);
    if (!organization || seen.has(organization)) continue;
    seen.add(organization);
    result.push(source);
  }
  return result;
}

export function replaceCurrentOrganizationSource(
  sources: SourceCitation[],
  incoming: SourceCitation
): SourceCitation[] {
  const organization = normalizedOrganization(incoming);
  const retained = sources.filter((source) => normalizedOrganization(source) !== organization);
  return [incoming, ...retained];
}

export function sourceUpdatedAt(source: SourceCitation): number {
  const value = Date.parse(source.updatedAt || source.publishedAt);
  return Number.isFinite(value) ? value : 0;
}

export function specificLevelSet(levels: EducationLevel[]): EducationLevel[] {
  return levels.includes("all-levels") ? ALL_SPECIFIC_LEVELS : levels;
}
