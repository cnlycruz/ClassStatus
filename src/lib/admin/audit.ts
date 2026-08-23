import type { AuditEntry } from "./types";
import { suspensionStore } from "@/lib/storage";

export function appendAudit(input: Omit<AuditEntry, "id" | "timestamp">): Promise<AuditEntry> {
  return suspensionStore.appendAudit(input);
}

export async function listAudit(limit = 100): Promise<AuditEntry[]> {
  return (await suspensionStore.listAudit(Math.max(1, Math.min(limit, 200)))).entries;
}
