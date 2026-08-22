import {
  ConfidenceRating,
  EducationLevel,
  LGUId,
  SchoolSector,
  SuspensionStatus,
} from "@/types";
import { ALL_LGU_IDS, NCR_LGUS } from "@/data/lgus";
import { NCR_SCHOOLS } from "@/data/schools";
import { getManilaDateString, getManilaTomorrowDateString, getNow } from "@/utils/philippineTime";

export interface ParsedAnnouncement {
  matchedLguIds: LGUId[];
  isAllNCR: boolean;
  scopeKind: "lgu" | "school" | "unknown";
  schoolId?: string;
  status: SuspensionStatus;
  affectedLevels: EducationLevel[];
  schoolSector: SchoolSector;
  effectiveDate: string;
  startTime?: string;
  endTime?: string;
  isAllDay: boolean;
  reason: string;
  summary: string;
  confidence: ConfidenceRating;
  isExplicitNoSuspension: boolean;
  evidenceExcerpt: string;
  parserOutcome: string;
  publishable: boolean;
  rejectionReason?: string;
}

export interface NormalizationContext {
  articleTitle: string;
  publishedAt: string;
  now?: Date;
}

const LGU_ALIASES: Record<LGUId, string[]> = {
  caloocan: ["caloocan", "kalookan", "caloocan city"],
  "las-pinas": ["las piñas", "las pinas", "las piñas city", "las pinas city"],
  makati: ["makati", "makati city"],
  malabon: ["malabon", "malabon city"],
  mandaluyong: ["mandaluyong", "mandaluyong city"],
  manila: ["city of manila", "lungsod ng maynila", "maynila", "manila city", "manila"],
  marikina: ["marikina", "marikina city"],
  muntinlupa: ["muntinlupa", "muntinlupa city"],
  navotas: ["navotas", "navotas city"],
  paranaque: ["parañaque", "paranaque", "parañaque city", "paranaque city"],
  pasay: ["pasay", "pasay city"],
  pasig: ["pasig", "pasig city"],
  pateros: ["pateros", "municipality of pateros", "bayan ng pateros"],
  "quezon-city": ["quezon city", "lungsod quezon", "kyusi"],
  "san-juan": ["san juan city", "city of san juan", "san juan"],
  taguig: ["taguig", "taguig city"],
  valenzuela: ["valenzuela", "valenzuela city"],
};

const SUSPENSION_ACTION = /(walang\s+pasok|walang\s+klase|suspendido\s+ang\s+(?:mga\s+)?klase|class(?:es)?\s+(?:are\s+|have\s+been\s+|will\s+be\s+)?suspended|suspend(?:ed|s)?\s+(?:face-to-face\s+)?classes|class\s+suspension|suspension\s+of\s+(?:face-to-face\s+)?classes|no\s+(?:face-to-face\s+)?classes)/i;
const NO_SUSPENSION = /(tuloy\s+ang\s+(?:pasok|klase)|may\s+pasok|walang\s+suspensiyon|no\s+suspension|classes\s+(?:are\s+)?not\s+suspended|classes\s+(?:will\s+)?continue)/i;
const UNCERTAIN = /(might|may\s+be|could|possibly|rumou?r|unconfirmed|forecast|expected\s+to|authorized\s+to|advised\s+to|at\s+their\s+discretion)/i;
const SCHOOL_WORDS = /(class|classes|klase|pasok|school|paaralan|face-to-face)/i;

function escapeRegex(value: string): string {
  return value.replace(/[\/\\^$*+?.()|[\]{}]/g, "\\$&");
}

function containsAlias(text: string, alias: string): boolean {
  return new RegExp(`(?:^|[^a-z0-9])${escapeRegex(alias)}(?:$|[^a-z0-9])`, "iu").test(text);
}

function matchSchool(text: string) {
  return NCR_SCHOOLS.find((school) => {
    const aliases = [school.name, school.acronym, ...school.aliases]
      .filter((alias) => alias.length >= 4)
      .sort((a, b) => b.length - a.length);
    return aliases.some((alias) => containsAlias(text, alias.toLowerCase()));
  });
}

const NCR_REGION_SCOPE = /\b(?:metro\s+manila|national\s+capital\s+region|ncr)\b/i;
const EXCLUDED_NCR_REGION_SCOPE = /\b(?:outside|except|excluding)\s+(?:metro\s+manila|the\s+national\s+capital\s+region|ncr)\b/i;

