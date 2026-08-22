import type { EducationLevel, SchoolSector, SuspensionRecord } from "@/types";

export const REASON_PRESETS = [
  "heavy-rain", "flooding", "typhoon", "extreme-heat", "earthquake",
  "transport-disruption", "emergency", "lgu-declaration",
  "school-administration-announcement", "power-interruption", "water-interruption", "other",
] as const;

export const DURATION_PRESETS = [
  "whole-day", "until-further-notice", "morning-classes", "afternoon-classes",
  "evening-classes", "from-specific-time", "other",
] as const;

export const EVIDENCE_PRESETS = [
  "gma-news", "rappler", "lgu-official-announcement", "school-official-announcement",
  "deped", "ched", "pagasa", "other",
] as const;

export type PresetValue = { preset: string; customValue?: string };

export interface ManualSuspensionDraft {
  targetType: "lgu" | "school";
  targetId: string;
  sector: SchoolSector;
  affectedLevels: EducationLevel[];
  effectiveDate: string;
  reason: PresetValue;
  duration: PresetValue & {
    isAllDay?: boolean;
    startTime?: string;
    endTime?: string;
  };
  evidence: PresetValue;
  proofUrl: string;
  publicNote?: string;
}

export interface NormalizedManualDraft extends ManualSuspensionDraft {
  lguId: SuspensionRecord["lguId"];
  targetName: string;
  schoolId?: string;
  resolvedReason: string;
  resolvedDuration: string;
  resolvedEvidenceProvider: string;
  normalizedProofUrl: string;
  status: SuspensionRecord["status"];
}

export interface AdminSessionView {
  id: string;
  csrfToken: string;
  absoluteExpiresAt: string;
  idleExpiresAt: string;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  action: string;
  outcome: "success" | "failure";
  recordId?: string;
  targetSummary?: string;
  correlationId?: string;
  reasonCode?: string;
  effectiveAt?: string;
}

export interface ConfirmationReceipt {
  id: string;
  sessionId: string;
  payloadHash: string;
  expiresAt: string;
  consumedAt?: string;
}

export interface IdempotencyReceipt {
  key: string;
  sessionId: string;
  operation: string;
  payloadHash: string;
  createdAt: string;
  response: unknown;
}

export interface AdminStateDocument {
  schemaVersion: 2;
  records: SuspensionRecord[];
  audit: AuditEntry[];
  confirmations: ConfirmationReceipt[];
  idempotency: IdempotencyReceipt[];
}

export interface StoredSession {
  id: string;
  tokenDigest: string;
  credentialVersion: string;
  createdAt: string;
  lastSeenAt: string;
  absoluteExpiresAt: string;
}

export interface ThrottleBucket {
  fingerprint: string;
  failures: string[];
  lockUntil?: string;
  backoffLevel: number;
}

export interface AdminSecurityDocument {
  schemaVersion: 1;
  activeSession?: StoredSession;
  identifierBuckets: ThrottleBucket[];
  globalFailures: string[];
}
