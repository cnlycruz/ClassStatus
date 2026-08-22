export type LGUId =
  | "caloocan"
  | "las-pinas"
  | "makati"
  | "malabon"
  | "mandaluyong"
  | "manila"
  | "marikina"
  | "muntinlupa"
  | "navotas"
  | "paranaque"
  | "pasay"
  | "pasig"
  | "pateros"
  | "quezon-city"
  | "san-juan"
  | "taguig"
  | "valenzuela";

export type SuspensionStatus =
  | "classes-suspended"
  | "partial-suspension"
  | "classes-continue"
  | "awaiting-information";

export type LifecycleState =
  | "discovered"
  | "parsed"
  | "validated"
  | "upcoming"
  | "active"
  | "expired";

export type EducationLevel =
  | "all-levels"
  | "preschool"
  | "elementary"
  | "junior-high"
  | "senior-high"
  | "college"
  | "graduate";

export type SchoolSector = "all" | "public" | "private";

export type ConfidenceRating = "high" | "medium" | "low" | "unverified" | "demo" | "admin-verified";
export type AdministrativeState = "active" | "pending_removal" | "removed";
export type PublicationProvenance =
  | { type: "automatic-collector"; publicLabel: string }
  | { type: "manual-admin"; publicLabel: "Manually verified by ClassStatus Admin" };

export type SourceOperationalState = "operational" | "under-development";
export type SourceHealthStatus =
  | "healthy"
  | "reachable_no_candidates"
  | "degraded"
  | "blocked"
  | "failed";

export type SourceType =
  | "official-lgu"
  | "deped"
  | "ched"
  | "ndrrmc-mmda"
  | "pagasa"
  | "school-official"
  | "news-reputable"
  | "manual-evidence";

export interface SourceCitation {
  id: string;
  name: string;
  organization: string;
  url: string;
  type: SourceType;
  reliabilityTier?: 1 | 2 | 3; // Manual evidence is intentionally outside collector tiers.
  verified: boolean;
  publishedAt: string; // ISO string
  updatedAt?: string;
  articleTitle?: string;
  evidenceExcerpt?: string;
  evidenceFingerprint?: string;
}

export interface SuspensionRecord {
  id: string;
  lguId: LGUId;
  schoolId?: string; // Optional if specific school-level suspension
  status: SuspensionStatus;
  affectedLevels: EducationLevel[];
  schoolSector: SchoolSector;
  effectiveDate: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  startTime?: string; // e.g. "06:00" or "12:00"
  endTime?: string; // e.g. "18:00" or "23:59"
  isAllDay: boolean;
  reason: string; // e.g., "Typhoon Enteng / Heavy Rainfall Advisory", "Extreme Heat Index (44°C)", "Transport Strike"
  announcementSummary: string;
  fullAnnouncementText?: string;
  source: SourceCitation;
  additionalSources?: SourceCitation[];
  confidence: ConfidenceRating;
  discoveredAt: string;
  publishedAt: string;
  lifecycleState: LifecycleState;
  isUpcoming: boolean;
  isActive: boolean;
  isExpired: boolean;
  isDemo?: boolean;
  eventKey?: string;
  parserOutcome?: string;
  collectorProvenance?: {
    pipeline: "tier3-media";
    runId: string;
    collectedAt: string;
  };
  publicationProvenance?: PublicationProvenance;
  administrativeState?: AdministrativeState;
  revision?: number;
  durationLabel?: string;
  untilFurtherNotice?: boolean;
  manualEvidence?: {
    providerPreset: string;
    providerName: string;
    proofUrl: string;
    publicNote?: string;
  };
  removalRequestedAt?: string;
  undoDeadline?: string;
  removalFinalizedAt?: string;
}

export interface LGUInfo {
  id: LGUId;
  name: string;
  nativeName: string;
  type: "city" | "municipality";
  district: "CAMANAVA" | "Capital" | "Eastern Manila" | "Southern Manila";
  population: number;
  areaKm2: number;
  mayor: string;
  officialWebsite: string;
  officialFacebook?: string;
  officialTwitter?: string;
  center: [number, number]; // [longitude, latitude]
  labelCoords: { x: number; y: number }; // SVG layout coordinates
  hasNorthSouthDivision?: boolean; // True for Caloocan
  majorSchoolsCount?: number;
}

export interface SchoolInfo {
  id: string;
  name: string;
  aliases: string[];
  acronym: string;
  campusName?: string;
  lguId: LGUId;
  address: string;
  sector: "public" | "private";
  levelsOffered: EducationLevel[];
  website?: string;
  facebookPage?: string;
  customStatusOverride?: SuspensionRecord;
}

export interface CollectorLog {
  id: string;
  runId?: string;
  timestamp: string;
  level: "info" | "warn" | "error" | "success";
  sourceId: string;
  sourceName: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface CollectorSourceConfig {
  id: string;
  name: string;
  organization: string;
  url: string;
  publicUrl?: string;
  type: SourceType;
  reliabilityTier: 1 | 2 | 3;
  operationalState: SourceOperationalState;
  enabled: boolean;
  checkIntervalMinutes: number;
  lastCheckedAt?: string;
  lastStatus?: "success" | "error" | "pending";
  healthStatus?: SourceHealthStatus;
  healthMessage?: string;
  lastErrorMessage?: string;
  totalCollected: number;
  consecutiveFailures: number;
}

export interface CollectorSummary {
  runId: string;
  startedAt: string;
  completedAt: string;
  sourcesConfigured: number;
  sourcesEligible: number;
  sourcesSkipped: number;
  sourcesProcessed: number;
  sourcesSucceeded: number;
  sourcesFailed: number;
  announcementsDiscovered: number;
  announcementsValidated: number;
  announcementsPublished: number;
  announcementsRejected: number;
  announcementsHeld: number;
  sourceHealth: Array<{
    sourceId: string;
    health: SourceHealthStatus;
    candidateCount: number;
    message?: string;
  }>;
  logs: CollectorLog[];
}

export interface MayPasokSummary {
  updatedAt: string;
  philippineTimeFormatted: string;
  todayDateFormatted: string;
  totalLgus: number;
  suspendedCount: number;
  partialCount: number;
  continueCount: number;
  awaitingCount: number;
  upcomingCount: number;
  hasUpcomingSuspensions: boolean;
  overallStatusHeadline: string;
  activeWeatherAdvisory?: {
    signalLevel?: number;
    name?: string;
    warningType?: string;
  };
}
