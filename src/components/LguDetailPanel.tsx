"use client";

import React, { useState } from "react";
import { LGUInfo, SuspensionStatus, SuspensionRecord } from "@/types";
import { NCR_SCHOOLS } from "@/data/schools";
import {
  X,
  ShieldCheck,
  ExternalLink,
  Calendar,
  Clock,
  Building2,
  Share2,
  Check,
  AlertCircle,
  School,
  FileText,
  MapPin,
  ChevronDown,
} from "lucide-react";

interface LguDetailPanelProps {
  lgu: (LGUInfo & {
    status: SuspensionStatus;
    primaryRecord?: SuspensionRecord;
    hasUpcoming: boolean;
    upcomingRecord?: SuspensionRecord;
    activeRecords?: SuspensionRecord[];
  }) | null;
  onClose: () => void;
}

export function LguDetailPanel({ lgu, onClose }: LguDetailPanelProps) {
  const [copied, setCopied] = useState(false);

  if (!lgu) return null;

  const record = lgu.primaryRecord;
  const lguSchools = NCR_SCHOOLS.filter((s) => s.lguId === lgu.id);

  const handleShare = async () => {
    const statusText =
      lgu.status === "classes-suspended"
        ? "CLASSES SUSPENDED"
        : lgu.status === "partial-suspension"
        ? "PARTIAL CLASS SUSPENSION"
        : lgu.status === "classes-continue"
        ? "CLASSES CONTINUE"
        : "Awaiting update";

    const shareMessage =
      `🇵🇭 [ClassStatus NCR] ${lgu.name.toUpperCase()}: ${statusText}\n` +
      `📅 Date: ${record?.effectiveDate || "Today"}\n` +
      `🎓 Levels: ${record?.affectedLevels.join(", ") || "All Levels"}\n` +
      `📌 Reason: ${record?.reason || "Normal classes"}\n` +
      `🔗 Source: ${record?.source.name || "Official LGU Desk"} (${record?.source.url || ""})\n` +
      `Checked at: https://classstatus-ncr.ph`;

    if (navigator.clipboard) {
      await navigator.clipboard.writeText(shareMessage);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const getStatusBadge = (status: SuspensionStatus) => {
    switch (status) {
      case "classes-suspended":
        return {
          label: "CLASSES SUSPENDED",
          bg: "bg-red-500/10 text-red-700 dark:bg-red-950/50 dark:text-red-300 border-red-300 dark:border-red-800",
          icon: AlertCircle,
        };
      case "partial-suspension":
        return {
          label: "PARTIAL SUSPENSION",
          bg: "bg-amber-500/10 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border-amber-300 dark:border-amber-800",
          icon: Clock,
        };
      case "classes-continue":
        return {
          label: "CLASSES CONTINUE",
          bg: "bg-emerald-500/10 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800",
          icon: ShieldCheck,
        };
      default:
        return {
          label: "AWAITING INFORMATION",
          bg: "bg-slate-500/10 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700",
          icon: Clock,
        };
    }
  };

  const badgeConfig = getStatusBadge(lgu.status);
  const StatusIcon = badgeConfig.icon;

  const content = (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl lg:rounded-2xl shadow-2xl lg:shadow-xl overflow-hidden transition-all">
      {/* Drag handle on Mobile */}
      <div className="lg:hidden w-full pt-3 pb-1 flex justify-center bg-slate-50 dark:bg-slate-950 cursor-grab active:cursor-grabbing">
        <div className="w-12 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700" />
      </div>

      {/* Header */}
      <div className="lgu-detail-header shrink-0 p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/70">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                {lgu.name}
              </h2>
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                {lgu.district}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {lgu.nativeName} • Mayor {lgu.mayor}
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 dark:hover:text-slate-200 dark:hover:bg-slate-800 transition-colors"
            aria-label="Close details"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Primary Status Banner */}
        <div className={`lgu-detail-status mt-3.5 p-3.5 rounded-2xl border flex items-center justify-between gap-3 ${badgeConfig.bg}`}>
          <div className="flex items-center gap-2.5">
            <StatusIcon className="h-5 w-5 shrink-0" />
            <div>
              <div className="text-xs font-bold tracking-wider uppercase">{badgeConfig.label}</div>
              <div className="text-[11px] font-medium opacity-90">
                {record?.effectiveDate ? `Effective: ${record.effectiveDate}` : "Current Status"}
              </div>
            </div>
          </div>
          {lgu.hasUpcoming && (
            <span className="text-[10px] font-bold bg-amber-500 text-white px-2 py-0.5 rounded-full uppercase tracking-wider shadow-sm animate-pulse">
              Tomorrow
            </span>
          )}
        </div>
      </div>

      <div className="lgu-detail-scroll-region contents">
      {/* Body Content */}
      <div className="lgu-detail-body p-4 sm:p-5 overflow-y-auto space-y-4 text-xs text-slate-600 dark:text-slate-300 flex-1 min-h-0 overscroll-contain">
        {/* Affected Education Levels */}
        {record && (
          <div className="space-y-2">
            <h4 className="font-bold text-slate-900 dark:text-white uppercase tracking-wider text-[11px]">
              Affected Education Levels
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {record.affectedLevels.map((lvl) => (
                <span
                  key={lvl}
                  className="rounded-xl bg-blue-50 dark:bg-blue-950/70 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 px-3 py-1 text-xs font-semibold capitalize"
                >
                  {lvl.replace("-", " ")}
                </span>
              ))}
              <span className="rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-3 py-1 text-xs font-medium">
                {record.schoolSector === "all"
                  ? "Public & Private"
                  : record.schoolSector === "public"
                  ? "Public Only"
                  : "Private Only"}
              </span>
            </div>
          </div>
        )}

        {/* Reason and Advisory Summary */}
        <div className="space-y-2">
          <h4 className="font-bold text-slate-900 dark:text-white uppercase tracking-wider text-[11px]">
            Official Advisory & Reason
          </h4>
          <div className="bg-slate-50 dark:bg-slate-950 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-1.5">
            <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5 text-blue-500 shrink-0" />
              <span>{record?.reason || "Normal weather conditions and operations."}</span>
            </div>
            <p className="leading-relaxed text-slate-600 dark:text-slate-300 text-[11.5px]">
              {record?.announcementSummary ||
                "No class suspensions have been declared for this city. Classes continue as normally scheduled."}
            </p>
          </div>
        </div>

        {/* Source Citation & Evidence Verification Box */}
        {record && (
          <div className="space-y-2">
            <h4 className="font-bold text-slate-900 dark:text-white uppercase tracking-wider text-[11px] flex items-center justify-between">
              <span>Source & Evidence</span>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>{record.publicationProvenance?.type === "manual-admin" ? "Admin verified" : record.confidence === "high" ? "Corroborated" : "Single-source report"}</span>
              </span>
            </h4>
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-3.5 space-y-2 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-bold text-slate-900 dark:text-white text-xs">
                    {record.source.name}
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">
                    {record.publicationProvenance?.type === "manual-admin"
                      ? "Manually verified by ClassStatus Admin"
                      : `${record.source.organization} • Tier ${record.source.reliabilityTier} Media Report`}
                  </div>
                </div>
                <a
                  href={record.source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-blue-600 hover:text-blue-700 dark:text-blue-400 text-xs font-semibold px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 transition-colors shrink-0"
                >
                  <span>{record.publicationProvenance?.type === "manual-admin" ? "View official proof" : "Verify"}</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>

              {record.additionalSources && record.additionalSources.length > 0 && (
                <div className="pt-2 border-t border-slate-100 dark:border-slate-900 text-[10px] text-slate-500">
                  <span className="font-medium">Also confirmed by:</span>{" "}
                  {record.additionalSources.map((s) => s.name).join(", ")}
                </div>
              )}
              {record.publicationProvenance?.type === "manual-admin" && record.manualEvidence?.publicNote && (
                <p className="pt-2 border-t border-slate-100 dark:border-slate-900 text-[10px] leading-relaxed text-slate-600 dark:text-slate-300">
                  {record.manualEvidence.publicNote}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Major Schools in this LGU */}
        {lguSchools.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-bold text-slate-900 dark:text-white uppercase tracking-wider text-[11px]">
              Major Schools in {lgu.name} ({lguSchools.length})
            </h4>
            <div className="lgu-detail-schools space-y-1.5 max-h-44 overflow-y-auto pr-1">
              {lguSchools.map((school) => (
                <div
                  key={school.id}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200/70 dark:border-slate-800/70 text-[11px]"
                >
                  <div className="min-w-0 pr-2">
                    <span className="font-semibold text-slate-900 dark:text-white truncate block">
                      {school.name} ({school.acronym})
                    </span>
                    <span className="text-[10px] text-slate-400 block truncate">
                      {school.campusName || school.address}
                    </span>
                  </div>
                  <span
                    className={`text-[9px] font-bold px-2 py-0.5 rounded-lg shrink-0 uppercase ${
                      lgu.status === "classes-suspended"
                        ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                        : lgu.status === "partial-suspension"
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                        : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                    }`}
                  >
                    {lgu.status === "classes-suspended"
                      ? "Suspended"
                      : lgu.status === "partial-suspension"
                      ? "Partial"
                      : "Open"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Action Footer */}
      <div className="lgu-detail-footer p-3.5 sm:p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-between gap-2.5">
        <button
          onClick={handleShare}
          className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white py-3 px-4 font-bold text-xs transition-all shadow-md shadow-blue-500/25 active:scale-[0.98]"
        >
          {copied ? (
            <>
              <Check className="h-4 w-4" />
              <span>Advisory Copied!</span>
            </>
          ) : (
            <>
              <Share2 className="h-4 w-4" />
              <span>Share Advisory</span>
            </>
          )}
        </button>
        <a
          href={lgu.officialWebsite}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-11 items-center gap-1 text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white px-3.5 py-3 text-xs font-bold rounded-2xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors"
          title="Visit Official City Website"
        >
          <span>City Portal</span>
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop View (Sidebar Card) */}
      <div className="hidden lg:block w-full h-full min-h-0">{content}</div>

      {/* Mobile View (Bottom Sheet Drawer with Backdrop) */}
      <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="absolute inset-0" onClick={onClose} />
        <div className="relative h-[min(82dvh,44rem)] w-full pb-[max(0.75rem,env(safe-area-inset-bottom))] z-10 animate-in slide-in-from-bottom duration-250 ease-out">
          {content}
        </div>
      </div>
    </>
  );
}
