"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, BellOff, CheckSquare, LoaderCircle, Square, X } from "lucide-react";
import { ALL_LGU_IDS, NCR_LGUS } from "@/data/lgus";
import type { LGUId } from "@/types";
import { allAlertLocations, shouldAutoOpenAlertSetup, SUSPENSION_ALERTS_DISMISS_KEY } from "@/lib/notifications/ux";

const SUBSCRIPTION_KEY = "classstatus-push-subscription-id";

function urlBase64ToArrayBuffer(value: string): ArrayBuffer {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = window.atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function isPushCapable() { return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && window.isSecureContext; }
function isAppleMobileBrowser() { return /iPad|iPhone|iPod/.test(navigator.userAgent); }

export function SuspensionAlerts({ selectedLguId }: { selectedLguId?: LGUId | null }) {
  const [ready, setReady] = useState(false);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [selected, setSelected] = useState<LGUId[]>(selectedLguId ? [selectedLguId] : []);
  const [enabled, setEnabled] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("unsupported");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const autoOpened = useRef(false);
  const wasOpen = useRef(false);
  const autoDismissed = useRef(false);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  useEffect(() => {
    const capable = isPushCapable();
    setSupported(capable);
    autoDismissed.current = window.localStorage.getItem(SUSPENSION_ALERTS_DISMISS_KEY) === "1";
    if (!capable) { setReady(true); return; }
    setPermission(Notification.permission);
    void Promise.all([
      fetch("/api/alerts/config", { cache: "no-store" }).then(async (response) => response.ok ? response.json() : null),
      navigator.serviceWorker.getRegistration().then(async (registration) => Boolean(await registration?.pushManager.getSubscription())),
    ]).then(([config, subscription]) => {
      const value = config as { enabled?: boolean; publicKey?: string } | null;
      setPublicKey(value?.enabled && value.publicKey ? value.publicKey : null);
      setEnabled(subscription);
    }).catch(() => { setPublicKey(null); setEnabled(false); }).finally(() => setReady(true));
  }, []);

  useEffect(() => { if (selectedLguId && !selected.length) setSelected([selectedLguId]); }, [selectedLguId, selected.length]);
  useEffect(() => {
    if (!shouldAutoOpenAlertSetup({ ready, supported, configured: Boolean(publicKey), enabled, permission, dismissed: autoDismissed.current, openedThisVisit: autoOpened.current })) return;
    autoOpened.current = true;
    setOpen(true);
  }, [enabled, permission, publicKey, ready, supported]);
  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      requestAnimationFrame(() => dialogRef.current?.focus());
      const close = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
      window.addEventListener("keydown", close);
      return () => window.removeEventListener("keydown", close);
    }
    if (wasOpen.current) buttonRef.current?.focus();
  }, [open]);

  const toggleLgu = (id: LGUId) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const requestHeaders = { "Content-Type": "application/json" };
  async function upsertSubscription() {
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      if (!publicKey) throw new Error("alerts-not-configured");
      subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToArrayBuffer(publicKey) });
    }
    const response = await fetch("/api/alerts/subscribe", { method: "POST", headers: requestHeaders, body: JSON.stringify({ subscription: subscription.toJSON(), lguIds: selected }) });
    if (!response.ok) throw new Error("subscription-save-failed");
    const result = await response.json() as { subscriptionId: string };
    window.localStorage.setItem(SUBSCRIPTION_KEY, result.subscriptionId);
  }
  async function enable() {
    if (!publicKey || !selected.length || permission === "denied") return;
    setBusy(true); setMessage("");
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== "granted") { setMessage(result === "denied" ? "Notifications are blocked in your browser. Allow notifications in browser settings to enable suspension alerts." : "Notification permission was not granted."); return; }
      await upsertSubscription(); setEnabled(true); setMessage("Suspension alerts are enabled.");
    } catch { setMessage("Alerts could not be enabled right now. Please try again."); }
    finally { setBusy(false); }
  }
  async function savePreferences() {
    if (!selected.length) return;
    setBusy(true); setMessage("");
    try {
      const subscriptionId = window.localStorage.getItem(SUBSCRIPTION_KEY);
      if (!subscriptionId) await upsertSubscription();
      else {
        const response = await fetch("/api/alerts/preferences", { method: "PATCH", headers: requestHeaders, body: JSON.stringify({ subscriptionId, lguIds: selected }) });
        if (!response.ok) throw new Error("preferences-save-failed");
      }
      setEnabled(true); setMessage("Alert locations updated.");
    } catch { setMessage("Locations could not be updated right now."); }
    finally { setBusy(false); }
  }
  async function disable() {
    const subscriptionId = window.localStorage.getItem(SUBSCRIPTION_KEY);
    if (!subscriptionId) { setMessage("Alerts could not be safely disabled on this device. Please keep this browser data available and try again."); return; }
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/alerts/preferences", { method: "DELETE", headers: requestHeaders, body: JSON.stringify({ subscriptionId }) });
      if (!response.ok) throw new Error("deactivate-failed");
      const registration = await navigator.serviceWorker.ready;
      await (await registration.pushManager.getSubscription())?.unsubscribe();
      window.localStorage.removeItem(SUBSCRIPTION_KEY); setEnabled(false); setMessage("Suspension alerts are disabled.");
    } catch { setMessage("Alerts could not be disabled right now. Please try again."); }
    finally { setBusy(false); }
  }
  function closeAndSuppress() { window.localStorage.setItem(SUSPENSION_ALERTS_DISMISS_KEY, "1"); autoDismissed.current = true; setOpen(false); }

  const iconLabel = enabled ? "Suspension alerts enabled. Manage suspension alerts" : "Suspension alerts disabled. Manage suspension alerts";
  const unavailable = supported === false ? (isAppleMobileBrowser() ? "Suspension alerts require a supported browser. On iPhone or iPad, add Class Status to your Home Screen and open it there before enabling notifications." : "Suspension alerts are unavailable in this browser or on this connection.") : !publicKey ? "Suspension alerts are not configured on this deployment yet." : "";
  return <>
    <button ref={buttonRef} type="button" onClick={() => setOpen(true)} aria-label={iconLabel} title="Manage suspension alerts" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800">{enabled ? <Bell className="h-4 w-4" aria-hidden="true" /> : <BellOff className="h-4 w-4" aria-hidden="true" />}</button>
    {open && <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-3 sm:items-center sm:p-4"><div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="suspension-alerts-title" className="max-h-[min(44rem,calc(100dvh-1.5rem))] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl outline-none dark:bg-slate-900 sm:p-5">
      <div className="flex items-start justify-between gap-3"><div><h2 id="suspension-alerts-title" className="flex items-center gap-2 text-lg font-bold text-slate-950 dark:text-white">{enabled ? <Bell className="h-5 w-5 text-blue-600" aria-hidden="true" /> : <BellOff className="h-5 w-5 text-slate-500" aria-hidden="true" />}Suspension alerts</h2><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Get notified when a verified class suspension is published for the places you care about.</p></div><button type="button" onClick={() => setOpen(false)} aria-label="Close suspension alert settings" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-slate-800"><X className="h-5 w-5" /></button></div>
      {!ready ? <p className="mt-5 text-sm text-slate-500">Checking notification support…</p> : unavailable ? <p className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">{unavailable}</p> : permission === "denied" ? <><p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">Notifications are blocked in your browser. Allow notifications in your browser settings to enable suspension alerts.</p><button type="button" onClick={closeAndSuppress} className="mt-5 min-h-10 rounded-xl px-3 text-sm font-semibold text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-slate-300 dark:hover:bg-slate-800">Don&apos;t show again</button></> : <>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-bold text-slate-900 dark:text-white">Select locations</h3><div className="flex gap-2"><button type="button" onClick={() => setSelected(allAlertLocations())} className="flex min-h-9 items-center gap-1 rounded-lg border border-slate-300 px-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"><CheckSquare className="h-3.5 w-3.5" />Select all</button><button type="button" onClick={() => setSelected([])} className="flex min-h-9 items-center gap-1 rounded-lg border border-slate-300 px-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"><Square className="h-3.5 w-3.5" />Clear</button></div></div>
        <fieldset className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3"><legend className="sr-only">NCR locations for suspension alerts</legend>{ALL_LGU_IDS.map((id) => <label key={id} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-2 text-xs text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"><input type="checkbox" checked={selectedSet.has(id)} onChange={() => toggleLgu(id)} className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />{NCR_LGUS[id].name}</label>)}</fieldset>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between"><button type="button" onClick={closeAndSuppress} className="min-h-10 rounded-xl px-3 text-sm font-semibold text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-slate-300 dark:hover:bg-slate-800">Don&apos;t show again</button>{enabled ? <div className="flex flex-col gap-2 sm:flex-row"><button type="button" onClick={disable} disabled={busy} className="min-h-10 rounded-xl border border-slate-300 px-3 text-sm font-bold text-slate-700 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200">Disable alerts</button><button type="button" onClick={savePreferences} disabled={busy || !selected.length} className="min-h-10 rounded-xl bg-blue-600 px-3 text-sm font-bold text-white disabled:opacity-60">{busy ? <LoaderCircle className="inline h-4 w-4 animate-spin" /> : "Save changes"}</button></div> : <button type="button" onClick={enable} disabled={busy || !selected.length} className="min-h-10 rounded-xl bg-blue-600 px-3 text-sm font-bold text-white disabled:opacity-60">{busy ? <LoaderCircle className="inline h-4 w-4 animate-spin" /> : "Enable alerts"}</button>}</div>
      </>}
      {message && <p role="status" className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:bg-slate-950 dark:text-slate-300">{message}</p>}
    </div></div>}
  </>;
}
