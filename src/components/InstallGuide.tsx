"use client";

import Image from "next/image";
import React, { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  Check,
  Download,
  EllipsisVertical,
  ExternalLink,
  House,
  MonitorDown,
  Plus,
  Share,
  Smartphone,
} from "lucide-react";
import { useInstallState } from "@/components/InstallProvider";

type GuidePlatform = "ios" | "android" | "desktop";

function platformToGuide(platform: ReturnType<typeof useInstallState>["platform"]): GuidePlatform {
  if (platform === "ios-safari" || platform === "ios-other") return "ios";
  if (platform === "android-chromium") return "android";
  return "desktop";
}

function TutorialStep({
  number,
  title,
  text,
  children,
}: {
  number: number;
  title: string;
  text: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <li className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:grid-cols-[11rem_1fr] sm:items-center sm:p-5">
      <div className="min-h-36 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-950" aria-hidden="true">
        {children}
      </div>
      <div>
        <div className="mb-2 flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-xs font-black text-white">{number}</span>
          <h3 className="font-bold text-slate-950 dark:text-white">{title}</h3>
        </div>
        <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">{text}</p>
      </div>
    </li>
  );
}

function AppIcon({ size = 44 }: { size?: number }) {
  return (
    <Image
      src="/icons/class-status-icon-192.png"
      alt=""
      width={size}
      height={size}
      className="rounded-[22%] shadow-sm ring-1 ring-slate-200 dark:ring-slate-700"
    />
  );
}

function SafariShareVisual() {
  return (
    <div className="flex h-36 flex-col justify-between p-3">
      <div className="h-3 w-20 rounded-full bg-slate-200 dark:bg-slate-800" />
      <div className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-2 h-2 w-full rounded bg-slate-100 dark:bg-slate-800" />
        <div className="flex items-center justify-around text-slate-400">
          <span className="h-4 w-4 rounded border border-current" />
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-600 ring-2 ring-blue-500 dark:bg-blue-950 dark:text-blue-300">
            <Share className="h-5 w-5" />
          </span>
          <span className="h-4 w-4 rounded-full border border-current" />
        </div>
      </div>
    </div>
  );
}

