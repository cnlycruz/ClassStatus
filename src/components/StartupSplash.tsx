"use client";

import React, { useEffect } from "react";
import { Caveat } from "next/font/google";

const splashScript = Caveat({
  subsets: ["latin"],
  weight: ["500", "600"],
  display: "swap",
});

type StartupSplashProps = {
  onComplete: () => void;
};

export function StartupSplash({ onComplete }: StartupSplashProps) {
  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(onComplete, reducedMotion ? 280 : 1_450);
    return () => window.clearTimeout(timer);
  }, [onComplete]);

  return (
    <div
      data-startup-splash
      aria-hidden="true"
      className="startup-splash fixed inset-0 z-[100] flex min-h-[100dvh] items-center justify-center overflow-hidden bg-slate-50 px-6 text-slate-950 dark:bg-slate-950 dark:text-slate-100"
    >
      <svg
        className="w-full max-w-[34rem] overflow-visible"
        viewBox="0 0 640 150"
        role="presentation"
      >
        <text
          x="320"
          y="98"
          textAnchor="middle"
          className={`${splashScript.className} startup-splash-wordmark`}
        >
          Class Status
        </text>
      </svg>
    </div>
  );
}
