"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { NCR_GEO_PATHS, GeoPathItem } from "@/data/ncrGeoData";
import { LGUId, LGUInfo, SuspensionStatus, SuspensionRecord } from "@/types";
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

type MapLabelPlacement = {
  x: number;
  y: number;
  fontSize: number;
  textAnchor: "start" | "middle" | "end";
  text?: string;
  lines?: string[];
};

// Visual interior anchors, chosen from each path's largest usable interior
// area and then optically centered for the rendered overview. Keeping this
// separate from the geographic data prevents label refinement from altering
// the underlying LGU boundaries.
const MAP_LABEL_PLACEMENTS: Record<string, MapLabelPlacement> = {
  manila: { x: 344, y: 449, fontSize: 16, textAnchor: "middle", text: "Manila" },
  mandaluyong: { x: 439, y: 476, fontSize: 12, textAnchor: "middle" },
  marikina: { x: 588, y: 323, fontSize: 16, textAnchor: "middle" },
  pasig: { x: 522, y: 493, fontSize: 16, textAnchor: "middle" },
  "quezon-city": { x: 468, y: 278, fontSize: 17, textAnchor: "middle" },
  "san-juan": { x: 422, y: 430, fontSize: 12, textAnchor: "middle" },
  "caloocan-north": { x: 456, y: 108, fontSize: 14, textAnchor: "middle", lines: ["Caloocan", "(North)"] },
  "caloocan-south": { x: 307, y: 332, fontSize: 11, textAnchor: "middle", lines: ["Caloocan", "(South)"] },
  malabon: { x: 258, y: 272, fontSize: 12, textAnchor: "middle" },
  navotas: { x: 185, y: 225, fontSize: 11, textAnchor: "middle" },
  valenzuela: { x: 317, y: 226, fontSize: 16, textAnchor: "middle" },
  "las-pinas": { x: 361, y: 780, fontSize: 14, textAnchor: "middle" },
  makati: { x: 411, y: 534, fontSize: 14, textAnchor: "middle" },
  muntinlupa: { x: 422, y: 869, fontSize: 14, textAnchor: "middle" },
  paranaque: { x: 403, y: 686, fontSize: 14, textAnchor: "middle" },
  pasay: { x: 390, y: 605, fontSize: 13, textAnchor: "middle" },
  taguig: { x: 470, y: 611, fontSize: 16, textAnchor: "middle" },
  pateros: { x: 503, y: 546, fontSize: 10, textAnchor: "middle" },
};