function stripDateline(text: string): string {
  return text.replace(/^\s*[A-Z][A-Z\s.'’-]{2,},\s*Philippines\s*[–—-]\s*/u, "");
}

function matchLgus(text: string): { ids: LGUId[]; isAllNCR: boolean } {
  const scopeText = stripDateline(text);
  if (NCR_REGION_SCOPE.test(scopeText) && !EXCLUDED_NCR_REGION_SCOPE.test(scopeText)) {
    return { ids: [...ALL_LGU_IDS], isAllNCR: true };
  }
  const textWithoutMetroManila = scopeText.replace(/metro\s+manila/gi, " ");
  const ids = (Object.entries(LGU_ALIASES) as [LGUId, string[]][])
    .filter(([, aliases]) => aliases.some((alias) => containsAlias(textWithoutMetroManila, alias)))
    .map(([id]) => id);
  return { ids, isAllNCR: false };
}

function extractLevels(text: string): EducationLevel[] {
  if (/(all\s+(?:school\s+)?levels|lahat\s+ng\s+antas|lahat\s+ng\s+lebel)/i.test(text)) return ["all-levels"];
  const levels: EducationLevel[] = [];
  if (/(pre-?school|kindergarten|kinder|day\s*care)/i.test(text)) levels.push("preschool");
  if (/(elementary|primary|grade\s+school|grades?\s+[1-6]\b)/i.test(text)) levels.push("elementary");
  if (/(junior\s+high|\bjhs\b|grades?\s+(?:7|8|9|10)\b)/i.test(text)) levels.push("junior-high");
  if (/(senior\s+high|\bshs\b|grades?\s+(?:11|12)\b)/i.test(text)) levels.push("senior-high");
  if (/(college|tertiary|university|universities|kolehiyo|higher\s+education)/i.test(text)) levels.push("college");
  if (/(graduate\s+school|postgraduate|master'?s|doctoral)/i.test(text)) levels.push("graduate");
  if (/(basic\s+education|k\s*(?:-|to)\s*12|pre-?school\s+to\s+senior\s+high|kindergarten\s+to\s+senior\s+high)/i.test(text)) {
    (["preschool", "elementary", "junior-high", "senior-high"] as EducationLevel[]).forEach((level) => {
      if (!levels.includes(level)) levels.push(level);
    });
  }
  return levels;
}

function extractSector(text: string): SchoolSector | null {
  if (/(public\s+and\s+private|both\s+public\s+and\s+private|pampubliko\s+at\s+pribado)/i.test(text)) return "all";
  if (/(public\s+(?:schools?|institutions?)\s+only|public\s+only|pampubliko\s+lamang|public\s+(?:schools?|institutions?))/i.test(text)) return "public";
  if (/(private\s+(?:schools?|institutions?)\s+only|private\s+only|pribado\s+lamang|private\s+(?:schools?|institutions?))/i.test(text)) return "private";
  return null;
}

const MONTHS: Record<string, string> = {
  january: "01", jan: "01", february: "02", feb: "02", march: "03", mar: "03",
  april: "04", apr: "04", may: "05", june: "06", jun: "06", july: "07", jul: "07",
  august: "08", aug: "08", september: "09", sept: "09", sep: "09", october: "10", oct: "10",
  november: "11", nov: "11", december: "12", dec: "12",
};

function explicitDates(text: string): string[] {
  const dates: string[] = [];
  for (const match of text.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})\b/g)) dates.push(`${match[1]}-${match[2]}-${match[3]}`);
  for (const match of text.matchAll(/\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\.?\s+(\d{1,2}),?\s+(20\d{2})\b/gi)) {
    dates.push(`${match[3]}-${MONTHS[match[1].toLowerCase()]}-${match[2].padStart(2, "0")}`);
  }
  for (const match of text.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/g)) {
    dates.push(`${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`);
  }
  return [...new Set(dates)].filter((date) => !Number.isNaN(Date.parse(`${date}T00:00:00+08:00`)));
}

function resolveEffectiveDate(segment: string, context: NormalizationContext): { date?: string; reason?: string } {
  const now = context.now || getNow();
  const segmentDates = explicitDates(segment);
  if (segmentDates.length > 1) return { reason: "multiple-or-range-dates" };
  let date = segmentDates[0];

  if (!date && /\b(today|ngayong\s+araw|ngayong)\b/i.test(segment)) {
    if (Number.isNaN(Date.parse(context.publishedAt))) return { reason: "invalid-publication-date" };
    date = getManilaDateString(new Date(context.publishedAt));
  }
  if (!date && /\b(tomorrow|bukas)\b/i.test(segment)) {
    if (Number.isNaN(Date.parse(context.publishedAt))) return { reason: "invalid-publication-date" };
    date = getManilaTomorrowDateString(new Date(context.publishedAt));
  }
  if (!date) {
    const titleDates = explicitDates(context.articleTitle);
    if (titleDates.length !== 1) return { reason: "missing-or-ambiguous-effective-date" };
    date = titleDates[0];
  }

  const today = getManilaDateString(now);
  const tomorrow = getManilaTomorrowDateString(now);
  if (date !== today && date !== tomorrow) return { reason: "effective-date-outside-live-window" };
  return { date };
}

