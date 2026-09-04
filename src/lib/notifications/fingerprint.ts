import { createHash } from "node:crypto";
import type { DeploymentNamespace } from "@/lib/storage/contracts";
import type { EducationLevel, SuspensionRecord } from "@/types";

function hash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function normalizedLevels(levels: EducationLevel[]): EducationLevel[] {
  return levels.includes("all-levels") ? ["all-levels"] : [...new Set(levels)].sort() as EducationLevel[];
}

/**
 * Represents one material public state. Evidence, run IDs, and timestamps are
 * deliberately excluded: they describe discovery, not the public advisory.
 */
export function notificationFingerprint(namespace: DeploymentNamespace, record: SuspensionRecord): string {
  return `v1:${hash(JSON.stringify({
    namespace,
    lguId: record.lguId,
    schoolId: record.schoolId || null,
    effectiveDate: record.effectiveDate,
    status: record.status,
    affectedLevels: normalizedLevels(record.affectedLevels),
    schoolSector: record.schoolSector,
    endDate: record.endDate || null,
    isAllDay: record.isAllDay,
    untilFurtherNotice: record.untilFurtherNotice === true,
    startTime: record.startTime || null,
    endTime: record.endTime || null,
  }))}`;
}

export function notificationFamilyFingerprint(namespace: DeploymentNamespace, record: SuspensionRecord): string {
  return `v1f:${hash(JSON.stringify({
    namespace,
    lguId: record.lguId,
    schoolId: record.schoolId || null,
    effectiveDate: record.effectiveDate,
  }))}`;
}
