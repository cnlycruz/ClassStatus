"use client";

import React, { useState, useEffect } from "react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { StatusHero } from "@/components/StatusHero";
import { NcrInteractiveMap } from "@/components/NcrInteractiveMap";
import { LguDetailPanel } from "@/components/LguDetailPanel";
import { ListView } from "@/components/ListView";
import { SchoolFinderModal } from "@/components/SchoolFinderModal";
import { ALL_LGU_IDS, NCR_LGUS } from "@/data/lgus";
import { LGUId, LGUInfo, MayPasokSummary, SuspensionRecord, SuspensionStatus } from "@/types";
import { MapPin, Compass } from "lucide-react";

export default function HomePage() {
  const [lgus, setLgus] = useState<
    (LGUInfo & {
      status: SuspensionStatus;
      primaryRecord?: SuspensionRecord;
      hasUpcoming: boolean;
      upcomingRecord?: SuspensionRecord;
      activeRecords?: SuspensionRecord[];
    })[]
  >([]);
  const [summary, setSummary] = useState<MayPasokSummary | null>(null);
  const [selectedLguId, setSelectedLguId] = useState<LGUId | null>(null);
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"map" | "list">("map");
  const [isSchoolSearchOpen, setIsSchoolSearchOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize data
  const loadData = async () => {
    try {
      const res = await fetch("/api/lgus");
      if (res.ok) {
        const json = await res.json();
        setLgus(json.lgus);
        setSummary(json.summary);
        setIsLoading(false);
        return;
      }
    } catch {
      // fallback
    }

    // Safe fallback: network/API failure must never synthesize a suspension.
    const computedLgus = ALL_LGU_IDS.map((id) => {
      const info = NCR_LGUS[id];
      return {
        ...info,
        status: "awaiting-information" as const,
        primaryRecord: undefined,
        hasUpcoming: false,
        upcomingRecord: undefined,
        activeRecords: [],
      };
    });

    const suspendedCount = 0;
    const partialCount = 0;
    const continueCount = 0;
    const awaitingCount = ALL_LGU_IDS.length;
    const upcomingCount = 0;

    setLgus(computedLgus);
    setSummary({
      updatedAt: new Date().toISOString(),
      philippineTimeFormatted: "Asia/Manila (UTC+8)",
      todayDateFormatted: "Today",
      totalLgus: 17,
      suspendedCount,
      partialCount,
      continueCount,
      awaitingCount,
      upcomingCount,
      hasUpcomingSuspensions: upcomingCount > 0,
      overallStatusHeadline: "Checking Tier 3 class-suspension reports across Metro Manila",
    });
    setIsLoading(false);
  };

  useEffect(() => {
    loadData();

    // Default select Manila on desktop on initial load if screen is large
    if (typeof window !== "undefined" && window.innerWidth >= 1024) {
      setSelectedLguId("manila");
    }

    // Keyboard shortcut '/' or 'Ctrl+K' for school search
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "/" && (e.target as HTMLElement).tagName !== "INPUT") {
        e.preventDefault();
        setIsSchoolSearchOpen(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setIsSchoolSearchOpen(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const selectedLgu = lgus.find((l) => l.id === selectedLguId) || null;

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar onOpenSchoolSearch={() => setIsSchoolSearchOpen(true)} />

      <main className="dashboard-main flex-1 mx-auto w-full max-w-7xl 2xl:max-w-[min(90vw,1920px)] px-3 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-5 space-y-5 sm:space-y-6">
        {/* Status Announcement Hero */}
        <StatusHero
          summary={summary}
          activeFilter={activeFilter}
          onFilterChange={(f) => setActiveFilter(f)}
          viewMode={viewMode}
          onViewModeChange={(m) => setViewMode(m)}
          onRefresh={loadData}
        />

        {/* Main Content Area: Map + Detail Panel or List View */}
        {viewMode === "map" ? (
          <div className="dashboard-map-region grid grid-cols-1 gap-5 lg:grid-cols-12 lg:items-stretch lg:gap-5 lg:min-h-[clamp(34rem,calc(100dvh-20rem),46rem)]">
            {/* Interactive Map Column */}
            <div className="lg:col-span-8 flex flex-col gap-2.5 lg:h-full lg:min-h-0">
              <div className="flex items-center px-1 text-xs text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1.5 font-medium">
                  <MapPin className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                  <span className="hidden sm:inline">Select an NCR city or municipality to view its advisory</span>
                  <span className="sm:hidden">Select a city to view its advisory</span>
                </span>
              </div>

              <NcrInteractiveMap
                lgus={lgus}
                selectedLguId={selectedLguId}
                onSelectLgu={(id) => setSelectedLguId(id)}
                onClearSelection={() => setSelectedLguId(null)}
                statusFilter={activeFilter}
              />
            </div>

            {/* Selected LGU Detail Panel Column (Desktop Sidebar / Mobile Slide-up Bottom Drawer) */}
            <div className="lg:col-span-4 lg:h-full lg:min-h-0">
              {selectedLgu ? (
                <LguDetailPanel
                  lgu={selectedLgu}
                  onClose={() => setSelectedLguId(null)}
                />
              ) : (
                <div className="hidden lg:flex h-full rounded-3xl border border-dashed border-slate-300 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 p-6 flex-col items-center justify-center text-center text-slate-400 space-y-3">
                  <Compass className="h-10 w-10 text-slate-300 dark:text-slate-700 animate-pulse" />
                  <div className="space-y-1">
                    <p className="font-bold text-slate-700 dark:text-slate-200 text-sm">
                      Select an LGU on the map
                    </p>
                    <p className="text-xs max-w-xs text-slate-500">
                      Click any city or municipality to view official suspension advisories, affected grade levels, and verified sources.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* List & Card Grid View */
          <ListView
            lgus={lgus}
            selectedLguId={selectedLguId}
            onSelectLgu={(id) => {
              setSelectedLguId(id);
              setViewMode("map");
            }}
            statusFilter={activeFilter}
          />
        )}
      </main>

      {/* School Finder Modal */}
      <SchoolFinderModal
        isOpen={isSchoolSearchOpen}
        onClose={() => setIsSchoolSearchOpen(false)}
        lgus={lgus}
        onSelectLguFromSchool={(lguId) => {
          setSelectedLguId(lguId as LGUId);
          setViewMode("map");
        }}
      />

      <Footer />
    </div>
  );
}
