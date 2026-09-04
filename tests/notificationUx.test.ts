import { describe, expect, it } from "vitest";
import { ALL_LGU_IDS } from "@/data/lgus";
import { allAlertLocations, isOptionalRecipientPreviewFailure, shouldAutoOpenAlertSetup } from "@/lib/notifications/ux";

describe("notification UX state", () => {
  const eligible = { ready: true, supported: true, configured: true, enabled: false, permission: "default" as const, dismissed: false, openedThisVisit: false };

  it("auto-opens only once for an eligible fresh visit", () => {
    expect(shouldAutoOpenAlertSetup(eligible)).toBe(true);
    expect(shouldAutoOpenAlertSetup({ ...eligible, openedThisVisit: true })).toBe(false);
    expect(shouldAutoOpenAlertSetup({ ...eligible, dismissed: true })).toBe(false);
    expect(shouldAutoOpenAlertSetup({ ...eligible, enabled: true })).toBe(false);
    expect(shouldAutoOpenAlertSetup({ ...eligible, permission: "denied" })).toBe(false);
    expect(shouldAutoOpenAlertSetup({ ...eligible, supported: false })).toBe(false);
  });

  it("select all uses the canonical, unique 17-LGU registry", () => {
    const selected = allAlertLocations();
    expect(selected).toEqual(ALL_LGU_IDS);
    expect(selected).toHaveLength(17);
    expect(new Set(selected)).toHaveLength(17);
  });

  it("allows a safe send confirmation when only optional recipient diagnostics fail", () => {
    expect(isOptionalRecipientPreviewFailure(500)).toBe(true);
    expect(isOptionalRecipientPreviewFailure(503)).toBe(true);
    expect(isOptionalRecipientPreviewFailure(403)).toBe(false);
    expect(isOptionalRecipientPreviewFailure(422)).toBe(false);
  });
});
