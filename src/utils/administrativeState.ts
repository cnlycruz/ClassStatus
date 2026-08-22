import type { SuspensionRecord } from "@/types";

export function effectiveAdminState(record: SuspensionRecord, now = new Date()): "active" | "pending_removal" | "removed" {
  const state = record.administrativeState || "active";
  if (state === "pending_removal" && record.undoDeadline && now.getTime() >= Date.parse(record.undoDeadline)) return "removed";
  return state;
}
