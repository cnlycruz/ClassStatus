import type { AdminSecurityDocument, AdminStateDocument, AuditEntry } from "@/lib/admin/types";

export interface SuspensionStore {
  readState(): AdminStateDocument;
  mutateState<T>(mutation: (state: AdminStateDocument) => T): T;
}

export interface AdminSecurityStore {
  readSecurity(): AdminSecurityDocument;
  mutateSecurity<T>(mutation: (state: AdminSecurityDocument) => T): T;
}

export interface AuditStore {
  appendAudit(entry: AuditEntry): void;
  listAudit(limit?: number): AuditEntry[];
}

export interface RemovalReconciler {
  reconcileExpiredRemovals(now?: Date): number;
}