function AddToHomeVisual() {
  return (
    <div className="h-36 p-3">
      <div className="h-full rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-3 mx-auto h-1 w-8 rounded-full bg-slate-300 dark:bg-slate-700" />
        <div className="space-y-2">
          <div className="h-7 rounded-lg bg-slate-100 dark:bg-slate-800" />
          <div className="flex h-11 items-center gap-2 rounded-lg bg-blue-50 px-2 text-blue-700 ring-2 ring-blue-500 dark:bg-blue-950 dark:text-blue-200">
            <Plus className="h-5 w-5" />
            <span className="text-[10px] font-bold">Add to Home Screen</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConfirmAddVisual() {
  return (
    <div className="h-36 p-3">
      <div className="h-full rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center justify-between text-[10px] font-bold">
          <span className="text-slate-500">Cancel</span>
          <span className="rounded-md bg-blue-600 px-2 py-1 text-white ring-2 ring-blue-300">Add</span>
        </div>
        <div className="mt-5 flex items-center gap-3">
          <AppIcon size={42} />
          <div>
            <div className="text-[11px] font-bold text-slate-800 dark:text-white">Class Status</div>
            <div className="text-[9px] text-slate-500">Home Screen</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function HomeScreenVisual({ android = false }: { android?: boolean }) {
  return (
    <div className={`flex h-36 items-center justify-center ${android ? "bg-gradient-to-br from-sky-100 to-emerald-100 dark:from-sky-950 dark:to-emerald-950" : "bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-950 dark:to-indigo-950"}`}>
      <div className="text-center">
        <AppIcon size={52} />
        <p className="mt-1.5 text-[9px] font-semibold text-slate-700 dark:text-slate-200">Class Status</p>
      </div>
    </div>
  );
}

function BrowserMenuVisual() {
  return (
    <div className="h-36 p-3">
      <div className="relative h-full rounded-xl border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-2 dark:bg-slate-800">
          <div className="h-2 flex-1 rounded bg-slate-300 dark:bg-slate-600" />
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 text-blue-700 ring-2 ring-blue-500 dark:bg-blue-950 dark:text-blue-200">
            <EllipsisVertical className="h-5 w-5" />
          </span>
        </div>
        <ArrowDown className="absolute right-5 top-[4.2rem] h-5 w-5 text-blue-600" />
      </div>
    </div>
  );
}

function InstallMenuVisual() {
  return (
    <div className="h-36 p-3">
      <div className="h-full rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="h-6 rounded bg-slate-100 dark:bg-slate-800" />
        <div className="mt-2 flex h-11 items-center gap-2 rounded-lg bg-blue-50 px-2 text-blue-700 ring-2 ring-blue-500 dark:bg-blue-950 dark:text-blue-200">
          <Download className="h-5 w-5" />
          <span className="text-[10px] font-bold">Install app</span>
        </div>
        <p className="mt-2 text-center text-[9px] text-slate-500">or Add to Home screen</p>
      </div>
    </div>
  );
}

function InstallConfirmVisual() {
  return (
    <div className="flex h-36 items-center justify-center p-3">
      <div className="w-full rounded-xl border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <AppIcon size={36} />
          <div className="text-[10px] font-bold text-slate-800 dark:text-white">Install ClassStatus?</div>
        </div>
        <div className="mt-3 flex justify-end">
          <span className="rounded-lg bg-blue-600 px-3 py-1.5 text-[10px] font-bold text-white ring-2 ring-blue-300">Install</span>
        </div>
      </div>
    </div>
  );
}

function OpenInSafariNotice() {
  return (
    <div className="mb-6 flex gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
      <ExternalLink className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <div>
        <p className="font-bold">Open in Safari</p>
        <p className="mt-1 text-sm leading-6">Open ClassStatus in Safari first to add it to your home screen.</p>
      </div>
    </div>
  );
}

export function InstallGuide() {
  const installState = useInstallState();
  const [guidePlatform, setGuidePlatform] = useState<GuidePlatform>("desktop");
  const [statusMessage, setStatusMessage] = useState("");
  const selectedByUser = useRef(false);

  useEffect(() => {
    if (installState.ready && !selectedByUser.current) {
      setGuidePlatform(platformToGuide(installState.platform));
    }
  }, [installState.platform, installState.ready]);

  const choosePlatform = (platform: GuidePlatform) => {
    selectedByUser.current = true;
    setGuidePlatform(platform);
  };

  const handleNativeInstall = async () => {
    setStatusMessage("");
    const outcome = await installState.requestInstall();
    if (outcome === "accepted") {
      setStatusMessage("Your browser accepted the request and is finishing the installation.");
    } else if (outcome === "dismissed") {
      setStatusMessage("Installation was dismissed. You can try again whenever you are ready.");
    } else {
      setStatusMessage("The browser install prompt is no longer available. Follow the visual steps below.");
    }
  };

  if (installState.ready && installState.installed) {
    return (
      <section className="mx-auto max-w-xl rounded-3xl border border-emerald-200 bg-emerald-50 p-6 text-center dark:border-emerald-900 dark:bg-emerald-950/40 sm:p-8">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600 text-white">
          <Check className="h-6 w-6" />
        </div>
        <h2 className="mt-4 text-xl font-black text-slate-950 dark:text-white">ClassStatus is installed</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">Open it from your home screen, Start menu, or app launcher for quick access.</p>
      </section>
    );
  }

  return (
    <section aria-labelledby="install-guide-heading">
      <div className="mb-7 flex flex-col items-start justify-between gap-4 border-b border-slate-200 pb-6 dark:border-slate-800 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400">Choose your device</p>
          <h2 id="install-guide-heading" className="mt-2 text-xl font-black text-slate-950 dark:text-white">Installation steps</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">We selected the most likely guide. You can switch if it does not match your browser.</p>
        </div>
        <div className="grid w-full grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-900 sm:w-auto" role="group" aria-label="Installation guide platform">
          {([
            ["ios", "iPhone / iPad", Smartphone],
            ["android", "Android", Smartphone],
            ["desktop", "Computer", MonitorDown],
          ] as const).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              onClick={() => choosePlatform(value)}
              aria-pressed={guidePlatform === value}
              className={`flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-2 text-[11px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${guidePlatform === value ? "bg-white text-blue-700 shadow-sm dark:bg-slate-800 dark:text-blue-300" : "text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white"}`}
            >
              <Icon className="hidden h-4 w-4 sm:block" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {installState.canPrompt && (
        <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/40 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-bold text-slate-950 dark:text-white">Your browser can install ClassStatus now.</p>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Use the native prompt, or follow the manual steps below.</p>
          </div>
          <button
            type="button"
            onClick={handleNativeInstall}
            disabled={installState.installing}
            className="flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70 dark:focus-visible:ring-offset-slate-950"
          >
            <Download className="h-4 w-4" />
            {installState.installing ? "Opening…" : "Install App"}
          </button>
        </div>
      )}

      {statusMessage && <p role="status" className="mb-6 rounded-xl bg-slate-100 px-4 py-3 text-sm font-medium text-slate-700 dark:bg-slate-900 dark:text-slate-200">{statusMessage}</p>}

      {guidePlatform === "ios" && (
        <div>
          {installState.platform === "ios-other" && <OpenInSafariNotice />}
          <ol className="space-y-3">
            <TutorialStep number={1} title="Tap the Share button" text="Tap the Share button at the bottom of Safari."><SafariShareVisual /></TutorialStep>
            <TutorialStep number={2} title="Choose Add to Home Screen" text={<>Scroll down and tap &lsquo;Add to Home Screen.&rsquo;</>}><AddToHomeVisual /></TutorialStep>
            <TutorialStep number={3} title="Tap Add" text={<>Tap &lsquo;Add&rsquo; in the top-right corner.</>}><ConfirmAddVisual /></TutorialStep>
            <TutorialStep number={4} title="You’re done" text="ClassStatus will now appear on your home screen like an app."><HomeScreenVisual /></TutorialStep>
          </ol>
        </div>
      )}

      {guidePlatform === "android" && (
        <ol className="space-y-3">
          <TutorialStep number={1} title="Open the Chrome menu" text="Tap the vertical three-dot menu in the browser toolbar."><BrowserMenuVisual /></TutorialStep>
          <TutorialStep number={2} title="Choose Install app" text={<>Tap &lsquo;Install app.&rsquo; Some Chrome versions may instead say &lsquo;Add to Home screen.&rsquo;</>}><InstallMenuVisual /></TutorialStep>
          <TutorialStep number={3} title="Confirm" text="Review the browser prompt, then tap Install."><InstallConfirmVisual /></TutorialStep>
          <TutorialStep number={4} title="Open from your home screen" text="Find the ClassStatus icon on your home screen or in your app launcher."><HomeScreenVisual android /></TutorialStep>
        </ol>
      )}

      {guidePlatform === "desktop" && (
        <ol className="space-y-3">
          <TutorialStep number={1} title="Find the install option" text="Look for an install icon in the address bar, or open your browser menu."><BrowserMenuVisual /></TutorialStep>
          <TutorialStep number={2} title="Choose Install ClassStatus" text="Select Install app or Add to Home screen. The wording depends on your browser."><InstallMenuVisual /></TutorialStep>
          <TutorialStep number={3} title="Confirm installation" text="Approve the browser confirmation. ClassStatus will open in its own app window."><InstallConfirmVisual /></TutorialStep>
          <TutorialStep number={4} title="Open it anytime" text="Launch ClassStatus from your desktop, Start menu, Dock, or app launcher."><div className="flex h-36 items-center justify-center"><div className="flex items-center gap-3 rounded-xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700"><AppIcon size={42} /><House className="h-5 w-5 text-blue-600" /></div></div></TutorialStep>
        </ol>
      )}
    </section>
  );
}
