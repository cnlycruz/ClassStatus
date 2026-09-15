"use client";

import React from "react";
import {
  buildNcrShareCardUrl,
  createNcrShareCardDownloadController,
} from "@/lib/share/downloadNcrShareCard";
import { MayPasokSummary } from "@/types";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  HelpCircle,
  ListFilter,
  Map,
  RefreshCw,
} from "lucide-react";
import styles from "./StatusHero.module.css";

interface StatusHeroProps {
  summary: MayPasokSummary | null;
  activeFilter: string;
  onFilterChange: (filter: string) => void;
  viewMode: "map" | "list";
  onViewModeChange: (mode: "map" | "list") => void;
  onRefresh: () => void | Promise<void>;
  isRefreshing?: boolean;
  shareCardEffectiveDate?: string;
}

export const StatusHero = React.memo(function StatusHero({
  summary,
  activeFilter,
  onFilterChange,
  viewMode,
  onViewModeChange,
  onRefresh,
  isRefreshing = false,
  shareCardEffectiveDate,
}: StatusHeroProps) {
  const shareCardDownload = React.useRef<ReturnType<typeof createNcrShareCardDownloadController> | null>(null);
  const [isShareCardGenerating, setIsShareCardGenerating] = React.useState(false);
  const [shareCardError, setShareCardError] = React.useState(false);
  const [downloadAnimationKey, setDownloadAnimationKey] = React.useState(0);

  if (!shareCardDownload.current) {
    shareCardDownload.current = createNcrShareCardDownloadController();
  }

  const shareCardUrl = buildNcrShareCardUrl(shareCardEffectiveDate);
  const handleShareCardDownload = React.useCallback(async () => {
    const controller = shareCardDownload.current;
    if (!controller || controller.isBusy()) return;

    setShareCardError(false);
    setDownloadAnimationKey((current) => current + 1);
    setIsShareCardGenerating(true);

    try {
      await controller.run({ effectiveDate: shareCardEffectiveDate });
    } catch {
      setShareCardError(true);
    } finally {
      setIsShareCardGenerating(false);
    }
  }, [shareCardEffectiveDate]);

  const filters = [
    { id: "classes-suspended", label: "Suspended", count: summary?.suspendedCount ?? 0, icon: AlertTriangle, activeClass: "bg-red-500 text-white", iconClass: "text-red-300" },
    { id: "partial-suspension", label: "Partial", count: summary?.partialCount ?? 0, icon: Clock, activeClass: "bg-amber-500 text-white", iconClass: "text-amber-300" },
    { id: "classes-continue", label: "Normal", count: summary?.continueCount ?? 0, icon: CheckCircle2, activeClass: "bg-emerald-600 text-white", iconClass: "text-emerald-300" },
    { id: "awaiting-information", label: "Awaiting", count: summary?.awaitingCount ?? 0, icon: HelpCircle, activeClass: "bg-slate-700 text-white", iconClass: "text-slate-200" },
  ] as const;

  return (
    <section className="rounded-3xl bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-900 px-5 py-4 text-white shadow-2xl sm:px-6 sm:py-4 lg:px-7 lg:py-5">
      <div className={styles.layout}>
        <div className={`${styles.heading} min-w-0`}>
          <h1 className="text-2xl font-black leading-tight tracking-tight text-white sm:text-3xl lg:text-4xl">May pasok ba?</h1>
          <p className={`${styles.subtitle} mt-1.5 text-xs font-medium leading-relaxed text-blue-100`}>
            {summary?.overallStatusHeadline || "Checking class suspension advisories across Metro Manila…"}
          </p>
        </div>

        <div className={`${styles.statuses} min-w-0 items-center gap-0.5 rounded-2xl bg-white/10 p-1`} aria-label="Filter by class status">
          {filters.map((filter) => {
            const Icon = filter.icon;
            const isActive = activeFilter === filter.id;

            return (
              <button
                key={filter.id}
                onClick={() => onFilterChange(isActive ? "all" : filter.id)}
                aria-pressed={isActive}
                className={`${styles.statusButton} hero-touch-control flex min-h-11 min-w-0 items-center justify-center gap-1 whitespace-nowrap rounded-xl px-2.5 text-xs font-bold transition-colors ${
                  isActive
                    ? filter.activeClass
                    : "text-white hover:bg-white/10"
                }`}
              >
                <Icon className={`h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4 ${isActive ? "text-current" : filter.iconClass}`} />
                <span>{filter.label}</span>
                <span className={`tabular-nums ${isActive ? "text-white/85" : "text-white/70"}`}>{filter.count}</span>
              </button>
            );
          })}
        </div>

        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          aria-busy={isRefreshing}
          className={`${styles.refresh} hero-touch-control flex min-h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 text-xs font-semibold text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 disabled:cursor-wait disabled:opacity-70 sm:px-4 sm:text-sm`}
        >
          <RefreshCw className={`h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4 ${isRefreshing ? "animate-spin" : ""}`} />
          <span>Refresh</span>
        </button>

        <button
          type="button"
          onClick={handleShareCardDownload}
          disabled={isShareCardGenerating}
          aria-busy={isShareCardGenerating}
          aria-label="Download Share Card"
          aria-describedby={shareCardError ? "share-card-download-error" : undefined}
          className={`${styles.share} hero-touch-control flex min-h-11 min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-white/25 bg-white/10 px-3 text-xs font-bold text-white transition-colors hover:border-white/40 hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 disabled:cursor-wait disabled:opacity-75 sm:px-4 sm:text-sm`}
        >
          <Download
            key={downloadAnimationKey}
            className={`h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4 ${
              downloadAnimationKey > 0 ? "animate-share-card-download motion-reduce:animate-none" : ""
            }`}
            aria-hidden="true"
          />
          <span className={styles.shareLabelShort}>{isShareCardGenerating ? "Generating…" : "Share Card"}</span>
          <span className={styles.shareLabelLong}>{isShareCardGenerating ? "Generating…" : "Download Share Card"}</span>
        </button>

        <div className={`${styles.view} grid min-w-0 grid-cols-2 items-center rounded-2xl border border-white/25 bg-white/10 p-1`}>
          <button
            onClick={() => onViewModeChange("map")}
            className={`hero-touch-control flex min-h-11 min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 text-xs font-bold transition-colors ${
              viewMode === "map"
                ? "bg-white text-blue-600 shadow-sm"
                : "text-white hover:bg-white/10"
            }`}
          >
            <Map className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
            <span>Map</span>
          </button>
          <button
            onClick={() => onViewModeChange("list")}
            className={`hero-touch-control flex min-h-11 min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 text-xs font-bold transition-colors ${
              viewMode === "list"
                ? "bg-white text-blue-600 shadow-sm"
                : "text-white hover:bg-white/10"
            }`}
          >
            <ListFilter className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
            <span>List</span>
          </button>
        </div>

        {shareCardError ? (
          <p
            id="share-card-download-error"
            role="status"
            aria-live="polite"
            className={`${styles.error} w-full text-left text-xs font-medium text-red-100 sm:text-right`}
          >
            Couldn&apos;t generate the card.{" "}
            <a
              href={shareCardUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold underline decoration-red-200/60 underline-offset-2 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
            >
              Open image instead
            </a>
          </p>
        ) : null}
      </div>
    </section>
  );
});