function extractTimeWindow(text: string): { isAllDay: boolean; startTime?: string; endTime?: string } {
  const explicit = text.match(/\b(?:from\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*(?:to|-|until)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (explicit) {
    const convert = (hourText: string, minuteText: string | undefined, suffix: string) => {
      let hour = Number(hourText) % 12;
      if (suffix.toLowerCase() === "pm") hour += 12;
      return `${String(hour).padStart(2, "0")}:${minuteText || "00"}`;
    };
    return {
      isAllDay: false,
      startTime: convert(explicit[1], explicit[2], explicit[3]),
      endTime: convert(explicit[4], explicit[5], explicit[6]),
    };
  }
  if (/(afternoon\s+classes|pang-hapon)/i.test(text)) return { isAllDay: false, startTime: "12:00", endTime: "23:59" };
  if (/(morning\s+classes|pang-umaga)/i.test(text)) return { isAllDay: false, startTime: "00:00", endTime: "12:00" };
  return { isAllDay: true };
}

function reasonFrom(text: string): string {
  if (/(typhoon|bagyo|tropical\s+cyclone|habagat|rainfall|heavy\s+rain|inclement\s+weather)/i.test(text)) return "Severe weather / heavy rainfall";
  if (/(heat\s+index|extreme\s+heat)/i.test(text)) return "Extreme heat index";
  if (/(transport\s+strike|tigil\s+pasada)/i.test(text)) return "Transport strike";
  if (/(earthquake|lindol|aftershock)/i.test(text)) return "Earthquake / safety inspection";
  if (/(flood|baha)/i.test(text)) return "Flooding";
  if (/(power\s+interruption|brownout)/i.test(text)) return "Power interruption";
  return "Reason stated in the cited announcement";
}

type SectionKind = "ncr" | "other-region" | "schools";

interface SectionContext {
  kind: SectionKind;
  line: string;
}

interface ScopeOverride {
  ids: LGUId[];
  isAllNCR: boolean;
}

interface LogicalAnnouncementSegment {
  text: string;
  evidenceExcerpt: string;
  scopeOverride?: ScopeOverride;
  schoolOverride?: NonNullable<ReturnType<typeof matchSchool>>;
}

interface PendingTarget {
  line: string;
  section?: SectionContext;
  scopeOverride?: ScopeOverride;
  schoolOverride?: NonNullable<ReturnType<typeof matchSchool>>;
}

function articleLines(rawText: string): string[] {
  return rawText
    .split(/\n+/)
    .map((line) => line.replace(/^[\s•*–—-]+/, "").trim())
    .filter(Boolean)
    .flatMap((line) =>
    line.length > 500 ? line.split(/(?<=[.!?])\s+(?=[A-Z#])/).map((item) => item.trim()).filter(Boolean) : [line]
  );
}

function sectionContext(line: string): SectionContext | undefined {
  const normalized = line.replace(/[:\s]+$/, "").trim();
  if (/^(?:metro\s+manila|national\s+capital\s+region|ncr)$/i.test(normalized)) {
    return { kind: "ncr", line };
  }
  if (/^(?:schools?(?:\s+and\s+universities)?|universities(?:\s+and\s+schools)?)$/i.test(normalized)) {
    return { kind: "schools", line };
  }
  if (/^(?:calabarzon|cordillera\s+administrative\s+region|mimaropa|bangsamoro|barmm|central\s+luzon|cagayan\s+valley|bicol\s+region|ilocos\s+region|western\s+visayas|central\s+visayas|eastern\s+visayas|zamboanga\s+peninsula|northern\s+mindanao|davao\s+region|soccsksargen|caraga|luzon|visayas|mindanao|region\s+(?:[ivx]+|\d+))$/i.test(normalized)) {
    return { kind: "other-region", line };
  }
  return undefined;
}

function isStructuralLead(line: string): boolean {
  return /^(?:below|here)\s+(?:is|are)\s+(?:the\s+)?(?:list\s+of\s+)?(?:class|face-to-face\s+class)(?:es)?\s+suspensions?\b/i.test(line);
}

function hasStatementAction(line: string): boolean {
  return SUSPENSION_ACTION.test(line) || NO_SUSPENSION.test(line);
}

function hasEntryScope(line: string): boolean {
  return extractLevels(line).length > 0 || extractSector(line) !== null || /face-to-face/i.test(line);
}

function hasStrongSchoolIdentity(
  line: string,
  school: NonNullable<ReturnType<typeof matchSchool>>
): boolean {
  return (
    /\b(?:university|college|academy|institute|school|campus)\b/i.test(line) ||
    containsAlias(line.toLowerCase(), school.acronym.toLowerCase())
  );
}

function isArticleActionLead(
  line: string,
  school: ReturnType<typeof matchSchool>,
  scope: ScopeOverride
): boolean {
  return (
    SUSPENSION_ACTION.test(line) &&
    !school &&
    scope.ids.length === 0 &&
    /(?:classes?\s+for\b|some\s+(?:schools?|areas)|schools?\s+and\s+areas)/i.test(line)
  );
}

function logicalSegment(
  textLines: string[],
  evidenceLines: string[],
  target: Pick<PendingTarget, "scopeOverride" | "schoolOverride"> = {}
): LogicalAnnouncementSegment {
  return {
    text: textLines.join("\n"),
    evidenceExcerpt: evidenceLines.join("\n").slice(0, 600),
    ...target,
  };
}

function buildLogicalSegments(rawText: string, articleTitle: string): LogicalAnnouncementSegment[] {
  const segments: LogicalAnnouncementSegment[] = [];
  let articleActionLine = SUSPENSION_ACTION.test(articleTitle) ? articleTitle : undefined;
  let section: SectionContext | undefined;
  let pendingTarget: PendingTarget | undefined;

  for (const line of articleLines(rawText)) {
    const nextSection = sectionContext(line);
    if (nextSection) {
      section = nextSection;
      pendingTarget = undefined;
      continue;
    }
    if (isStructuralLead(line)) {
      pendingTarget = undefined;
      continue;
    }

    const matchingText = stripDateline(line).toLowerCase();
    const detectedSchool = matchSchool(matchingText);
    const school =
      detectedSchool &&
      (section?.kind !== "other-region" || hasStrongSchoolIdentity(line, detectedSchool))
        ? detectedSchool
        : undefined;
    const lguScope = matchLgus(matchingText);
    const statementAction = hasStatementAction(line);
    const articleLead = isArticleActionLead(line, school, lguScope);

    if (articleLead) {
      articleActionLine = line;
      pendingTarget = undefined;
      continue;
    }

    const hasExplicitTarget = Boolean(school) || lguScope.ids.length > 0;
    if (hasExplicitTarget) {
      pendingTarget = undefined;
      const target: Pick<PendingTarget, "scopeOverride" | "schoolOverride"> = school
        ? { schoolOverride: school }
        : { scopeOverride: lguScope };

      if (statementAction) {
        segments.push(logicalSegment([line], section ? [section.line, line] : [line], target));
        continue;
      }

      if (section?.kind === "other-region") continue;

      const canUseArticleAction =
        Boolean(articleActionLine) &&
        hasEntryScope(line);
      if (canUseArticleAction) {
        segments.push(
          logicalSegment(
            [articleActionLine as string, line],
            [articleActionLine as string, ...(section ? [section.line] : []), line],
            target
          )
        );
        continue;
      }

      pendingTarget = {
        line,
        section,
        ...target,
      };
      continue;
    }

    if (statementAction) {
      if (pendingTarget) {
        segments.push(
          logicalSegment(
            [pendingTarget.line, line],
            [...(pendingTarget.section ? [pendingTarget.section.line] : []), pendingTarget.line, line],
            pendingTarget
          )
        );
        pendingTarget = undefined;
        continue;
      }
      if (section?.kind === "ncr") {
        segments.push(
          logicalSegment([line], [section.line, line], {
            scopeOverride: { ids: [...ALL_LGU_IDS], isAllNCR: true },
          })
        );
        continue;
      }
      if (section?.kind === "other-region" || section?.kind === "schools") {
        pendingTarget = undefined;
        continue;
      }
      segments.push(logicalSegment([line], [line]));
      continue;
    }

    // A pending target may inherit only from its immediate substantive continuation.
    pendingTarget = undefined;
  }

  return segments;
}

function rejected(excerpt: string, reason: string, overrides: Partial<ParsedAnnouncement> = {}): ParsedAnnouncement {
  return {
    matchedLguIds: [],
    isAllNCR: false,
    scopeKind: "unknown",
    status: "awaiting-information",
    affectedLevels: [],
    schoolSector: "all",
    effectiveDate: "",
    isAllDay: true,
    reason: "",
    summary: "",
    confidence: "low",
    isExplicitNoSuspension: NO_SUSPENSION.test(excerpt),
    evidenceExcerpt: excerpt.slice(0, 600),
    parserOutcome: `rejected:${reason}`,
    publishable: false,
    rejectionReason: reason,
    ...overrides,
  };
}

export function normalizeAnnouncementSegments(rawText: string, context: NormalizationContext): ParsedAnnouncement[] {
  const relevantSegments = buildLogicalSegments(rawText, context.articleTitle).filter(
    (segment) => SCHOOL_WORDS.test(segment.text) && hasStatementAction(segment.text)
  );
  if (relevantSegments.length === 0) return [rejected(context.articleTitle, "no-explicit-suspension-statement")];

  return relevantSegments.map((segment) => {
    const text = segment.text;
    const evidence = segment.evidenceExcerpt;
    if (NO_SUSPENSION.test(text)) return rejected(evidence, "explicit-no-suspension");
    if (UNCERTAIN.test(text)) return rejected(evidence, "uncertain-or-advisory-language");
    if (/until\s+further\s+notice|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\s*(?:-|to|through)\s*\d{1,2}/i.test(text)) {
      return rejected(evidence, "multiple-or-range-dates");
    }
    if (!SUSPENSION_ACTION.test(text)) return rejected(evidence, "missing-explicit-suspension-action");

    const school = segment.schoolOverride || matchSchool(stripDateline(text).toLowerCase());
    if (school) {
      return rejected(evidence, "school-specific-not-live", {
        matchedLguIds: [school.lguId],
        scopeKind: "school",
        schoolId: school.id,
        parserOutcome: "held:school-specific",
      });
    }

    const lguMatch = segment.scopeOverride || matchLgus(stripDateline(text).toLowerCase());
    if (lguMatch.ids.length === 0) return rejected(evidence, "missing-ncr-lgu");
    const levels = extractLevels(text);
    if (levels.length === 0) return rejected(evidence, "missing-education-level-scope", { matchedLguIds: lguMatch.ids, isAllNCR: lguMatch.isAllNCR, scopeKind: "lgu" });
    const sector = extractSector(text);
    if (!sector) return rejected(evidence, "missing-school-sector-scope", { matchedLguIds: lguMatch.ids, isAllNCR: lguMatch.isAllNCR, scopeKind: "lgu" });
    const resolvedDate = resolveEffectiveDate(text, context);
    if (!resolvedDate.date) return rejected(evidence, resolvedDate.reason || "invalid-effective-date", { matchedLguIds: lguMatch.ids, isAllNCR: lguMatch.isAllNCR, scopeKind: "lgu" });

    const time = extractTimeWindow(text);
    const modalityOnly = /face-to-face/i.test(text) && SUSPENSION_ACTION.test(text);
    const status: SuspensionStatus =
      modalityOnly || !time.isAllDay || !levels.includes("all-levels")
        ? "partial-suspension"
        : "classes-suspended";
    const reason = reasonFrom(`${context.articleTitle} ${text}`);
    const location = lguMatch.isAllNCR
      ? "all 17 NCR LGUs"
      : lguMatch.ids.map((id) => NCR_LGUS[id].name).join(", ");
    const summary = `${status === "classes-suspended" ? "Classes are suspended" : "A scoped class suspension is in effect"} in ${location} on ${resolvedDate.date}.`;

    return {
      matchedLguIds: lguMatch.ids,
      isAllNCR: lguMatch.isAllNCR,
      scopeKind: "lgu",
      status,
      affectedLevels: levels,
      schoolSector: sector,
      effectiveDate: resolvedDate.date,
      ...time,
      reason,
      summary,
      confidence: "medium",
      isExplicitNoSuspension: false,
      evidenceExcerpt: evidence,
      parserOutcome: "accepted:tier3-explicit-lgu-suspension",
      publishable: true,
    };
  });
}

/** Compatibility helper for callers that normalize a single statement. */
export function normalizeAnnouncement(rawText: string, baseDate: Date = getNow()): ParsedAnnouncement {
  return normalizeAnnouncementSegments(rawText, {
    articleTitle: rawText,
    publishedAt: baseDate.toISOString(),
    now: baseDate,
  })[0];
}
