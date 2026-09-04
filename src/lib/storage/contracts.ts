import type {
  AdminStateDocument,
  AuditEntry,
  ConfirmationReceipt,
} from "@/lib/admin/types";
import type { CollectorFreshness, CollectorLog, SuspensionRecord } from "@/types";

export type DeploymentNamespace = "preview" | "production";
export type LifecycleOperation = "remove" | "undo";

export interface ManualPublishMutation {
  record: SuspensionRecord;
  confirmationId: string;
  confirmationPayloadHash: string;
  requestHash: string;
  idempotencyKey: string;
  sessionId: string;
  targetSummary: string;
}

export interface LifecycleMutation {
  operation: LifecycleOperation;
  recordId: string;
  expectedRevision: number;
  idempotencyKey: string;
  requestHash: string;
  sessionId: string;
}

export interface CollectorUpsertMutation {
  candidate: SuspensionRecord;
  eventKey: string;
  conflictKey: string;
}

export interface CollectedUpsertResult {
  action: "created" | "updated" | "merged" | "unchanged" | "held";
  record: SuspensionRecord;
  reason?: string;
}

export interface AuditPage {
  entries: AuditEntry[];
  total: number;
}

export interface SuspensionStore {
  readState(): Promise<AdminStateDocument>;
  listPublicRecords(): Promise<SuspensionRecord[]>;
  listPublicHistory(): Promise<SuspensionRecord[]>;
  createConfirmation(sessionId: string, payloadHash: string): Promise<ConfirmationReceipt>;
  publishManual(input: ManualPublishMutation): Promise<SuspensionRecord>;
  mutateLifecycle(input: LifecycleMutation): Promise<SuspensionRecord>;
  reconcileExpiredRemovals(now?: Date): Promise<number>;
  appendAudit(entry: Omit<AuditEntry, "id" | "timestamp">): Promise<AuditEntry>;
  listAudit(limit?: number, offset?: number): Promise<AuditPage>;
  upsertCollected(input: CollectorUpsertMutation): Promise<CollectedUpsertResult>;
  clearCollected(): Promise<void>;
  appendCollectorLogs(logs: CollectorLog[]): Promise<void>;
  listCollectorLogs(limit?: number): Promise<CollectorLog[]>;
  getCollectorFreshness(): Promise<CollectorFreshness>;
  recordSuccessfulCollectorCheck(completedAt: string): Promise<void>;
}
