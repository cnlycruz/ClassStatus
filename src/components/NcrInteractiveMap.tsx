"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { NCR_GEO_PATHS, GeoPathItem } from "@/data/ncrGeoData";
import { NCR_MAP_LABEL_PLACEMENTS } from "@/data/ncrMapPresentation";
import { LGUId, LGUInfo, SuspensionStatus, SuspensionRecord } from "@/types";
import { getStatusPresentation } from "@/lib/statusPresentation";
import {
  MapPoint,
  NcrMapView,
  clampNcrMapScale,
  initialNcrMapView,
  ncrLabelAnchorTransform,
  NCR_MAP_BASE_VIEWBOX,
  ncrMapSvgTransform,
  ncrPinchView,
  shouldCaptureNcrMapPointer,
  shouldActivateNcrMapTarget,
} from "@/lib/ncrMapInteraction";
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Clock,
  Layers,
} from "lucide-react";

interface NcrInteractiveMapProps {
  lgus: (LGUInfo & {
    status: SuspensionStatus;
    primaryRecord?: SuspensionRecord;
    hasUpcoming: boolean;
    upcomingRecord?: SuspensionRecord;
  })[];
  selectedLguId: LGUId | null;
  onSelectLgu: (lguId: LGUId) => void;
  onClearSelection: () => void;
  statusFilter?: string | null;
}

type LabelNode = {
  element: SVGGElement;
  anchor: MapPoint;
};

type MapGesture = {
  pointers: Map<number, MapPoint>;
  mode: "idle" | "pan" | "pinch";
  startPoint: MapPoint;
  dragOffset: MapPoint;
  pinchStartDistance: number;
  pinchStartMidpoint: MapPoint;
  pinchViewportCenter: MapPoint;
  pinchStartView: NcrMapView;
  hasMoved: boolean;
  hasPinched: boolean;
  capturedPointers: Set<number>;
};

function pointDistance(first: MapPoint, second: MapPoint): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function pointMidpoint(first: MapPoint, second: MapPoint): MapPoint {
  return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
}

function createMapGesture(): MapGesture {
  const initialView = initialNcrMapView();
  return {
    pointers: new Map(),
    mode: "idle",
    startPoint: { x: 0, y: 0 },
    dragOffset: { x: 0, y: 0 },
    pinchStartDistance: 0,
    pinchStartMidpoint: { x: 0, y: 0 },
    pinchViewportCenter: { x: 0, y: 0 },
    pinchStartView: initialView,
    hasMoved: false,
    hasPinched: false,
    capturedPointers: new Set(),
  };
}

