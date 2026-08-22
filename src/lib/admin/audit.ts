import { randomUUID } from "crypto";
import type { AuditEntry } from "./types";
import { suspensionStore } from "@/lib/storage";

export function appendAudit(input: Omit<AuditEntry, "id" | "timestamp">): AuditEntry {
  return suspensionStore.mutateState((state) => {
    const entry: AuditEntry = { id: randomUUID(), timestamp: new Date().toISOString(), ...input };
    state.audit.unshift(entry);
    state.audit = state.audit.slice(0, 1000);
    return entry;
  });
}

export function listAudit(limit = 100): AuditEntry[] {
  return suspensionStore.readState().audit.slice(0, Math.max(1, Math.min(limit, 200)));
}
