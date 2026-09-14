"use client";

import React, { useEffect } from "react";

type StartupSplashProps = {
  onComplete: () => void;
};

// A deliberately simplified, static NCR contour for startup branding only.
// The detailed LGU geometry remains exclusive to the interactive map.
const STARTUP_NCR_SILHOUETTE =
  "M 93 10 C 109 10 126 18 137 32 L 147 48 C 154 60 151 73 143 86 L 150 102 C 156 116 150 130 139 141 L 133 151 C 136 165 128 178 117 188 L 108 205 C 103 216 95 220 87 212 L 78 198 C 70 187 66 177 59 166 L 49 151 C 42 140 43 128 50 119 L 40 107 C 31 96 32 84 42 73 L 50 63 C 46 51 50 40 60 32 L 69 25 C 75 16 83 11 93 10 Z";

const STARTUP_STATUS_NODES = [
  { x: 112, y: 62, tone: "blue", delay: 0 },
  { x: 78, y: 119, tone: "blue", delay: 70 },
  { x: 107, y: 166, tone: "ready", delay: 140 },
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
      <div className="startup-splash-lockup flex w-full flex-col items-center gap-5">
        <svg
          className="startup-ncr-mark h-[10.5rem] w-auto max-w-[9.75rem] overflow-visible sm:h-[11.5rem]"
          viewBox="0 0 180 225"
          preserveAspectRatio="xMidYMid meet"
          role="presentation"
        >
          <defs>
            <clipPath id="startup-ncr-clip">
              <path d={STARTUP_NCR_SILHOUETTE} />
            </clipPath>
            <linearGradient id="startup-ncr-scan-gradient" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#3b82f6" stopOpacity="0" />
              <stop offset="0.4" stopColor="#3b82f6" stopOpacity="0.08" />
              <stop offset="0.52" stopColor="#60a5fa" stopOpacity="0.58" />
              <stop offset="0.64" stopColor="#3b82f6" stopOpacity="0.1" />
              <stop offset="1" stopColor="#3b82f6" stopOpacity="0" />
            </linearGradient>
          </defs>

          <path className="startup-ncr-fill" d={STARTUP_NCR_SILHOUETTE} />
          <path className="startup-ncr-outline" d={STARTUP_NCR_SILHOUETTE} pathLength={1} />

          <g clipPath="url(#startup-ncr-clip)">
            <rect
              className="startup-ncr-scan"
              x="20"
              y="-32"
              width="140"
              height="32"
              fill="url(#startup-ncr-scan-gradient)"
            />
          </g>

          <g>
            {STARTUP_STATUS_NODES.map((node) => (
              <g
                key={`${node.x}-${node.y}`}
                className={`startup-status-node node-${node.tone}`}
                style={{ "--startup-node-delay": `${node.delay}ms` } as React.CSSProperties}
              >
                <circle className="startup-status-node-halo" cx={node.x} cy={node.y} r="8" />
                <circle className="startup-status-node-core" cx={node.x} cy={node.y} r="4.5" />
              </g>
            ))}
          </g>
        </svg>
        <p className="startup-splash-title text-xl font-bold tracking-[-0.02em] sm:text-2xl">Class Status</p>
      </div>
    </div>
  );
}
