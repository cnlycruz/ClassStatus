"use client";

import { useEffect, useMemo, useState } from "react";
import { Bell, BellOff, LoaderCircle } from "lucide-react";
import { ALL_LGU_IDS, NCR_LGUS } from "@/data/lgus";
import type { LGUId } from "@/types";

const STORAGE_KEY = "classstatus-push-subscription-id";

function urlBase64ToArrayBuffer(value: string): ArrayBuffer {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = window.atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export function SuspensionAlerts({ selectedLguId }: { selectedLguId: LGUId | null }) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [selected, setSelected] = useState<LGUId[]>(selectedLguId ? [selectedLguId] : []);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  useEffect(() => {
    const capable = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && window.isSecureContext;
    setSupported(capable);
    if (!capable) return;
    void fetch("/api/alerts/config", { cache: "no-store" }).then(async (response) => response.ok ? response.json() : null).then((config: { enabled?: boolean; publicKey?: string } | null) => setPublicKey(config?.enabled && config.publicKey ? config.publicKey : null)).catch(() => setPublicKey(null));
    void navigator.serviceWorker.ready.then(async (registration) => setEnabled(Boolean(await registration.pushManager.getSubscription()))).catch(() => setEnabled(false));
  }, []);

  useEffect(() => {
    if (!selectedLguId || selected.length) return;
    setSelected([selectedLguId]);
  }, [selectedLguId, selected.length]);

  const toggleLgu = (id: LGUId) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);

  async function enable() {
    if (!publicKey || !selected.length) return;
    setBusy(true); setMessage("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") { setMessage(permission === "denied" ? "Notifications are blocked in this browser." : "Notification permission was not granted."); return; }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToArrayBuffer(publicKey) });
      const response = await fetch("/api/alerts/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscription: subscription.toJSON(), lguIds: selected }) });
      if (!response.ok) throw new Error();
      const result = await response.json() as { subscriptionId: string };
      window.localStorage.setItem(STORAGE_KEY, result.subscriptionId);
      setEnabled(true); setMessage("Suspension alerts are enabled.");
    } catch { setMessage("Alerts could not be enabled right now. Please try again."); }
    finally { setBusy(false); }
  }

  async function savePreferences() {
    const subscriptionId = window.localStorage.getItem(STORAGE_KEY);
    if (!subscriptionId || !selected.length) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/alerts/preferences", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscriptionId, lguIds: selected }) });
      if (!response.ok) throw new Error();
      setMessage("Alert locations updated.");
    } catch { setMessage("Locations could not be updated right now."); }
    finally { setBusy(false); }
  }

  async function disable() {
    setBusy(true); setMessage("");
    try {
      const registration = await navigator.serviceWorker.ready;
      await (await registration.pushManager.getSubscription())?.unsubscribe();
      const subscriptionId = window.localStorage.getItem(STORAGE_KEY);
      if (subscriptionId) await fetch("/api/alerts/preferences", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscriptionId }) });
      window.localStorage.removeItem(STORAGE_KEY); setEnabled(false); setMessage("Suspension alerts are disabled.");
    } catch { setMessage("Alerts could not be disabled right now."); }
    finally { setBusy(false); }
  }

  if (supported === false) return <p className="px-1 text-xs text-slate-500 dark:text-slate-400">Suspension alerts are unavailable in this browser or insecure connection.</p>;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900" aria-label="Suspension alerts">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5"><Bell className="h-4 w-4 text-blue-500" /><div><h2 className="text-sm font-bold text-slate-900 dark:text-white">Suspension alerts</h2><p className="text-xs text-slate-500 dark:text-slate-400">Choose NCR locations. Alerts are opt-in and only follow published advisories.</p></div></div>
        {enabled ? <button type="button" onClick={disable} disabled={busy} className="flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200"><BellOff className="h-3.5 w-3.5" />Disable</button> : <button type="button" onClick={enable} disabled={busy || !publicKey || !selected.length} className="flex min-h-10 items-center gap-1.5 rounded-xl bg-blue-600 px-3 text-xs font-bold text-white disabled:opacity-50">{busy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Bell className="h-3.5 w-3.5" />}Enable suspension alerts</button>}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-6">
        {ALL_LGU_IDS.map((id) => <label key={id} className="flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg px-1.5 text-[11px] text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"><input type="checkbox" checked={selectedSet.has(id)} onChange={() => toggleLgu(id)} className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600" />{NCR_LGUS[id].name}</label>)}
      </div>
      {enabled && <button type="button" onClick={savePreferences} disabled={busy || !selected.length} className="mt-3 min-h-9 rounded-lg border border-blue-200 px-3 text-xs font-semibold text-blue-700 disabled:opacity-50 dark:border-blue-900 dark:text-blue-300">Save locations</button>}
      {!publicKey && supported && <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">Alerts are not configured on this deployment yet.</p>}
      {message && <p role="status" className="mt-2 text-xs text-slate-600 dark:text-slate-300">{message}</p>}
    </section>
  );
}
