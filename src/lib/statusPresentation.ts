import type { SuspensionStatus } from "@/types";

export interface StatusPresentation {
  label: string;
  shortLabel: string;
  color: string;
}

export const STATUS_PRESENTATION = {
  "classes-suspended": {
    label: "Full suspension",
    shortLabel: "Full",
    color: "#EF4444",
  },
  "partial-suspension": {
    label: "Partial suspension",
    shortLabel: "Partial",
    color: "#F59E0B",
  },
  "classes-continue": {
    label: "Classes open",
    shortLabel: "Open",
    color: "#10B981",
  },
  "awaiting-information": {
    label: "Awaiting info",
    shortLabel: "Awaiting",
    color: "#94A3B8",
  },
} as const satisfies Record<SuspensionStatus, StatusPresentation>;

export function getStatusPresentation(status: SuspensionStatus): StatusPresentation {
  return STATUS_PRESENTATION[status];
}
