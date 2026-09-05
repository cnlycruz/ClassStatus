"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Download, X } from "lucide-react";
import { useInstallState } from "@/components/InstallProvider";
import { shouldAutoShowInstallPrompt } from "@/lib/pwaInstall";

const AUTO_SHOW_DELAY_MS = 9_000;
const INTERACTION_SHOW_DELAY_MS = 1_200;
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function InstallPrompt() {
  const pathname = usePathname();
  const installState = useInstallState();
  const { dismissPrompt, requestInstall } = installState;
  const [delayElapsed, setDelayElapsed] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const attemptedRef = useRef(false);

  useEffect(() => {
    if (pathname !== "/") return;

    const delayTimer = window.setTimeout(() => setDelayElapsed(true), AUTO_SHOW_DELAY_MS);
    const markInteraction = () => setHasInteracted(true);
    window.addEventListener("pointerdown", markInteraction, { once: true, passive: true });
    window.addEventListener("keydown", markInteraction, { once: true });
    window.addEventListener("scroll", markInteraction, { once: true, passive: true });

    return () => {
      window.clearTimeout(delayTimer);
      window.removeEventListener("pointerdown", markInteraction);
      window.removeEventListener("keydown", markInteraction);
      window.removeEventListener("scroll", markInteraction);
    };
  }, [pathname]);

  useEffect(() => {
    if (pathname !== "/" || attemptedRef.current || (!delayElapsed && !hasInteracted)) return;
    if (!shouldAutoShowInstallPrompt({ state: installState, now: Date.now() })) return;

    const showTimer = window.setTimeout(
      () => {
        attemptedRef.current = true;
        if (document.querySelector('[aria-modal="true"]')) return;
        previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        setIsOpen(true);
      },
      hasInteracted && !delayElapsed ? INTERACTION_SHOW_DELAY_MS : 0,
    );

    return () => window.clearTimeout(showTimer);
  }, [delayElapsed, hasInteracted, installState, pathname]);

  const closeWithoutDismissal = useCallback(() => {
    setIsOpen(false);
    window.setTimeout(() => previousFocusRef.current?.focus(), 0);
  }, []);

  const dismiss = useCallback(() => {
    dismissPrompt();
    closeWithoutDismissal();
  }, [closeWithoutDismissal, dismissPrompt]);

  useEffect(() => {
    if (!isOpen) return;
    const dialog = dialogRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        dismiss();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;

      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (element) => element.offsetParent !== null,
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [dismiss, isOpen]);

  useEffect(() => {
    if (installState.installed && isOpen) closeWithoutDismissal();
  }, [closeWithoutDismissal, installState.installed, isOpen]);

  const handleNativeInstall = async () => {
    setStatusMessage("");
    const outcome = await requestInstall();
    if (outcome === "dismissed") {
      setStatusMessage("Installation was not started. You can try again later from the menu.");
      window.setTimeout(closeWithoutDismissal, 900);
    } else if (outcome === "accepted") {
      setStatusMessage("Your browser is finishing the installation.");
    } else {
      setStatusMessage("The browser prompt is no longer available. Open the visual guide instead.");
    }
  };

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="install-prompt-backdrop fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/55 p-0 sm:items-center sm:p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) dismiss();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-prompt-title"
        aria-describedby="install-prompt-description"
        className="install-prompt-panel w-full max-w-md rounded-t-3xl border border-slate-200 bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:rounded-3xl sm:p-6"
      >
        <div className="flex items-start gap-4">
          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-2xl ring-1 ring-slate-200 dark:ring-slate-700">
            <Image src="/icons/class-status-icon-192.png" alt="" fill sizes="56px" className="object-cover" />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <h2 id="install-prompt-title" className="text-xl font-black tracking-tight text-slate-950 dark:text-white">
              Install ClassStatus
            </h2>
            <p id="install-prompt-description" className="mt-1.5 text-sm leading-6 text-slate-600 dark:text-slate-300">
              Add ClassStatus to your home screen so suspension updates are always one tap away.
            </p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Close install prompt"
            className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {statusMessage && <p role="status" className="mt-4 rounded-xl bg-blue-50 px-3 py-2.5 text-xs font-medium text-blue-800 dark:bg-blue-950/60 dark:text-blue-200">{statusMessage}</p>}

        <div className="mt-5 grid gap-2.5 sm:grid-cols-[1fr_auto]">
          {installState.canPrompt ? (
            <button
              type="button"
              onClick={handleNativeInstall}
              disabled={installState.installing}
              className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70 dark:focus-visible:ring-offset-slate-900"
            >
              <Download className="h-4 w-4" />
              {installState.installing ? "Opening…" : "Install App"}
            </button>
          ) : (
            <Link
              href="/install"
              prefetch={false}
              onClick={closeWithoutDismissal}
              className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
            >
              Show Me How
            </Link>
          )}
          <button
            type="button"
            onClick={dismiss}
            className="min-h-11 rounded-xl px-5 py-3 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Not Now
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