export const NcrInteractiveMap = React.memo(function NcrInteractiveMap({
  lgus,
  selectedLguId,
  onSelectLgu,
  onClearSelection,
  statusFilter,
}: NcrInteractiveMapProps) {
  const [hoveredLguId, setHoveredLguId] = useState<LGUId | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const mapGroupRef = useRef<SVGGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const labelNodesRef = useRef(new Map<string, LabelNode>());
  const labelRefCallbacksRef = useRef(new Map<string, (element: SVGGElement | null) => void>());
  const viewRef = useRef<NcrMapView>(initialNcrMapView());
  const pendingViewRef = useRef<NcrMapView>(viewRef.current);
  const renderedLabelScaleRef = useRef<number | null>(null);
  const viewFrameRef = useRef<number | null>(null);
  const tooltipFrameRef = useRef<number | null>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const gestureRef = useRef<MapGesture>(createMapGesture());

  // Map LGU ID to status and data
  const lguMap = React.useMemo(() => {
    const map = new Map<LGUId, (typeof lgus)[0]>();
    lgus.forEach((l) => map.set(l.id, l));
    return map;
  }, [lgus]);

  const getLabelNodeRef = useCallback((id: string, anchor: MapPoint) => {
    const existing = labelRefCallbacksRef.current.get(id);
    if (existing) return existing;
    const callback = (element: SVGGElement | null) => {
      if (!element) {
        labelNodesRef.current.delete(id);
        return;
      }
      labelNodesRef.current.set(id, { element, anchor });
      element.setAttribute("transform", ncrLabelAnchorTransform(anchor, viewRef.current.scale));
    };
    labelRefCallbacksRef.current.set(id, callback);
    return callback;
  }, []);

  const applyLabelScale = useCallback((scale: number) => {
    if (renderedLabelScaleRef.current === scale) return;

    labelNodesRef.current.forEach(({ element, anchor }) => {
      element.setAttribute("transform", ncrLabelAnchorTransform(anchor, scale));
    });
    renderedLabelScaleRef.current = scale;
  }, []);

  const applyView = useCallback((view: NcrMapView) => {
    const container = containerRef.current;
    const mapGroup = mapGroupRef.current;
    if (!container || !mapGroup) return;

    mapGroup.setAttribute(
      "transform",
      ncrMapSvgTransform(view, {
        width: container.clientWidth,
        height: container.clientHeight,
      })
    );

    applyLabelScale(view.scale);
  }, [applyLabelScale]);

  const scheduleView = useCallback((nextView: NcrMapView) => {
    viewRef.current = nextView;
    pendingViewRef.current = nextView;
    if (viewFrameRef.current !== null) return;

    viewFrameRef.current = requestAnimationFrame(() => {
      viewFrameRef.current = null;
      applyView(pendingViewRef.current);
    });
  }, [applyView]);

  const handleZoom = useCallback((delta: number) => {
    const current = viewRef.current;
    scheduleView({ ...current, scale: clampNcrMapScale(current.scale + delta) });
  }, [scheduleView]);

  const handleResetZoom = useCallback(() => {
    if (viewFrameRef.current !== null) {
      cancelAnimationFrame(viewFrameRef.current);
      viewFrameRef.current = null;
    }
    const initialView = initialNcrMapView();
    viewRef.current = initialView;
    pendingViewRef.current = initialView;
    applyView(initialView);
  }, [applyView]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      applyView(viewRef.current);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [applyView]);

  useEffect(() => {
    return () => {
      if (viewFrameRef.current !== null) cancelAnimationFrame(viewFrameRef.current);
      if (tooltipFrameRef.current !== null) cancelAnimationFrame(tooltipFrameRef.current);
    };
  }, []);

  const updateTooltipPosition = useCallback((clientX: number, clientY: number) => {
    pointerRef.current = { x: clientX, y: clientY };
    if (tooltipFrameRef.current) return;

    tooltipFrameRef.current = requestAnimationFrame(() => {
      tooltipFrameRef.current = null;
      const container = containerRef.current;
      const tooltip = tooltipRef.current;
      const pointer = pointerRef.current;
      if (!container || !tooltip || !pointer) return;

      const rect = container.getBoundingClientRect();
      tooltip.style.left = `${Math.min(Math.max(pointer.x - rect.left, 120), container.clientWidth - 120)}px`;
      tooltip.style.top = `${Math.max(pointer.y - rect.top - 12, 10)}px`;
    });
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleNativeWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const zoomDelta = e.deltaY < 0 ? 0.15 : -0.15;
      handleZoom(zoomDelta);
    };

    container.addEventListener("wheel", handleNativeWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleNativeWheel);
  }, [handleZoom]);

  const beginPinch = useCallback(() => {
    const gesture = gestureRef.current;
    const [first, second] = Array.from(gesture.pointers.values());
    const container = containerRef.current;
    if (!first || !second || !container) return;
    const rect = container.getBoundingClientRect();
    gesture.mode = "pinch";
    gesture.hasMoved = true;
    gesture.hasPinched = true;
    gesture.pinchStartDistance = pointDistance(first, second);
    gesture.pinchStartMidpoint = pointMidpoint(first, second);
    gesture.pinchViewportCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    gesture.pinchStartView = {
      scale: viewRef.current.scale,
      pan: { ...viewRef.current.pan },
    };
  }, []);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target as Element;
    if (target.closest("[data-map-overlay]")) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;

    const point = { x: event.clientX, y: event.clientY };
    const gesture = gestureRef.current;
    gesture.pointers.set(event.pointerId, point);

    if (gesture.pointers.size === 1) {
      gesture.mode = "pan";
      gesture.startPoint = point;
      gesture.dragOffset = {
        x: point.x - viewRef.current.pan.x,
        y: point.y - viewRef.current.pan.y,
      };
      gesture.hasMoved = false;
      gesture.hasPinched = false;
    } else if (gesture.pointers.size === 2) {
      gesture.pointers.forEach((_point, pointerId) => {
        event.currentTarget.setPointerCapture(pointerId);
        gesture.capturedPointers.add(pointerId);
      });
      beginPinch();
    }
  }, [beginPinch]);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse") updateTooltipPosition(event.clientX, event.clientY);

    const gesture = gestureRef.current;
    if (!gesture.pointers.has(event.pointerId)) return;
    const point = { x: event.clientX, y: event.clientY };
    gesture.pointers.set(event.pointerId, point);

    if (gesture.mode === "pan" && gesture.pointers.size === 1) {
      if (!shouldCaptureNcrMapPointer({
        pointerCount: gesture.pointers.size,
        start: gesture.startPoint,
        current: point,
      })) {
        return;
      }

      gesture.hasMoved = true;
      if (!gesture.capturedPointers.has(event.pointerId)) {
        event.currentTarget.setPointerCapture(event.pointerId);
        gesture.capturedPointers.add(event.pointerId);
      }
      scheduleView({
        scale: viewRef.current.scale,
        pan: {
          x: point.x - gesture.dragOffset.x,
          y: point.y - gesture.dragOffset.y,
        },
      });
      return;
    }

    if (gesture.mode === "pinch" && gesture.pointers.size >= 2 && gesture.pinchStartDistance > 0) {
      const [first, second] = Array.from(gesture.pointers.values());
      const currentDistance = pointDistance(first, second);
      const currentMidpoint = pointMidpoint(first, second);
      scheduleView(ncrPinchView({
        startView: gesture.pinchStartView,
        startMidpoint: gesture.pinchStartMidpoint,
        currentMidpoint,
        viewportCenter: gesture.pinchViewportCenter,
        nextScale: gesture.pinchStartView.scale * (currentDistance / gesture.pinchStartDistance),
      }));
    }
  }, [scheduleView, updateTooltipPosition]);

  const finishPointer = useCallback((event: React.PointerEvent<HTMLDivElement>, cancelled = false) => {
    const gesture = gestureRef.current;
    if (!gesture.pointers.has(event.pointerId)) return;
    if (cancelled) gesture.hasMoved = true;
    gesture.pointers.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    gesture.capturedPointers.delete(event.pointerId);

    if (gesture.pointers.size >= 2) {
      beginPinch();
      return;
    }
    if (gesture.pointers.size === 1) {
      const remaining = Array.from(gesture.pointers.values())[0];
      gesture.mode = "pan";
      gesture.startPoint = remaining;
      gesture.dragOffset = {
        x: remaining.x - viewRef.current.pan.x,
        y: remaining.y - viewRef.current.pan.y,
      };
      return;
    }
    gesture.mode = "idle";
  }, [beginPinch]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as Element;
    const gesture = gestureRef.current;
    if (
      shouldActivateNcrMapTarget(gesture) &&
      !target.closest("[data-map-overlay]") &&
      (target === containerRef.current ||
        target === svgRef.current ||
        target === mapGroupRef.current ||
        Boolean(svgRef.current?.contains(target))) &&
      !target.closest(".ncr-map-lgu") &&
      !target.closest("#ncr-labels")
    ) {
      onClearSelection();
    }
  };

  const getStatusColor = (
    status: SuspensionStatus,
    isSelected: boolean,
    isHovered: boolean,
    isDimmed: boolean
  ) => {
    if (isDimmed) return "#94A3B830";

    switch (status) {
      case "classes-suspended":
        return isSelected ? "#DC2626" : isHovered ? "#EF4444" : getStatusPresentation(status).color;
      case "partial-suspension":
        return isSelected ? "#D97706" : isHovered ? "#F59E0B" : getStatusPresentation(status).color;
      case "classes-continue":
        return isSelected ? "#059669" : isHovered ? "#10B981" : getStatusPresentation(status).color;
      default:
        return isSelected ? "#475569" : isHovered ? "#64748B" : getStatusPresentation(status).color;
    }
  };

  const hoveredLguData = hoveredLguId ? lguMap.get(hoveredLguId) : null;

  return (
    <div
      ref={containerRef}
      className="ncr-map-canvas relative h-[60dvh] min-h-[440px] w-full sm:h-[min(620px,65dvh)] lg:h-auto lg:min-h-0 lg:flex-1 rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden select-none touch-none cursor-grab active:cursor-grabbing"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPointer}
      onPointerCancel={(event) => finishPointer(event, true)}
      onLostPointerCapture={(event) => finishPointer(event, true)}
      onPointerLeave={() => setHoveredLguId(null)}
      onClick={handleCanvasClick}
      role="region"
      aria-label="Interactive Map of Metro Manila Class Suspension Status"
    >
      {/* Subtle Map Atmosphere Background Pattern */}
      <div
        className="absolute inset-0 opacity-[0.07] pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(#3B82F6 1.5px, transparent 1.5px)`,
          backgroundSize: "24px 24px",
        }}
      />

      {/* Floating Zoom & Map Action Controls (Mobile-first Touch Friendly) */}
      <div
        data-map-overlay
        className="absolute top-3 right-3 sm:top-4 sm:right-4 z-20 flex flex-col gap-1.5 bg-slate-900/90 p-1.5 rounded-2xl border border-slate-700/80 shadow-xl backdrop-blur-md"
      >
        <button
          onClick={() => handleZoom(0.3)}
          className="map-touch-control flex h-11 w-11 items-center justify-center rounded-xl text-slate-200 hover:bg-slate-800 active:bg-slate-700 transition-colors"
          title="Zoom In"
          aria-label="Zoom In"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <button
          onClick={() => handleZoom(-0.3)}
          className="map-touch-control flex h-11 w-11 items-center justify-center rounded-xl text-slate-200 hover:bg-slate-800 active:bg-slate-700 transition-colors"
          title="Zoom Out"
          aria-label="Zoom Out"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <div className="my-0.5 h-px bg-slate-800" />
        <button
          onClick={handleResetZoom}
          className="map-touch-control flex h-11 w-11 items-center justify-center rounded-xl text-slate-200 hover:bg-slate-800 active:bg-slate-700 transition-colors"
          title="Reset Map View"
          aria-label="Reset Map View"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>

      {/* Desktop Map Legend Overlay */}
      <div
        data-map-overlay
        className="absolute bottom-4 left-4 z-20 hidden sm:flex flex-col gap-1.5 bg-slate-900/95 text-slate-200 p-3.5 rounded-2xl border border-slate-800 shadow-xl backdrop-blur text-xs"
      >
        <div className="font-bold text-white mb-1 flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 text-blue-400" />
            <span>Map Legend</span>
          </span>
          <span className="text-[10px] text-slate-400 font-normal">Official PSGC Borders</span>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-red-500 shadow-sm shadow-red-500/40" />
            <span className="font-medium text-slate-200">Suspended</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-amber-500 shadow-sm shadow-amber-500/40" />
            <span className="font-medium text-slate-200">Partial</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/40" />
            <span className="font-medium text-slate-200">Classes Open</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-slate-400 shadow-sm" />
            <span className="font-medium text-slate-300">Awaiting Info</span>
          </div>
        </div>
      </div>

      {/* SVG-native movement preserves complete vector rendering during gestures. */}
      <svg
        ref={svgRef}
        viewBox={`${NCR_MAP_BASE_VIEWBOX.x} ${NCR_MAP_BASE_VIEWBOX.y} ${NCR_MAP_BASE_VIEWBOX.width} ${NCR_MAP_BASE_VIEWBOX.height}`}
        className="absolute inset-0 h-full w-full"
      >
        <defs>
          <filter id="lgu-selected-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="0" stdDeviation="8" floodColor="#60A5FA" floodOpacity="0.8" />
          </filter>
        </defs>

        <g ref={mapGroupRef} id="ncr-map-content" transform="translate(0 0) scale(1)">
          {/* LGU Polygons */}
          <g id="ncr-polygons">
          {NCR_GEO_PATHS.map((pathItem: GeoPathItem) => {
            const lguData = lguMap.get(pathItem.lguId);
            const status = lguData?.status || "awaiting-information";
            const isSelected = selectedLguId === pathItem.lguId;
            const isHovered = hoveredLguId === pathItem.lguId;
            const isDimmed = Boolean(statusFilter && statusFilter !== "all" && status !== statusFilter);

            const fillColor = getStatusColor(status, isSelected, isHovered, isDimmed);
            const strokeColor = isSelected ? "#93C5FD" : isHovered ? "#60A5FA" : "#1E293B";
            const strokeWidth = isSelected ? 3.0 : isHovered ? 2.2 : 1.2;

            return (
              <path
                key={pathItem.id}
                id={pathItem.id}
                d={pathItem.d}
                fill={fillColor}
                stroke={strokeColor}
                strokeWidth={strokeWidth}
                strokeLinejoin="round"
                strokeLinecap="round"
                filter={isSelected ? "url(#lgu-selected-glow)" : undefined}
                className="ncr-map-lgu transition-colors duration-150 outline-none"
                tabIndex={0}
                role="button"
                aria-label={`${lguData?.name || pathItem.name}: ${status}`}
                onPointerEnter={(event) => {
                  if (event.pointerType === "mouse" && gestureRef.current.pointers.size === 0) {
                    setHoveredLguId(pathItem.lguId);
                  }
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!shouldActivateNcrMapTarget(gestureRef.current)) {
                    e.preventDefault();
                    return;
                  }
                  onSelectLgu(pathItem.lguId);
                  if (typeof navigator !== "undefined" && navigator.vibrate) {
                    navigator.vibrate(15);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectLgu(pathItem.lguId);
                  }
                }}
              />
            );
          })}
          </g>

          {/* LGU Labels & High-Contrast City Name Tags */}
          <g id="ncr-labels" className="pointer-events-auto">
          {NCR_GEO_PATHS.map((pathItem) => {
            const lguData = lguMap.get(pathItem.lguId);
            const isSelected = selectedLguId === pathItem.lguId;
            const isHovered = hoveredLguId === pathItem.lguId;
            const placement = NCR_MAP_LABEL_PLACEMENTS[pathItem.id] || {
              x: pathItem.labelX,
              y: pathItem.labelY,
              fontSize: 14,
              textAnchor: "middle" as const,
            };
            const displayName = pathItem.subArea
              ? `${lguData?.name || pathItem.name} (${pathItem.subArea})`
              : lguData?.name || pathItem.name;
            const labelLines = placement.lines || [placement.text || displayName];
            const lineHeight = placement.fontSize * 0.9;
            const labelStartY = placement.y - ((labelLines.length - 1) * lineHeight) / 2;

            return (
              <g
                key={`label-${pathItem.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!shouldActivateNcrMapTarget(gestureRef.current)) {
                    e.preventDefault();
                    return;
                  }
                  onSelectLgu(pathItem.lguId);
                }}
              >
                <g ref={getLabelNodeRef(pathItem.id, { x: placement.x, y: placement.y })}>
                  <text
                    x={placement.x}
                    y={placement.y}
                    textAnchor={placement.textAnchor}
                    dominantBaseline="middle"
                    stroke="#0F172A"
                    strokeWidth={Math.min(Math.max(placement.fontSize * 0.18, 1.4), 2.3)}
                    strokeLinejoin="round"
                    paintOrder="stroke"
                    textRendering="geometricPrecision"
                    className={`select-none font-bold tracking-tight transition-colors ${
                      isSelected ? "fill-blue-200" : isHovered ? "fill-white" : "fill-slate-100"
                    }`}
                    style={{
                      fontSize: `${placement.fontSize + (isSelected || isHovered ? 0.5 : 0)}px`,
                      fontWeight: isSelected || isHovered ? "800" : "700",
                    }}
                  >
                    {labelLines.map((line, index) => (
                      <tspan key={line} x={placement.x} y={index === 0 ? labelStartY : undefined} dy={index === 0 ? undefined : lineHeight}>
                        {line}
                      </tspan>
                    ))}
                  </text>
                </g>

                {/* Upcoming Notice Indicator Pulse */}
                {lguData?.hasUpcoming && (
                  <circle
                    cx={pathItem.badgeX}
                    cy={pathItem.badgeY}
                    r="4.5"
                    fill="#F59E0B"
                    stroke="#FFFFFF"
                    strokeWidth="1.5"
                  />
                )}
              </g>
            );
          })}
          </g>
        </g>
      </svg>

      {/* Dynamic Hover Tooltip (Desktop) */}
      {hoveredLguData && (
        <div
          ref={tooltipRef}
          className="hidden sm:block absolute z-30 pointer-events-none bg-slate-900/95 text-white p-3 rounded-2xl shadow-2xl border border-slate-700/80 backdrop-blur-md max-w-xs -translate-x-1/2 -translate-y-full mb-3 animate-in fade-in zoom-in-95 duration-100"
          style={{ left: "120px", top: "10px" }}
        >
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="font-bold text-sm text-white">{hoveredLguData.name}</span>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                hoveredLguData.status === "classes-suspended"
                  ? "bg-red-500/20 text-red-300 border border-red-500/40"
                  : hoveredLguData.status === "partial-suspension"
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                  : hoveredLguData.status === "classes-continue"
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                  : "bg-slate-700 text-slate-300"
              }`}
            >
              {hoveredLguData.status === "classes-suspended"
                ? "SUSPENDED"
                : hoveredLguData.status === "partial-suspension"
                ? "PARTIAL"
                : hoveredLguData.status === "classes-continue"
                ? "OPEN"
                : "AWAITING"}
            </span>
          </div>

          <div className="text-[11px] text-slate-300 line-clamp-2">
            {hoveredLguData.primaryRecord?.reason || "No weather or suspension disruption reported."}
          </div>

          {hoveredLguData.hasUpcoming && (
            <div className="mt-1.5 text-[10px] font-medium text-amber-300 flex items-center gap-1">
              <Clock className="h-3 w-3" />
              <span>Upcoming suspension notice declared for tomorrow</span>
            </div>
          )}

          <div className="mt-2 pt-1.5 border-t border-slate-800 text-[10px] text-slate-400 flex items-center justify-between">
            <span>Mayor {hoveredLguData.mayor}</span>
            <span className="text-blue-400 font-semibold">Click to view →</span>
          </div>
        </div>
      )}
    </div>
  );
});
