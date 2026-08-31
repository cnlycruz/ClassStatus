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
  LoaderCircle,
  Map,
  RefreshCw,
} from "lucide-react";

const STATUS_HERO_CONTROL_LAYOUT =
  "grid w-full min-w-0 grid-cols-[max-content_minmax(0,1fr)] items-center gap-2 sm:flex sm:flex-wrap xl:w-auto xl:justify-end";

interface StatusHeroProps {
  summary: MayPasokSummary | null;
  activeFilter: string;
  onFilterChange: (filter: string) => void;
  viewMode: "map" | "list";
  onViewModeChange: (mode: "map" | "list") => void;
  onRefresh: () => void;
  shareCardEffectiveDate?: string;
}

export const StatusHero = React.memo(function StatusHero({
  summary,
  activeFilter,
  onFilterChange,
  viewMode,
  onViewModeChange,
  onRefresh,
  shareCardEffectiveDate,
}: StatusHeroProps) {
  const shareCardDownload = React.useRef<ReturnType<typeof createNcrShareCardDownloadController> | null>(null);
  const [isShareCardGenerating, setIsShareCardGenerating] = React.useState(false);
  const [shareCardError, setShareCardError] = React.useState(false);

  if (!shareCardDownload.current) {
    shareCardDownload.current = createNcrShareCardDownloadController();
  }

  const shareCardUrl = buildNcrShareCardUrl(shareCardEffectiveDate);
  const handleShareCardDownload = React.useCallback(async () => {
    const controller = shareCardDownload.current;
    if (!controller || controller.isBusy()) return;

    setShareCardError(false);
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
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between xl:gap-6">
        <div className="min-w-0 shrink-0 xl:max-w-[30rem]">
          <h1 className="text-2xl font-black leading-tight tracking-tight text-white sm:text-3xl lg:text-4xl">May pasok ba?</h1>
          <p className="mt-1.5 text-xs font-medium leading-relaxed text-blue-100 sm:text-sm">
            {summary?.overallStatusHeadline || "Checking class suspension advisories across Metro Manila…"}
          </p>
        </div>

        <div className="flex min-w-0 flex-col items-start gap-2 xl:items-end">
          <div className={STATUS_HERO_CONTROL_LAYOUT}>
            <div className="col-span-2 grid w-full min-w-0 grid-cols-2 items-center gap-0.5 rounded-2xl bg-white/10 p-1 sm:flex sm:w-auto sm:flex-wrap" aria-label="Filter by class status">
              {filters.map((filter) => {
                const Icon = filter.icon;
                const isActive = activeFilter === filter.id;

                return (
                  <button
                    key={filter.id}
                    onClick={() => onFilterChange(isActive ? "all" : filter.id)}
                    aria-pressed={isActive}
                    className={`hero-touch-control flex min-h-11 items-center justify-center gap-1 rounded-xl px-2 text-[11px] font-bold transition-colors sm:justify-start sm:gap-1.5 sm:px-3.5 sm:text-sm ${
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
              className="hero-touch-control flex min-h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 text-xs font-semibold text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 sm:px-4 sm:text-sm"
            >
              <RefreshCw className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
              <span>Refresh</span>
            </button>

            <button
              type="button"
              onClick={handleShareCardDownload}
              disabled={isShareCardGenerating}
              aria-busy={isShareCardGenerating}
              aria-label="Download Share Card"
              aria-describedby={shareCardError ? "share-card-download-error" : undefined}
              className="hero-touch-control flex min-h-11 w-full min-w-0 items-center justify-center gap-1.5 rounded-xl border border-white/25 bg-white/10 px-3 text-xs font-bold text-white transition-colors hover:border-white/40 hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 disabled:cursor-wait disabled:opacity-75 sm:w-[13.75rem] sm:whitespace-nowrap sm:px-4 sm:text-sm"
            >
              {isShareCardGenerating ? (
                <LoaderCircle className="h-3.5 w-3.5 shrink-0 animate-spin sm:h-4 sm:w-4" aria-hidden="true" />
              ) : (
                <Download className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" aria-hidden="true" />
              )}
              <span className="sm:hidden">{isShareCardGenerating ? "Generating…" : "Share Card"}</span>
              <span className="hidden sm:inline">{isShareCardGenerating ? "Generating…" : "Download Share Card"}</span>
            </button>

            <div className="col-span-2 grid w-full grid-cols-2 items-center rounded-2xl border border-white/25 bg-white/10 p-1 sm:flex sm:w-auto">
              <button
                onClick={() => onViewModeChange("map")}
                className={`hero-touch-control flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl px-3.5 text-xs font-bold transition-colors sm:px-4 sm:text-sm ${
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
                className={`hero-touch-control flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl px-3.5 text-xs font-bold transition-colors sm:px-4 sm:text-sm ${
                  viewMode === "list"
                    ? "bg-white text-blue-600 shadow-sm"
                    : "text-white hover:bg-white/10"
                }`}
              >
                <ListFilter className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
                <span>List</span>
              </button>
            </div>
          </div>

          {shareCardError ? (
            <p
              id="share-card-download-error"
              role="status"
              aria-live="polite"
              className="w-full text-left text-xs font-medium text-red-100 xl:text-right"
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
      </div>
    </section>
  );
});
