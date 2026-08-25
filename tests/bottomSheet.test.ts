import { describe, expect, it } from "vitest";
import { getNearestSheetSnap, getSheetSnapHeights, shouldDismissSheet } from "@/lib/bottomSheet";

describe("LGU bottom-sheet gestures", () => {
  it("derives compact, normal, and expanded snap heights from the active viewport", () => {
    expect(getSheetSnapHeights(1000)).toEqual({ compact: 500, normal: 800, expanded: 920 });
  });

  it("snaps a released sheet to the closest intentional resting point", () => {
    expect(getNearestSheetSnap(515, 1000)).toBe("compact");
    expect(getNearestSheetSnap(755, 1000)).toBe("normal");
    expect(getNearestSheetSnap(900, 1000)).toBe("expanded");
  });

  it("does not dismiss for short, slow downward drags", () => {
    expect(shouldDismissSheet({ dragDistance: 95, velocity: 0.2, viewportHeight: 844 })).toBe(false);
  });

  it("dismisses after the viewport-aware distance threshold", () => {
    expect(shouldDismissSheet({ dragDistance: 200, velocity: 0.1, viewportHeight: 844 })).toBe(true);
    expect(shouldDismissSheet({ dragDistance: 180, velocity: 0.1, viewportHeight: 1200 })).toBe(false);
    expect(shouldDismissSheet({ dragDistance: 240, velocity: 0.1, viewportHeight: 1200 })).toBe(true);
  });

  it("allows a deliberate fast downward fling after a meaningful drag distance", () => {
    expect(shouldDismissSheet({ dragDistance: 95, velocity: 1, viewportHeight: 844 })).toBe(false);
    expect(shouldDismissSheet({ dragDistance: 110, velocity: 0.9, viewportHeight: 844 })).toBe(true);
  });
});
