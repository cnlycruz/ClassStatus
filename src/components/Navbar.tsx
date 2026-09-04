"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "./ThemeContext";
import { SuspensionAlerts } from "./SuspensionAlerts";
import type { LGUId } from "@/types";
import {
  MapPin,
  Clock,
  Moon,
  Sun,
  Search,
  Radio,
  Info,
  Menu,
  X,
} from "lucide-react";

let philippineTimeFormatter: Intl.DateTimeFormat | undefined;

function formatPhilippineTime(date: Date): string {
  philippineTimeFormatter ??= new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  return `${philippineTimeFormatter.format(date)} PHT`;
}

const NAV_LINKS = [
  { href: "/", label: "Interactive Map", icon: MapPin },
  { href: "/sources", label: "Sources & Transparency", icon: Radio },
  { href: "/about", label: "About", icon: Info },
] as const;

function PhilippineTime({ fallback }: { fallback: string }) {
  const [timeStr, setTimeStr] = useState("");

  useEffect(() => {
    const updateTime = () => {
      setTimeStr(formatPhilippineTime(new Date()));
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return <>{timeStr || fallback}</>;
}

export const Navbar = React.memo(function Navbar({ onOpenSchoolSearch, selectedLguId }: { onOpenSchoolSearch?: () => void; selectedLguId?: LGUId | null }) {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const showsPublicAlerts = !pathname.startsWith("/collector") && !pathname.startsWith("/auth");

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200/80 bg-white/90 backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-950/90 transition-colors">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center px-3 sm:px-6 lg:px-8 2xl:max-w-[min(90vw,1920px)]">
        {/* Brand, time, and route navigation intentionally share one compact cluster. */}
        <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
          <Link href="/" className="group flex min-h-11 min-w-0 items-center gap-2">
            <div className="relative h-8 w-8 shrink-0 transition-transform group-hover:scale-105 sm:h-9 sm:w-9">
              <Image
                src={theme === "dark" ? "/LOGODARK.png" : "/LOGO.PNG"}
                alt="Class Status NCR"
                width={36}
                height={36}
                priority
                className="h-full w-full rounded-xl object-contain"
              />
              <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5 sm:h-3 sm:w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 sm:h-3 sm:w-3 bg-emerald-500"></span>
              </span>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-slate-900 dark:text-white tracking-tight text-base sm:text-lg">
                  Class Status
                </span>
                <span className="max-[339px]:hidden rounded bg-blue-100 px-1 py-0.2 text-[10px] sm:text-xs font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                  NCR
                </span>
              </div>
              <p className="text-[9px] sm:text-[10px] font-medium text-slate-500 dark:text-slate-400 hidden sm:block">
                Metro Manila Live Suspension Tracker
              </p>
            </div>
          </Link>

          {/* Live Philippine Time Clock */}
          <div className="hidden lg:flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50/80 px-2.5 py-1 text-xs font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-300 shadow-inner">
            <Clock className="h-3.5 w-3.5 text-blue-500 animate-pulse" />
            <span className="tabular-nums font-mono"><PhilippineTime fallback="Loading PHT..." /></span>
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold uppercase tracking-wider">
              ● LIVE
            </span>
          </div>

          {/* Desktop Navigation Links */}
          <nav aria-label="Primary navigation" className="hidden min-w-0 items-center gap-0.5 xl:flex">
            {NAV_LINKS.map((link) => {
              const Icon = link.icon;
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex min-h-11 whitespace-nowrap items-center gap-1.5 rounded-xl px-2 py-1.5 text-xs font-medium transition-colors ${
                    isActive
                      ? "bg-blue-50 text-blue-600 dark:bg-blue-950/70 dark:text-blue-400"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-200"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Utility controls stay right aligned; ml-auto absorbs the desktop space after About. */}
        <div className="ml-auto flex min-w-0 items-center gap-1.5 sm:gap-3">

          {/* The global school/LGU search is the single primary lookup entry point. */}
          {onOpenSchoolSearch && (
            <button
              onClick={onOpenSchoolSearch}
              className="flex h-11 w-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-100/70 px-0 text-xs font-semibold text-slate-700 shadow-sm transition-all hover:bg-slate-200 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 sm:w-48 sm:justify-start sm:px-3 lg:w-56 xl:w-[clamp(12rem,15vw,20rem)]"
              title="Search school or LGU (/)"
              aria-label="Search school or LGU"
            >
              <Search className="h-3.5 w-3.5 shrink-0 text-slate-500 dark:text-slate-400" />
              <span className="hidden truncate sm:inline">Search school or LGU</span>
            </button>
          )}

          {showsPublicAlerts && <SuspensionAlerts selectedLguId={selectedLguId} />}

          {/* Dark / Light Theme Toggle */}
          <button
            onClick={toggleTheme}
            aria-label="Toggle Theme"
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors"
          >
            {theme === "dark" ? (
              <Sun className="h-4 w-4 text-amber-400" />
            ) : (
              <Moon className="h-4 w-4 text-slate-600" />
            )}
          </button>

          {/* Mobile Menu Toggle Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="xl:hidden flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors"
            aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Mobile Navigation Dropdown Menu */}
      {mobileMenuOpen && (
        <div className="xl:hidden border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-950/95 backdrop-blur px-4 py-3 space-y-1 animate-in slide-in-from-top duration-150">
          <div className="flex items-center gap-2 py-1.5 px-2 text-[11px] font-mono text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-900 mb-1">
            <Clock className="h-3 w-3 text-blue-500" />
            <span><PhilippineTime fallback="Philippine Time" /></span>
          </div>

          {NAV_LINKS.map((link) => {
            const Icon = link.icon;
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex min-h-11 items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-semibold transition-colors ${
                  isActive
                    ? "bg-blue-50 text-blue-600 dark:bg-blue-950/70 dark:text-blue-400"
                    : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                <Icon className="h-4 w-4 text-slate-400" />
                <span>{link.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </header>
  );
});
