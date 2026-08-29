import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  clampNcrMapScale,
  hasNcrMapGestureMoved,
  initialNcrMapView,
  ncrLabelAnchorTransform,
  ncrLabelCompensation,
  ncrLabelEffectiveScale,
  ncrMapTransform,
  ncrPinchView,
  scalePointAroundAnchor,
  shouldActivateNcrMapTarget,
} from "@/lib/ncrMapInteraction";

const componentSource = fs.readFileSync(
  path.join(process.cwd(), "src", "components", "NcrInteractiveMap.tsx"),
  "utf8"
);

describe("NCR map viewport interaction", () => {
  it("clamps zoom and resets to the original view", () => {
    expect(clampNcrMapScale(0.1)).toBe(0.7);
    expect(clampNcrMapScale(2)).toBe(2);
    expect(clampNcrMapScale(8)).toBe(4);
    expect(initialNcrMapView()).toEqual({ scale: 1, pan: { x: 0, y: 0 } });
    expect(ncrMapTransform({ scale: 2, pan: { x: 12, y: -8 } })).toBe(
      "translate3d(12px, -8px, 0) scale(2)"
    );
  });

  it("uses soft label compensation with the approved effective sizes", () => {
    expect(ncrLabelEffectiveScale(0.7)).toBeCloseTo(Math.sqrt(0.7), 8);
    expect(ncrLabelEffectiveScale(1)).toBe(1);
    expect(ncrLabelEffectiveScale(2)).toBeCloseTo(Math.sqrt(2), 8);
    expect(ncrLabelEffectiveScale(4)).toBe(2);
    expect(ncrLabelEffectiveScale(0.7)).toBeLessThan(ncrLabelEffectiveScale(1));
    expect(ncrLabelEffectiveScale(4)).toBeGreaterThan(ncrLabelEffectiveScale(2));
  });

  it.each([
    ["Caloocan North", { x: 456, y: 108 }],
    ["Caloocan South", { x: 307, y: 332 }],
    ["Navotas", { x: 185, y: 225 }],
    ["Malabon", { x: 258, y: 272 }],
    ["San Juan", { x: 422, y: 430 }],
    ["Mandaluyong", { x: 439, y: 476 }],
    ["Pateros", { x: 503, y: 546 }],
  ])("keeps the %s label anchor fixed at every zoom level", (_name, anchor) => {
    for (const scale of [0.7, 1, 2, 4]) {
      const compensation = ncrLabelCompensation(scale);
      expect(scalePointAroundAnchor(anchor, anchor, compensation)).toEqual(anchor);
      expect(ncrLabelAnchorTransform(anchor, scale)).toBe(
        `translate(${anchor.x} ${anchor.y}) scale(${compensation}) translate(${-anchor.x} ${-anchor.y})`
      );
    }
  });

  it("distinguishes a click from a drag using the existing threshold", () => {
    const start = { x: 20, y: 20 };
    expect(hasNcrMapGestureMoved(start, { x: 28, y: 20 })).toBe(false);
    expect(hasNcrMapGestureMoved(start, { x: 29, y: 20 })).toBe(true);
    expect(shouldActivateNcrMapTarget({ hasMoved: false, hasPinched: false })).toBe(true);
    expect(shouldActivateNcrMapTarget({ hasMoved: true, hasPinched: false })).toBe(false);
    expect(shouldActivateNcrMapTarget({ hasMoved: false, hasPinched: true })).toBe(false);
  });

  it("keeps the pinch midpoint anchored and clamps its scale", () => {
    expect(ncrPinchView({
      startView: initialNcrMapView(),
      startMidpoint: { x: 300, y: 400 },
      currentMidpoint: { x: 300, y: 400 },
      viewportCenter: { x: 400, y: 500 },
      nextScale: 2,
    })).toEqual({ scale: 2, pan: { x: 100, y: 100 } });

    expect(ncrPinchView({
      startView: initialNcrMapView(),
      startMidpoint: { x: 400, y: 500 },
      currentMidpoint: { x: 420, y: 530 },
      viewportCenter: { x: 400, y: 500 },
      nextScale: 10,
    })).toEqual({ scale: 4, pan: { x: 20, y: 30 } });
  });

  it("keeps continuous movement out of React state and removes transform lag", () => {
    expect(componentSource).not.toContain("labelFontScale");
    expect(componentSource).not.toContain("transition-transform");
    expect(componentSource).not.toContain("duration-75");
    expect(componentSource).not.toMatch(/\bsetPan\b|\bsetScale\b/);
    expect(componentSource).toContain("transformLayer.style.transform = ncrMapTransform(view)");
    expect(componentSource).toContain("renderedLabelScaleRef.current !== view.scale");
    expect(componentSource).toContain("requestAnimationFrame");
    expect(componentSource).toContain("setPointerCapture");
    expect(componentSource).toContain("onPointerCancel");
  });

  it("preserves wheel blocking and drag-vs-click selection guards", () => {
    expect(componentSource).toContain('addEventListener("wheel", handleNativeWheel, { passive: false })');
    expect(componentSource).toContain("e.preventDefault()");
    expect(componentSource.match(/shouldActivateNcrMapTarget\(gestureRef\.current\)/g)).toHaveLength(2);
    expect(componentSource).toContain("shouldActivateNcrMapTarget(gesture)");
  });
});
