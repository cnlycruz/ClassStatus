import { ALL_LGU_IDS } from "@/data/lgus";
import type { LGUId } from "@/types";

export const SUSPENSION_ALERTS_DISMISS_KEY = "classstatus-suspension-alerts-auto-prompt-disabled";

export function allAlertLocations(): LGUId[] {
  return [...ALL_LGU_IDS];
}

export function isOptionalRecipientPreviewFailure(status: number): boolean {
  return status >= 500 && status < 600;
}

export function shouldAutoOpenAlertSetup(input: {
  ready: boolean;
  supported: boolean | null;
  configured: boolean;
  enabled: boolean;
  permission: NotificationPermission | "unsupported";
  dismissed: boolean;
  openedThisVisit: boolean;
}): boolean {
  return input.ready && input.supported === true && input.configured && !input.enabled && input.permission !== "denied" && !input.dismissed && !input.openedThisVisit;
}
