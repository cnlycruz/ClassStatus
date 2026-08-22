"use client";

import React from "react";
import { LGUInfo, SuspensionStatus, SuspensionRecord, LGUId } from "@/types";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  HelpCircle,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  Building2,
} from "lucide-react";

interface ListViewProps {
  lgus: (LGUInfo & {
    status: SuspensionStatus;
    primaryRecord?: SuspensionRecord;
    hasUpcoming: boolean;
    upcomingRecord?: SuspensionRecord;
  })[];
  selectedLguId: LGUId | null;
  onSelectLgu: (lguId: LGUId) => void;
  statusFilter: string;
}

export function ListView({
  lgus,
  selectedLguId,
  onSelectLgu,
  statusFilter,
}: ListViewProps) {
  // Sort LGUs: Suspended first, then Upcoming, then Partial, then Normal, then Awaiting
  const sortedLgus = React.useMemo(() => {
    let list = [...lgus];

    if (statusFilter && statusFilter !== "all") {
      list = list.filter((l) => l.status === statusFilter);
    }

    return list.sort((a, b) => {
      const order: Record<SuspensionStatus, number> = {
        "classes-suspended": 1,
        "partial-suspension": 2,
        "classes-continue": 3,
        "awaiting-information": 4,
      };
      if (a.hasUpcoming && !b.hasUpcoming) return -1;
      if (!a.hasUpcoming && b.hasUpcoming) return 1;
      return order[a.status] - order[b.status];
    });
  }, [lgus, statusFilter]);

  return (
    <div className="w-full space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {sortedLgus.map((lgu) => {
          const isSelected = selectedLguId === lgu.id;
          const record = lgu.primaryRecord;

          return (
            <div
              key={lgu.id}
              onClick={() => onSelectLgu(lgu.id)}
              className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between gap-3 text-left ${
                isSelected
                  ? "bg-blue-50/80 dark:bg-blue-950/40 border-blue-500 shadow-md ring-2 ring-blue-500/20"
                  : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 shadow-sm hover:shadow"
              }`}
            >
              <div className="space-y-2">
                {/* Top Row: Name and Status */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-1.5">
                      <span>{lgu.name}</span>
                      {lgu.hasNorthSouthDivision && (
                        <span className="text-[10px] text-slate-400 font-normal">(N & S)</span>
                      )}
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {lgu.district} • Mayor {lgu.mayor}
                    </p>
                  </div>

                  <span
                    className={`text-[10px] font-bold px-2.5 py-1 rounded-xl uppercase tracking-wider shrink-0 ${
                      lgu.status === "classes-suspended"
                        ? "bg-red-500 text-white shadow-sm shadow-red-500/20"
                        : lgu.status === "partial-suspension"
                        ? "bg-amber-500 text-white shadow-sm shadow-amber-500/20"
                        : lgu.status === "classes-continue"
                        ? "bg-emerald-600 text-white shadow-sm shadow-emerald-600/20"
                        : "bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    {lgu.status === "classes-suspended"
                      ? "SUSPENDED"
                      : lgu.status === "partial-suspension"
                      ? "PARTIAL"
                      : lgu.status === "classes-continue"
                      ? "NORMAL"
                      : "AWAITING"}
                  </span>
                </div>

                {/* Reason & Levels */}
                <div className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
                  {record?.announcementSummary || "Classes continue as normally scheduled. No suspensions in effect."}
                </div>

                {/* Upcoming Tomorrow Notice */}
                {lgu.hasUpcoming && (
                  <div className="flex items-center gap-1 text-[11px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 px-2.5 py-1 rounded-lg border border-amber-200 dark:border-amber-900">
                    <Clock className="h-3 w-3 shrink-0" />
                    <span>Advance notice: Suspended for Tomorrow</span>
                  </div>
                )}
              </div>

              {/* Bottom Row: Source and Details Link */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                <span className="truncate max-w-[180px]">
                  {record?.source.name || "City Government Desk"}
                </span>
                <span className="text-blue-600 dark:text-blue-400 font-semibold flex items-center gap-0.5">
                  <span>Details</span>
                  <ChevronRight className="h-3 w-3" />
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