export const NcrInteractiveMap = React.memo(function NcrInteractiveMap({
  lgus,
  selectedLguId,
  onSelectLgu,
  onClearSelection,
  statusFilter,
}: NcrInteractiveMapProps) {
  const [hoveredLguId, setHoveredLguId] = useState<LGUId | null>(null);

  // Pan and Zoom state
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const labelFontScale = 1 / Math.min(Math.max(scale, 0.7), 4);

  // Touch tracking for pinch-to-zoom
  const touchStartRef = useRef<{ dist: number; scale: number; pan: { x: number; y: number } } | null>(null);
  const gestureRef = useRef({ startX: 0, startY: 0, hasMoved: false, hasPinched: false });
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const panRef = useRef(pan);
  const pendingPanRef = useRef(pan);
  const panFrameRef = useRef<number | null>(null);
  const tooltipFrameRef = useRef<number | null>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const dragStartRef = useRef({ x: 0, y: 0 });

  // Map LGU ID to status and data
  const lguMap = React.useMemo(() => {
    const map = new Map<LGUId, (typeof lgus)[0]>();
    lgus.forEach((l) => map.set(l.id, l));
    return map;
  }, [lgus]);

  const handleZoom = useCallback((delta: number) => {
    setScale((prev) => Math.min(Math.max(prev + delta, 0.7), 4.0));
  }, []);

  const handleResetZoom = useCallback(() => {
    setScale(1);
    if (panFrameRef.current) {
      cancelAnimationFrame(panFrameRef.current);
      panFrameRef.current = null;
    }
    panRef.current = { x: 0, y: 0 };
    pendingPanRef.current = panRef.current;
    setPan(panRef.current);
  }, []);

  useEffect(() => {
    return () => {
      if (panFrameRef.current) cancelAnimationFrame(panFrameRef.current);
      if (tooltipFrameRef.current) cancelAnimationFrame(tooltipFrameRef.current);
    };
  }, []);

  const schedulePan = useCallback((nextPan: { x: number; y: number }) => {
    panRef.current = nextPan;
    pendingPanRef.current = nextPan;
    if (panFrameRef.current) return;

    panFrameRef.current = requestAnimationFrame(() => {
      panFrameRef.current = null;
      setPan(pendingPanRef.current);
    });
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

  // Mouse drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    gestureRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      hasMoved: false,
      hasPinched: false,
    };
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - panRef.current.x, y: e.clientY - panRef.current.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      if (Math.hypot(e.clientX - gestureRef.current.startX, e.clientY - gestureRef.current.startY) > 8) {
        gestureRef.current.hasMoved = true;
      }
      schedulePan({
        x: e.clientX - dragStartRef.current.x,
        y: e.clientY - dragStartRef.current.y,
      });
    }

    updateTooltipPosition(e.clientX, e.clientY);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Touch handlers for mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      gestureRef.current = {
        startX: e.touches[0].clientX,
        startY: e.touches[0].clientY,
        hasMoved: false,
        hasPinched: false,
      };
      setIsDragging(true);
      dragStartRef.current = {
        x: e.touches[0].clientX - panRef.current.x,
        y: e.touches[0].clientY - panRef.current.y,
      };
    } else if (e.touches.length === 2) {
      gestureRef.current.hasPinched = true;
      gestureRef.current.hasMoved = true;
      // Pinch zoom start
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      touchStartRef.current = { dist, scale, pan: { ...pan } };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && isDragging) {
      if (
        Math.hypot(
          e.touches[0].clientX - gestureRef.current.startX,
          e.touches[0].clientY - gestureRef.current.startY
        ) > 8
      ) {
        gestureRef.current.hasMoved = true;
      }
      schedulePan({
        x: e.touches[0].clientX - dragStartRef.current.x,
        y: e.touches[0].clientY - dragStartRef.current.y,
      });
    } else if (e.touches.length === 2 && touchStartRef.current) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      const factor = dist / touchStartRef.current.dist;
      const newScale = Math.min(Math.max(touchStartRef.current.scale * factor, 0.7), 4.0);
      setScale(newScale);
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    touchStartRef.current = null;
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as Element;
    if (
      !gestureRef.current.hasMoved &&
      !gestureRef.current.hasPinched &&
      target instanceof SVGElement &&
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
        return isSelected ? "#DC2626" : isHovered ? "#EF4444" : "#F87171";
      case "partial-suspension":
        return isSelected ? "#D97706" : isHovered ? "#F59E0B" : "#FBBF24";
      case "classes-continue":
        return isSelected ? "#059669" : isHovered ? "#10B981" : "#34D399";
      default:
        return isSelected ? "#475569" : isHovered ? "#64748B" : "#94A3B8";
    }
  };

  const hoveredLguData = hoveredLguId ? lguMap.get(hoveredLguId) : null;

  return (
    <div
      ref={containerRef}
      className="ncr-map-canvas relative w-full h-[58dvh] min-h-[420px] sm:h-[min(620px,65dvh)] lg:h-auto lg:flex-1 lg:min-h-0 rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden select-none touch-none"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => {
        handleMouseUp();
        setHoveredLguId(null);
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
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
      <div className="absolute top-3 right-3 sm:top-4 sm:right-4 z-20 flex flex-col gap-1.5 bg-slate-900/90 p-1.5 rounded-2xl border border-slate-700/80 shadow-xl backdrop-blur-md">
        <button
          onClick={() => handleZoom(0.3)}
          className="map-touch-control flex h-9 w-9 sm:h-8 sm:w-8 items-center justify-center rounded-xl text-slate-200 hover:bg-slate-800 active:bg-slate-700 transition-colors"
          title="Zoom In"
          aria-label="Zoom In"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <button
          onClick={() => handleZoom(-0.3)}
          className="map-touch-control flex h-9 w-9 sm:h-8 sm:w-8 items-center justify-center rounded-xl text-slate-200 hover:bg-slate-800 active:bg-slate-700 transition-colors"
          title="Zoom Out"
          aria-label="Zoom Out"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <div className="my-0.5 h-px bg-slate-800" />
        <button
          onClick={handleResetZoom}
          className="map-touch-control flex h-9 w-9 sm:h-8 sm:w-8 items-center justify-center rounded-xl text-slate-200 hover:bg-slate-800 active:bg-slate-700 transition-colors"
          title="Reset Map View"
          aria-label="Reset Map View"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>

      {/* Desktop Map Legend Overlay */}
      <div className="absolute bottom-4 left-4 z-20 hidden sm:flex flex-col gap-1.5 bg-slate-900/95 text-slate-200 p-3.5 rounded-2xl border border-slate-800 shadow-xl backdrop-blur text-xs">
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

      {/* SVG Canvas with Accurate Geographic PSGC Municipal Borders */}
      <svg
        ref={svgRef}
        viewBox="0 0 800 1000"
        className={`w-full h-full cursor-${isDragging ? "grabbing" : "grab"} transition-transform duration-75`}
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
          transformOrigin: "center center",
        }}
      >
        <defs>
          <filter id="lgu-selected-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="0" stdDeviation="8" floodColor="#60A5FA" floodOpacity="0.8" />
          </filter>
        </defs>

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
                onMouseEnter={() => setHoveredLguId(pathItem.lguId)}
                onClick={(e) => {
                  e.stopPropagation();
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
            const placement = MAP_LABEL_PLACEMENTS[pathItem.id] || {
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
                  onSelectLgu(pathItem.lguId);
                }}
              >
                <g>
                  <text
                    x={placement.x}
                    y={placement.y}
                    textAnchor={placement.textAnchor}
                    dominantBaseline="middle"
                    stroke="#0F172A"
                    strokeWidth={Math.min(Math.max(placement.fontSize * 0.18, 1.4), 2.3)}
                    strokeLinejoin="round"
                    paintOrder="stroke"
                    className={`select-none font-bold tracking-tight transition-colors ${
                      isSelected ? "fill-blue-200" : isHovered ? "fill-white" : "fill-slate-100"
                    }`}
                    style={{
                      fontSize: `${Math.min(24, Math.max(2.5, (placement.fontSize + (isSelected || isHovered ? 0.5 : 0)) * labelFontScale))}px`,
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
