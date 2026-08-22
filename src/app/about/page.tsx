import React from "react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import {
  HelpCircle,
  Clock,
  ShieldCheck,
  MapPin,
  Cpu,
  Sparkles,
  School,
  AlertCircle,
  FileCheck2,
} from "lucide-react";

export default function AboutPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 mx-auto w-full max-w-4xl px-4 sm:px-6 lg:px-8 py-10 sm:py-16 space-y-12">
        {/* Header */}
        <div className="space-y-4 text-center max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 rounded-full bg-blue-100 dark:bg-blue-950 px-3.5 py-1 text-xs font-bold text-blue-700 dark:text-blue-300">
            <span>🇵🇭 About ClassStatus NCR</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-slate-900 dark:text-white">
            Answering &ldquo;May Pasok Ba?&rdquo; with Speed & Truth
          </h1>
          <p className="text-base text-slate-600 dark:text-slate-300 leading-relaxed">
            Built for millions of students, parents, and teachers across Metro Manila who need instantaneous, trustworthy, and verified class suspension information during typhoons, monsoon rains, and weather disturbances.
          </p>
        </div>

        {/* Why it exists */}
        <div className="space-y-4 bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-blue-500" />
            <span>Why ClassStatus NCR Exists</span>
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            During inclement weather in the Philippines, suspension announcements are fragmented across dozens of individual mayor Facebook pages, news feeds, DepEd division memos, and social media threads. Students frequently face misinformation, outdated screenshots, or confusion between morning and afternoon shifts.
          </p>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            <strong>ClassStatus NCR</strong> centralizes all 17 Metro Manila LGUs into a single interactive map. By combining automated NLP ingestion with authoritative source verification, students get unambiguous answers in seconds.
          </p>
        </div>

        {/* Suspension Lifecycle Architecture */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Cpu className="h-5 w-5 text-indigo-500" />
            <span>Suspension Lifecycle Architecture</span>
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            Every announcement moves through a strict state machine synchronized to <strong>Asia/Manila (UTC+8)</strong>:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            <div className="p-4 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 space-y-1">
              <span className="text-xs font-bold uppercase text-blue-600 dark:text-blue-400">1. Discovered & Parsed</span>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Collector normalizes raw announcements, extracting LGU boundaries, affected grades, and timeframes.
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 space-y-1">
              <span className="text-xs font-bold uppercase text-amber-600 dark:text-amber-400">2. Upcoming vs Active</span>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Announcements made tonight for tomorrow immediately flag as <em>Upcoming Tomorrow</em> without waiting for morning.
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1">
              <span className="text-xs font-bold uppercase text-slate-600 dark:text-slate-400">3. Automatic Expiry</span>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Once the effective date passes, records automatically expire so students never see stale suspensions.
              </p>
            </div>
          </div>
        </div>

        {/* FAQs */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-emerald-500" />
            <span>Frequently Asked Questions</span>
          </h2>
          <div className="space-y-3">
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1.5">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                How does Caloocan North and South work?
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Caloocan is geographically separated into North Caloocan (adjoining QC and Bulacan) and South Caloocan (adjoining Manila and Malabon). ClassStatus NCR renders both discrete polygons with accurate borders while maintaining unified citywide LGU status.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1.5">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                What if an announcement is announced tonight for tomorrow?
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                The platform immediately highlights the LGU with an <strong>Upcoming Tomorrow</strong> badge and reflects it in the suspension count so students and parents can plan ahead of time.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1.5">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                Are university-level (tertiary) suspensions covered?
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Yes! When an LGU announces &ldquo;All Levels&rdquo;, tertiary and college levels are automatically marked. When a suspension is specific to Basic Education (Kinder to Grade 12), the status clearly displays as <em>Partial Suspension</em>.
              </p>
            </div>
          </div>
        </div>

        {/* Legal Disclaimer */}
        <div className="p-6 rounded-3xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200 space-y-2 text-xs leading-relaxed">
          <div className="flex items-center gap-2 font-bold text-sm text-amber-800 dark:text-amber-300">
            <AlertCircle className="h-4 w-4" />
            <span>Important Legal Disclaimer</span>
          </div>
          <p>
            ClassStatus NCR is an independent public information platform aggregating public advisories. Official announcements published directly by respective Local Government Units (Mayors/PIOs), the Department of Education (DepEd), the Commission on Higher Education (CHED), and individual school administrations remain the sole legal authority on class attendance.
          </p>
        </div>
      </main>

      <Footer />
    </div>
  );
}
