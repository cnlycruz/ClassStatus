"use client";

import React, { useEffect } from "react";
import { NCR_GEO_PATHS } from "@/data/ncrGeoData";
import { NCR_MAP_BASE_VIEWBOX } from "@/lib/ncrMapInteraction";

type StartupSplashProps = {
  onComplete: () => void;
};

// This deterministic north-to-south order keeps the assembly legible on a small screen.
// Caloocan's two canonical polygons intentionally land together as one logical LGU piece.
const STARTUP_LGU_ORDER = [
  "valenzuela",
  "caloocan",
  "malabon",
  "navotas",
  "quezon-city",
  "marikina",
  "san-juan",
  "mandaluyong",
  "manila",
  "pasig",
  "makati",
  "pasay",
  "taguig",
  "pateros",
  "paranaque",
  "las-pinas",
  "muntinlupa",
] as const;

const STARTUP_LGU_PIECES = STARTUP_LGU_ORDER.map((lguId) => ({
  lguId,
  paths: NCR_GEO_PATHS.filter((path) => path.lguId === lguId),
}));

export function StartupSplash({ onComplete }: StartupSplashProps) {
  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(onComplete, reducedMotion ? 300 : 3_000);
    return () => window.clearTimeout(timer);
  }, [onComplete]);

  return (
    <div
      data-startup-splash
      aria-hidden="true"
      className="startup-splash fixed inset-0 z-[100] flex min-h-[100dvh] items-center justify-center overflow-hidden bg-slate-50 px-6 text-slate-950 dark:bg-slate-950 dark:text-slate-100"
    >
      <div className="startup-splash-lockup flex w-full flex-col items-center gap-2">
        <svg
          className="startup-ncr-map h-[17rem] w-auto max-w-full overflow-visible sm:h-[18rem]"
          viewBox={`${NCR_MAP_BASE_VIEWBOX.x} ${NCR_MAP_BASE_VIEWBOX.y} ${NCR_MAP_BASE_VIEWBOX.width} ${NCR_MAP_BASE_VIEWBOX.height}`}
          preserveAspectRatio="xMidYMid meet"
          role="presentation"
        >
          {STARTUP_LGU_PIECES.map((piece, index) => (
            <g
              key={piece.lguId}
              data-startup-lgu={piece.lguId}
              className="startup-lgu"
              style={
                {
                  "--startup-lgu-delay": `${180 + index * 90}ms`,
                  "--startup-lgu-offset": `${-48 - (index % 4) * 10}px`,
                } as React.CSSProperties
              }
            >
              {piece.paths.map((path) => (
                <path key={path.id} className="startup-lgu-path" d={path.d} />
              ))}
            </g>
          ))}
        </svg>
        <p className="startup-splash-title text-xl font-bold tracking-[-0.02em] sm:text-2xl">Class Status</p>
      </div>
    </div>
  );
}
