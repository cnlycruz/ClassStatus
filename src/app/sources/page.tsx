"use client";

import React, { useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { OPERATIONAL_COLLECTOR_SOURCES } from "@/data/sources";
import {
  ShieldCheck,
  Radio,
  ExternalLink,
  Search,
} from "lucide-react";

export default function SourcesPage() {
  const [search, setSearch] = useState("");

  const filtered = OPERATIONAL_COLLECTOR_SOURCES.filter((source) => {
    return (
      source.name.toLowerCase().includes(search.toLowerCase()) ||
      source.organization.toLowerCase().includes(search.toLowerCase()) ||
      source.type.toLowerCase().includes(search.toLowerCase())
    );
  });

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-8">
        {/* Page Header */}
        <div className="space-y-3 max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full bg-blue-100 dark:bg-blue-950 px-3 py-1 text-xs font-bold text-blue-700 dark:text-blue-300">
            <Radio className="h-3.5 w-3.5 text-blue-600 animate-pulse" />
            <span>Public Data Transparency</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Monitored Sources & Reliability Tiers
          </h1>
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
            Tier 3 reputable media is the only operational collector path. Government, LGU, and institutional
            sources remain registered for future development but cannot affect live status.
          </p>
        </div>

        {/* Reliability Tiers Explanation Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                Tier 1 • Under Development
              </span>
              <ShieldCheck className="h-5 w-5 text-emerald-500" />
            </div>
            <h3 className="font-bold text-slate-900 dark:text-white text-sm">Official Government & LGUs</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Official government and LGU adapters are retained in the architecture but are explicitly disabled.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                Tier 2 • Under Development
              </span>
              <ShieldCheck className="h-5 w-5 text-blue-500" />
            </div>
            <h3 className="font-bold text-slate-900 dark:text-white text-sm">University & College Desks</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Future university and school-specific adapters are represented by policy but do not collect or publish.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300">
                Tier 3 • Operational
              </span>
              <ShieldCheck className="h-5 w-5 text-purple-500" />
            </div>
            <h3 className="font-bold text-slate-900 dark:text-white text-sm">Reputable News Channels</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Approved media desks collect live articles. One explicit report is medium confidence; independent
              corroboration promotes a matching record to high confidence.
            </p>
          </div>
        </div>

        {/* Operational source search */}
        <div className="flex items-center justify-between gap-3 pt-2">
          <div className="text-xs font-bold text-slate-500">
            {OPERATIONAL_COLLECTOR_SOURCES.length} operational sources
          </div>
          <div className="relative max-w-xs w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search source by name or agency..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Sources Table / List */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden divide-y divide-slate-100 dark:divide-slate-800/80">
          {filtered.map((source) => (
            <div
              key={source.id}
              className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
            >
              <div className="space-y-1.5">
                <div className="flex items-center gap-2.5">
                  <h4 className="font-bold text-slate-900 dark:text-white text-sm">{source.name}</h4>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      source.reliabilityTier === 1
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                        : "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300"
                    }`}
                  >
                    Tier {source.reliabilityTier}
                  </span>
                </div>

                <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-3">
                  <span>{source.organization}</span>
                  <span>•</span>
                  <span className="capitalize">{source.type.replace("-", " ")}</span>
                  <span>•</span>
                  <span>Polling every {source.checkIntervalMinutes} min</span>
                </div>
              </div>

              <div className="flex items-center gap-4 shrink-0">
                <div className="text-right text-xs">
                  <div className={`flex items-center gap-1.5 font-semibold justify-end ${source.operationalState === "operational" ? "text-emerald-600 dark:text-emerald-400" : "text-slate-500 dark:text-slate-400"}`}>
                    <span className={`h-2 w-2 rounded-full ${source.operationalState === "operational" ? "bg-emerald-500 animate-pulse" : "bg-slate-400"}`} />
                    <span>{source.operationalState === "operational" ? "Operational" : "Under development"}</span>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {source.totalCollected} live articles collected this process
                  </div>
                </div>

                <a
                  href={source.publicUrl || source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-xl text-blue-600 hover:text-blue-700 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 transition-colors"
                  title="Open Source URL"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            </div>
          ))}
        </div>
      </main>

      <Footer />
    </div>
  );
}
