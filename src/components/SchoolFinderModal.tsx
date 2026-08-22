"use client";

import React, { useState, useEffect, useMemo } from "react";
import { NCR_SCHOOLS } from "@/data/schools";
import { NCR_LGUS } from "@/data/lgus";
import { suspensionAppliesToSchool } from "@/collector/lifecycle";
import { LGUInfo, SuspensionStatus, SuspensionRecord } from "@/types";
import {
  Search,
  X,
  School,
  MapPin,
  ExternalLink,
  ShieldCheck,
  AlertTriangle,
  Clock,
  Building2,
  Sparkles,
} from "lucide-react";

interface SchoolFinderModalProps {
  isOpen: boolean;
  onClose: () => void;
  lgus: (LGUInfo & {
    status: SuspensionStatus;
    primaryRecord?: SuspensionRecord;
    activeRecords?: SuspensionRecord[];
    upcomingRecord?: SuspensionRecord;
  })[];
  onSelectLguFromSchool: (lguId: string) => void;
}

export function SchoolFinderModal({
  isOpen,
  onClose,
  lgus,
  onSelectLguFromSchool,
}: SchoolFinderModalProps) {
  const [query, setQuery] = useState("");
  const [sectorFilter, setSectorFilter] = useState<"all" | "public" | "private">("all");
  const [directSchoolStatus, setDirectSchoolStatus] = useState<Record<string, { status: SuspensionStatus; primaryRecord?: SuspensionRecord }>>({});

  const lguStatusMap = useMemo(() => {
    const map = new Map<string, { status: SuspensionStatus; records: SuspensionRecord[] }>();
    lgus.forEach((l) => {
      const records = [l.primaryRecord, ...(l.activeRecords || []), l.upcomingRecord].filter(
        (record): record is SuspensionRecord => Boolean(record)
      );
      map.set(l.id, { status: l.status, records });
    });
    return map;
  }, [lgus]);

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    fetch("/api/schools", { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("school status unavailable")))
      .then((payload) => setDirectSchoolStatus(Object.fromEntries(
        (payload.schools || []).map((school: { id: string; status: SuspensionStatus; primaryRecord?: SuspensionRecord }) => [
          school.id,
          { status: school.status, primaryRecord: school.primaryRecord },
        ])
      )))
      .catch(() => undefined);
    return () => controller.abort();
  }, [isOpen]);

  const filteredSchools = useMemo(() => {
    let list = NCR_SCHOOLS;

    if (sectorFilter !== "all") {
      list = list.filter((s) => s.sector === sectorFilter);
    }

    if (!query.trim()) return list;

    const q = query.toLowerCase().trim();
    return list.filter((s) => {
      const matchName = s.name.toLowerCase().includes(q);
      const matchAcronym = s.acronym.toLowerCase().includes(q);
      const matchCampus = s.campusName?.toLowerCase().includes(q) || false;
      const matchAddress = s.address.toLowerCase().includes(q);
      const lguName = NCR_LGUS[s.lguId]?.name.toLowerCase() || "";
      const matchLgu = lguName.includes(q);
      const matchAlias = s.aliases.some((a) => a.toLowerCase().includes(q));

      return matchName || matchAcronym || matchCampus || matchAddress || matchLgu || matchAlias;
    });
  }, [query, sectorFilter]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col h-[90vh] sm:max-h-[85vh] animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
        {/* Mobile Drag Indicator */}
        <div className="sm:hidden w-full pt-3 pb-1 flex justify-center bg-slate-50 dark:bg-slate-950">
          <div className="w-12 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700" />
        </div>

        {/* Header & Search Bar */}
        <div className="p-4 sm:p-6 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/70 space-y-3.5 sm:space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400">
                <School className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                  Find Your School / University
                </h3>
                <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
                  Search across 50+ major NCR institutions & aliases
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-200 dark:hover:text-slate-200 dark:hover:bg-slate-800 transition-colors"
              aria-label="Close search"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Type acronym or name (UST, DLSU, PUP, Ateneo, UP Diliman)..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
              className="w-full pl-10 pr-12 py-3 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-2xl text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400 hover:text-slate-600 p-1"
              >
                Clear
              </button>
            )}
          </div>

          {/* Sector Filters (Horizontally scrollable on mobile) */}
          <div className="flex items-center gap-1.5 sm:gap-2 text-xs font-semibold overflow-x-auto pb-1 no-scrollbar">
            <span className="text-slate-400 text-[11px] shrink-0">Sector:</span>
            <button
              onClick={() => setSectorFilter("all")}
              className={`px-3 py-1 rounded-full text-xs shrink-0 transition-colors ${
                sectorFilter === "all"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
              }`}
            >
              All ({NCR_SCHOOLS.length})
            </button>
            <button
              onClick={() => setSectorFilter("public")}
              className={`px-3 py-1 rounded-full text-xs shrink-0 transition-colors ${
                sectorFilter === "public"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
              }`}
            >
              State / Public
            </button>
            <button
              onClick={() => setSectorFilter("private")}
              className={`px-3 py-1 rounded-full text-xs shrink-0 transition-colors ${
                sectorFilter === "private"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
              }`}
            >
              Private
            </button>
          </div>
        </div>

        {/* Results List */}
        <div className="p-3 sm:p-6 overflow-y-auto space-y-2 flex-1 divide-y divide-slate-100 dark:divide-slate-800/60 overscroll-contain">
          {filteredSchools.length === 0 ? (
            <div className="text-center py-12 text-slate-500 dark:text-slate-400 space-y-2">
              <School className="h-8 w-8 mx-auto text-slate-300 dark:text-slate-700" />
              <p className="font-semibold text-sm">No schools matching &quot;{query}&quot;</p>
              <p className="text-xs max-w-xs mx-auto">
                Try searching by city name, campus acronym (e.g. PUP, UST, DLSU), or street name.
              </p>
            </div>
          ) : (
            filteredSchools.map((school) => {
              const lguInfo = NCR_LGUS[school.lguId];
              const lguStatus = lguStatusMap.get(school.lguId);
              const direct = directSchoolStatus[school.id];
              const record = direct?.primaryRecord || lguStatus?.records.find((candidate) => suspensionAppliesToSchool(candidate, school));
              const status = direct?.status || (record ? lguStatus?.status || "awaiting-information" : "awaiting-information");

              return (
                <div
                  key={school.id}
                  className="pt-2.5 first:pt-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800/50 active:bg-slate-100 transition-colors group cursor-pointer"
                  onClick={() => {
                    onSelectLguFromSchool(school.lguId);
                    onClose();
                  }}
                >
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-900 dark:text-white text-xs sm:text-sm">
                        {school.name}
                      </span>
                      <span className="rounded bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-mono text-[10px] font-bold px-1.5 py-0.5">
                        {school.acronym}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400">
                      <span className="flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-300">
                        <MapPin className="h-3 w-3 text-blue-500 shrink-0" />
                        <span>{lguInfo?.name || school.lguId}</span>
                      </span>
                      <span>•</span>
                      <span className="truncate">{school.campusName || school.address}</span>
                    </div>

                    {record?.reason && (
                      <p className="text-[10px] sm:text-[11px] text-slate-600 dark:text-slate-300 line-clamp-1 italic">
                        &ldquo;{record.reason}&rdquo;
                      </p>
                    )}
                  </div>

                  {/* Status Badge */}
                  <div className="flex items-center sm:flex-col sm:items-end justify-between gap-1.5 shrink-0 pt-1 sm:pt-0">
                    <span
                      className={`text-[10px] sm:text-xs font-bold px-2.5 py-1 rounded-xl uppercase tracking-wider ${
                        status === "classes-suspended"
                          ? "bg-red-500 text-white shadow-sm shadow-red-500/20"
                          : status === "partial-suspension"
                          ? "bg-amber-500 text-white shadow-sm shadow-amber-500/20"
                          : status === "classes-continue"
                          ? "bg-emerald-600 text-white shadow-sm shadow-emerald-600/20"
                          : "bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                      }`}
                    >
                      {status === "classes-suspended"
                        ? "SUSPENDED"
                        : status === "partial-suspension"
                        ? "PARTIAL"
                        : status === "classes-continue"
                        ? "CLASSES OPEN"
                        : "AWAITING"}
                    </span>
                    <span className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold sm:group-hover:underline">
                      Inspect LGU →
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
