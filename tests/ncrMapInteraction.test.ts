import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  clampNcrMapScale,
  hasNcrMapGestureMoved,
  initialNcrMapView,
  NCR_MAP_BASE_VIEWBOX,
  ncrLabelAnchorTransform,
  ncrLabelCompensation,
  ncrLabelEffectiveScale,
  ncrMapSvgTransform,
  ncrPanView,
  ncrPinchView,
  scalePointAroundAnchor,
  shouldCaptureNcrMapPointer,
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
    expect(ncrMapSvgTransform(initialNcrMapView(), { width: 360, height: 515 })).toBe(
      "translate(0 0) scale(1)"
    );
  });

  it("converts pixel pan and centered zoom into a native SVG transform", () => {
    expect(ncrMapSvgTransform(
      { scale: 2, pan: { x: 24, y: -18 } },
      { width: 360, height: 515 }
    )).toBe("translate(-350.93333333333334 -536.8) scale(2)");
  });

  it("uses the modestly taller mobile card and centered default framing", () => {
    expect(componentSource).toContain("h-[60dvh] min-h-[440px]");
    expect(componentSource).not.toContain("h-[58dvh] min-h-[420px]");
    expect(componentSource).toContain("viewBox={`${NCR_MAP_BASE_VIEWBOX.x}");
    expect(NCR_MAP_BASE_VIEWBOX).toEqual({ x: 32, y: 0, width: 736, height: 1000 });
  });

  it("keeps native SVG transforms deterministic across repeated updates and reset", () => {
    const viewport = { width: 360, height: 515 };
    const view = { scale: 2, pan: { x: 24, y: -18 } };
    const expected = ncrMapSvgTransform(view, viewport);

    for (let cycle = 0; cycle < 20; cycle += 1) {
      expect(ncrMapSvgTransform(view, viewport)).toBe(expected);
      expect(ncrMapSvgTransform(initialNcrMapView(), viewport)).toBe("translate(0 0) scale(1)");
    }
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

  it("keeps the drag threshold independent from pointer capture", () => {
    const start = { x: 120, y: 200 };

    // Pointer capture starts at pointerdown to retain continuous mobile move
    // events, while activation still depends on the movement threshold.
    expect(shouldCaptureNcrMapPointer({ pointerCount: 1, start, current: start })).toBe(false);
    expect(shouldCaptureNcrMapPointer({ pointerCount: 1, start, current: { x: 128, y: 200 } })).toBe(false);
    expect(shouldActivateNcrMapTarget({ hasMoved: false, hasPinched: false })).toBe(true);

    // A drag crosses the existing threshold; a second active pointer is a pinch.
    expect(shouldCaptureNcrMapPointer({ pointerCount: 1, start, current: { x: 129, y: 200 } })).toBe(true);
    expect(shouldCaptureNcrMapPointer({ pointerCount: 2, start, current: start })).toBe(true);
    expect(shouldActivateNcrMapTarget({ hasMoved: true, hasPinched: false })).toBe(false);
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

  it("applies every subsequent one-finger drag position", () => {
    // The touch starts at (100, 100) with an existing pan of (12, -8), so
    // each pointermove must produce a new viewport rather than stopping after
    // the first frame.
    const dragOffset = { x: 88, y: 108 };
    const moves = [
      { x: 109, y: 104 },
      { x: 122, y: 112 },
      { x: 145, y: 127 },
      { x: 171, y: 149 },
    ];

    expect(moves.map((currentPoint) => ncrPanView({
      scale: 1.6,
      dragOffset,
      currentPoint,
    }))).toEqual([
      { scale: 1.6, pan: { x: 21, y: -4 } },
      { scale: 1.6, pan: { x: 34, y: 4 } },
      { scale: 1.6, pan: { x: 57, y: 19 } },
      { scale: 1.6, pan: { x: 83, y: 41 } },
    ]);
  });

  it("keeps continuous movement out of React state and removes transform lag", () => {
    expect(componentSource).not.toContain("labelFontScale");
    expect(componentSource).not.toContain("transition-transform");
    expect(componentSource).not.toContain("duration-75");
    expect(componentSource).not.toMatch(/\bsetPan\b|\bsetScale\b/);
    expect(componentSource).not.toContain("translate3d");
    expect(componentSource).not.toContain("transformLayerRef");
    expect(componentSource).not.toContain("willChange");
    expect(componentSource).toContain("mapGroup.setAttribute(");
    expect(componentSource).toContain("ncrMapSvgTransform(view");
    expect(componentSource).toContain("ncrPanView({");
    expect(componentSource).toContain('textRendering="geometricPrecision"');
    expect(componentSource).toContain("renderedLabelScaleRef.current === scale");
    expect(componentSource).toContain("requestAnimationFrame");
    expect(componentSource).toContain("shouldCaptureNcrMapPointer");
    expect(componentSource).toContain("setPointerCapture");
    expect(componentSource).toContain("onPointerCancel");
  });

  it("preserves wheel blocking and drag-vs-click selection guards", () => {
    expect(componentSource).toContain('addEventListener("wheel", handleNativeWheel, { passive: false })');
    expect(componentSource).toContain("e.preventDefault()");
    expect(componentSource.match(/shouldActivateNcrMapTarget\(gestureRef\.current\)/g)).toHaveLength(2);
    expect(componentSource).toContain("shouldActivateNcrMapTarget(gesture)");
  });

  it("captures touch immediately but waits for a real drag before capturing a mouse", () => {
    const pointerDown = componentSource.slice(
      componentSource.indexOf("const handlePointerDown"),
      componentSource.indexOf("const handlePointerMove")
    );
    const pointerMove = componentSource.slice(
      componentSource.indexOf("const handlePointerMove"),
      componentSource.indexOf("const finishPointer")
    );

    expect(pointerDown).toContain('if (event.pointerType !== "mouse")');
    expect(pointerDown).toContain("setPointerCapture(event.pointerId)");
    expect(pointerMove).toContain("shouldCaptureNcrMapPointer");
    expect(pointerMove).toContain("setPointerCapture(event.pointerId)");
    expect(pointerMove.indexOf("setPointerCapture(event.pointerId)")).toBeGreaterThan(pointerMove.indexOf("shouldCaptureNcrMapPointer"));
    expect(componentSource.match(/onSelectLgu\(pathItem\.lguId\)/g)).toHaveLength(3);
    expect(componentSource).toContain("onClearSelection()");
  });

  it("retains a continuous touch drag and resets it through pointer cancellation", () => {
    const pointerDown = componentSource.slice(
      componentSource.indexOf("const handlePointerDown"),
      componentSource.indexOf("const handlePointerMove")
    );
    const pointerMove = componentSource.slice(
      componentSource.indexOf("const handlePointerMove"),
      componentSource.indexOf("const finishPointer")
    );
    const finishPointer = componentSource.slice(
      componentSource.indexOf("const finishPointer"),
      componentSource.indexOf("const handleCanvasClick")
    );

    // A touch pointer is captured before any of four continuous moves. The
    // RAF gate clears itself, so each later frame can apply its newest view.
    expect(pointerDown).toContain("gesture.pointers.set(event.pointerId, point)");
    expect(pointerDown).toContain("event.currentTarget.setPointerCapture(event.pointerId)");
    expect(pointerMove).toContain("gesture.pointers.set(event.pointerId, point)");
    expect(componentSource).toContain("viewFrameRef.current = null;");
    expect(componentSource).toContain("onPointerUp={finishPointer}");
    expect(componentSource).toContain("onPointerCancel={(event) => finishPointer(event, true)}");
    expect(finishPointer).toContain("gesture.pointers.delete(event.pointerId)");
    expect(finishPointer).toContain("gesture.capturedPointers.delete(event.pointerId)");
    expect(finishPointer).toContain('gesture.mode = "idle"');
    expect(componentSource).toContain("touch-none");
  });
});
