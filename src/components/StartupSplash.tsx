"use client";

import React, { useEffect } from "react";
import { NCR_GEO_PATHS } from "@/data/ncrGeoData";
import { NCR_MAP_BASE_VIEWBOX } from "@/lib/ncrMapInteraction";

type StartupSplashProps = {
  onComplete: () => void;
};

const STARTUP_STATUS_DOTS = [
  { x: 324, y: 374, tone: "blue", delay: 0 },
  { x: 426, y: 470, tone: "blue", delay: 64 },
  { x: 478, y: 617, tone: "emerald", delay: 128 },
  { x: 362, y: 728, tone: "blue", delay: 192 },
] as const;

export function StartupSplash({ onComplete }: StartupSplashProps) {
  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(onComplete, reducedMotion ? 250 : 1_300);
    return () => window.clearTimeout(timer);
  }, [onComplete]);

  return (
    <div
      data-startup-splash
      aria-hidden="true"
      className="startup-splash fixed inset-0 z-[100] flex min-h-[100dvh] items-center justify-center overflow-hidden bg-slate-50 px-6 text-slate-950 dark:bg-slate-950 dark:text-slate-100"
    >
      <div className="flex w-full max-w-[15rem] flex-col items-center gap-3 sm:max-w-[17rem]">
        <svg
          className="h-auto w-full overflow-visible"
          viewBox={`${NCR_MAP_BASE_VIEWBOX.x} ${NCR_MAP_BASE_VIEWBOX.y} ${NCR_MAP_BASE_VIEWBOX.width} ${NCR_MAP_BASE_VIEWBOX.height}`}
          preserveAspectRatio="xMidYMid meet"
          role="presentation"
        >
          <defs>
            <clipPath id="startup-ncr-clip">
              {NCR_GEO_PATHS.map((path) => (
                <path key={path.id} d={path.d} />
              ))}
            </clipPath>
            <linearGradient id="startup-ncr-scan-gradient" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor="#3b82f6" stopOpacity="0" />
              <stop offset="0.42" stopColor="#3b82f6" stopOpacity="0.06" />
              <stop offset="0.62" stopColor="#60a5fa" stopOpacity="0.52" />
              <stop offset="0.78" stopColor="#3b82f6" stopOpacity="0.1" />
              <stop offset="1" stopColor="#3b82f6" stopOpacity="0" />
            </linearGradient>
          </defs>

          <g className="startup-ncr-outline">
            {NCR_GEO_PATHS.map((path, index) => (
              <path
                key={path.id}
                d={path.d}
                pathLength={1}
                style={{ "--startup-path-delay": `${(index % 4) * 42}ms` } as React.CSSProperties}
              />
            ))}
          </g>

          <g clipPath="url(#startup-ncr-clip)">
            <rect
              className="startup-ncr-scan"
              x="-220"
              y={NCR_MAP_BASE_VIEWBOX.y}
              width="220"
              height={NCR_MAP_BASE_VIEWBOX.height}
              fill="url(#startup-ncr-scan-gradient)"
            />
          </g>

          <g>
            {STARTUP_STATUS_DOTS.map((dot) => (
              <circle
                key={`${dot.x}-${dot.y}`}
                className={`startup-status-dot startup-status-dot-${dot.tone}`}
                cx={dot.x}
                cy={dot.y}
                r="11"
                style={{ "--startup-dot-delay": `${dot.delay}ms` } as React.CSSProperties}
              />
            ))}
          </g>
        </svg>
        <p className="startup-splash-title text-lg font-semibold tracking-tight sm:text-xl">Class Status</p>
      </div>
    </div>
  );
}
