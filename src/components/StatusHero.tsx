"use client";

import React from "react";
import { MayPasokSummary } from "@/types";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  HelpCircle,
  ListFilter,
  Map,
  RefreshCw,
} from "lucide-react";

interface StatusHeroProps {
  summary: MayPasokSummary | null;
  activeFilter: string;
  onFilterChange: (filter: string) => void;
  viewMode: "map" | "list";
  onViewModeChange: (mode: "map" | "list") => void;
  onRefresh: () => void;
}

export const StatusHero = React.memo(function StatusHero({
  summary,
  activeFilter,
  onFilterChange,
  viewMode,
  onViewModeChange,
  onRefresh,
}: StatusHeroProps) {
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

        <div className="flex min-w-0 flex-wrap items-center gap-2 xl:justify-end">
          <div className="flex min-w-0 flex-wrap items-center gap-0.5 rounded-2xl bg-white/10 p-1" aria-label="Filter by class status">
            {filters.map((filter) => {
              const Icon = filter.icon;
              const isActive = activeFilter === filter.id;

              return (
                <button
                  key={filter.id}
                  onClick={() => onFilterChange(isActive ? "all" : filter.id)}
                  aria-pressed={isActive}
                  className={`hero-touch-control flex min-h-10 items-center gap-1 rounded-xl px-2 text-[11px] font-bold transition-colors sm:gap-1.5 sm:px-3 sm:text-xs ${
                    isActive
                      ? filter.activeClass
                      : "text-white hover:bg-white/10"
                  }`}
                >
                  <Icon className={`h-3.5 w-3.5 ${isActive ? "text-current" : filter.iconClass}`} />
                  <span>{filter.label}</span>
                  <span className={`tabular-nums ${isActive ? "text-white/85" : "text-white/70"}`}>{filter.count}</span>
                </button>
              );
            })}
          </div>

          <button
            onClick={onRefresh}
            className="hero-touch-control flex min-h-10 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold text-white transition-colors hover:bg-white/10"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Refresh</span>
          </button>

          <div className="flex items-center rounded-2xl border border-white/25 bg-white/10 p-1">
            <button
              onClick={() => onViewModeChange("map")}
              className={`hero-touch-control flex min-h-10 items-center justify-center gap-1.5 rounded-xl px-3.5 text-xs font-bold transition-colors ${
                viewMode === "map"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-white hover:bg-white/10"
              }`}
            >
              <Map className="h-3.5 w-3.5" />
              <span>Map</span>
            </button>
            <button
              onClick={() => onViewModeChange("list")}
              className={`hero-touch-control flex min-h-10 items-center justify-center gap-1.5 rounded-xl px-3.5 text-xs font-bold transition-colors ${
                viewMode === "list"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-white hover:bg-white/10"
              }`}
            >
              <ListFilter className="h-3.5 w-3.5" />
              <span>List</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
});
