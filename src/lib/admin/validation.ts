import { z } from "zod";
import { ALL_LGU_IDS, NCR_LGUS } from "@/data/lgus";
import { NCR_SCHOOLS } from "@/data/schools";
import { getManilaDateString, getManilaTomorrowDateString } from "@/utils/philippineTime";
import type { EducationLevel, SchoolSector } from "@/types";
import { classifySuspensionScope } from "@/lib/suspensions/noticeModel";
import type { ManualSuspensionDraft, NormalizedManualDraft, PresetValue } from "./types";
import { DURATION_PRESETS, EVIDENCE_PRESETS, REASON_PRESETS } from "./types";

const LEVELS: EducationLevel[] = ["all-levels", "preschool", "elementary", "junior-high", "senior-high", "college", "graduate"];
const SECTORS: SchoolSector[] = ["all", "public", "private"];
const labelMap: Record<string, string> = {
  "heavy-rain": "Heavy Rain", flooding: "Flooding", typhoon: "Typhoon", "extreme-heat": "Extreme Heat",
  earthquake: "Earthquake", "transport-disruption": "Transport Disruption", emergency: "Emergency",
  "lgu-declaration": "LGU Declaration", "school-administration-announcement": "School Administration Announcement",
  "power-interruption": "Power Interruption", "water-interruption": "Water Interruption",
  "whole-day": "Whole Day", "until-further-notice": "Until Further Notice", "morning-classes": "Morning Classes",
  "afternoon-classes": "Afternoon Classes", "evening-classes": "Evening Classes", "from-specific-time": "From Specific Time",
  "gma-news": "GMA News", rappler: "Rappler", "lgu-official-announcement": "LGU Official Announcement",
  "school-official-announcement": "School Official Announcement", deped: "DepEd", ched: "CHED", pagasa: "PAGASA",
};

const textValue = z.string().max(120).optional();
const presetSchema = z.object({ preset: z.string().min(1).max(64), customValue: textValue }).strict();
export const manualDraftSchema = z.object({
  targetType: z.enum(["lgu", "school"]), targetId: z.string().min(1).max(100),
  sector: z.enum(["all", "public", "private"]),
  affectedLevels: z.array(z.enum(["all-levels", "preschool", "elementary", "junior-high", "senior-high", "college", "graduate"])).min(1).max(7),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), reason: presetSchema,
  duration: presetSchema.extend({ isAllDay: z.boolean().optional(), startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(), endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional() }).strict(),
  evidence: presetSchema, proofUrl: z.string().min(1).max(2048), publicNote: z.string().max(500).optional(),
});

function cleanText(value: string | undefined, max: number, field: string, required = false): string | undefined {
  if (value === undefined) { if (required) throw new Error(`${field}-required`); return undefined; }
  const cleaned = value.normalize("NFKC").trim().replace(/[ \t]+/g, " ");
  if ((required && !cleaned) || cleaned.length > max || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(cleaned)) throw new Error(`${field}-invalid`);
  return cleaned || undefined;
}

function resolvePreset(input: PresetValue, allowed: readonly string[], field: string): string {
  if (!allowed.includes(input.preset)) throw new Error(`${field}-preset-invalid`);
  if (input.preset === "other") return cleanText(input.customValue, 120, field, true)!;
  if (input.customValue !== undefined) throw new Error(`${field}-custom-not-allowed`);
  return labelMap[input.preset] || input.preset;
}

function normalizeProofUrl(raw: string): string {
  if (/\p{Cc}/u.test(raw)) throw new Error("proof-url-invalid");
  let url: URL; try { url = new URL(raw.trim()); } catch { throw new Error("proof-url-invalid"); }
  if (!/^https?:$/.test(url.protocol) || !url.hostname || url.username || url.password) throw new Error("proof-url-invalid");
  const normalized = url.toString();
  if (normalized.length > 2048) throw new Error("proof-url-invalid");
  return normalized;
}

export function normalizeManualDraft(input: unknown, now = new Date()): NormalizedManualDraft {
  const draft = manualDraftSchema.parse(input) as ManualSuspensionDraft;
  const validDates = [getManilaDateString(now), getManilaTomorrowDateString(now)];
  if (!validDates.includes(draft.effectiveDate)) throw new Error("effective-date-outside-live-window");
  const levels = [...new Set(draft.affectedLevels)];
  if (levels.includes("all-levels") && levels.length > 1) throw new Error("level-scope-invalid");
  if (!levels.every((level) => LEVELS.includes(level)) || !SECTORS.includes(draft.sector)) throw new Error("scope-invalid");

  let lguId: NormalizedManualDraft["lguId"]; let targetName: string; let schoolId: string | undefined; let sector = draft.sector;
  if (draft.targetType === "lgu") {
    if (!ALL_LGU_IDS.includes(draft.targetId as NormalizedManualDraft["lguId"])) throw new Error("target-invalid");
    lguId = draft.targetId as NormalizedManualDraft["lguId"]; targetName = NCR_LGUS[lguId].name;
  } else {
    const school = NCR_SCHOOLS.find((item) => item.id === draft.targetId);
    if (!school) throw new Error("target-invalid");
    lguId = school.lguId; schoolId = school.id; targetName = school.campusName ? `${school.name} — ${school.campusName}` : school.name; sector = school.sector;
    if (!levels.includes("all-levels") && !levels.every((level) => school.levelsOffered.includes(level))) throw new Error("school-level-mismatch");
  }

  const resolvedReason = resolvePreset(draft.reason, REASON_PRESETS, "reason");
  const resolvedEvidenceProvider = resolvePreset(draft.evidence, EVIDENCE_PRESETS, "evidence");
  const resolvedDuration = resolvePreset(draft.duration, DURATION_PRESETS, "duration");
  const partialPreset = ["morning-classes", "afternoon-classes", "evening-classes", "from-specific-time"].includes(draft.duration.preset);
  const customTimed = draft.duration.preset === "other" && draft.duration.isAllDay !== true;
  const needsTime = partialPreset || customTimed;
  if (needsTime && (!draft.duration.startTime || !draft.duration.endTime || draft.duration.startTime >= draft.duration.endTime)) throw new Error("duration-time-invalid");
  if (!needsTime && (draft.duration.startTime || draft.duration.endTime)) throw new Error("duration-time-unexpected");
  const isAllDay = draft.duration.preset === "whole-day" || draft.duration.preset === "until-further-notice" || (draft.duration.preset === "other" && draft.duration.isAllDay === true);
  const status = classifySuspensionScope({
    targetType: draft.targetType,
    affectedLevels: levels,
    schoolSector: sector,
    isAllDay,
  });

  return {
    ...draft, sector, affectedLevels: levels, lguId, schoolId, targetName,
    reason: { preset: draft.reason.preset, ...(draft.reason.preset === "other" ? { customValue: resolvedReason } : {}) },
    duration: { preset: draft.duration.preset, ...(draft.duration.preset === "other" ? { customValue: resolvedDuration } : {}), isAllDay, ...(needsTime ? { startTime: draft.duration.startTime, endTime: draft.duration.endTime } : {}) },
    evidence: { preset: draft.evidence.preset, ...(draft.evidence.preset === "other" ? { customValue: resolvedEvidenceProvider } : {}) },
    publicNote: cleanText(draft.publicNote, 500, "public-note"), resolvedReason, resolvedDuration,
    resolvedEvidenceProvider, normalizedProofUrl: normalizeProofUrl(draft.proofUrl), status,
  };
}
