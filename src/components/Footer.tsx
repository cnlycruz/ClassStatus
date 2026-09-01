import React from "react";
import Link from "next/link";
import { ShieldCheck, Clock, MapPin } from "lucide-react";
import { CollectorLiveConsoleSlot } from "@/components/CollectorLiveConsoleSlot";

export function Footer() {
  return (
    <>
      <CollectorLiveConsoleSlot />
      <footer className="mt-16 border-t border-slate-200/80 bg-white/60 dark:border-slate-800/80 dark:bg-slate-950/60 backdrop-blur text-xs text-slate-500 dark:text-slate-400">
        <div className="mx-auto max-w-7xl 2xl:max-w-[min(90vw,1920px)] px-4 py-8 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
            <div className="md:col-span-2 space-y-3">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900 dark:text-white text-sm">Class Status NCR</span>
              </div>
              <p className="max-w-md leading-relaxed text-slate-600 dark:text-slate-400">
                Metro Manila’s premier real-time class suspension tracking system answering “May pasok ba?”
                through verified official local government bulletins, DepEd orders, and meteorological advisories.
              </p>
              <div className="flex items-center gap-2 text-[11px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 p-2.5 rounded-lg border border-amber-200/60 dark:border-amber-900/60">
                <ShieldCheck className="h-4 w-4 shrink-0" />
                <span>
                  <strong>Official Advisory Notice:</strong> Official announcements by respective LGUs, school
                  administrations, and DepEd/CHED remain the ultimate legal authority for class attendance.
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-semibold text-slate-900 dark:text-white uppercase tracking-wider text-[11px]">Geographic Coverage</h4>
              <ul className="space-y-1.5">
                <li className="flex items-center gap-1.5"><MapPin className="h-3 w-3 text-blue-500" /><span>All 17 NCR Cities & Municipalities</span></li>
                <li className="flex items-center gap-1.5"><Clock className="h-3 w-3 text-emerald-500" /><span>Synchronized to Asia/Manila (UTC+8)</span></li>
                <li><span>Active, Upcoming & Expired lifecycle parsing</span></li>
              </ul>
            </div>

            <div className="space-y-2">
              <h4 className="font-semibold text-slate-900 dark:text-white uppercase tracking-wider text-[11px]">Transparency & Data</h4>
              <ul className="space-y-1.5">
                <li><Link href="/sources" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Collector Sources</Link></li>
                <li><Link href="/about" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">About & Methodology</Link></li>
              </ul>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-slate-200/60 dark:border-slate-800/60 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px]">
            <p>© {new Date().getFullYear()} Class Status NCR. Dedicated to Filipino students and educators.</p>
          </div>
        </div>
      </footer>
    </>
  );
}
