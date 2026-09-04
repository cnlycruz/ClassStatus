"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, CheckSquare, LoaderCircle, Send, Square, X } from "lucide-react";
import { ALL_LGU_IDS, NCR_LGUS } from "@/data/lgus";
import type { LGUId } from "@/types";
import type { ManualBroadcastHistoryEntry } from "@/lib/notifications/types";

type Draft = { requestKey: string; title: string; message: string; recipientMode: "all" | "selected-lgus"; targetLguIds: LGUId[] };
const DRAFT_KEY = "classstatus-admin-custom-notification";
function nextKey() { return crypto.randomUUID(); }
function freshDraft(): Draft { return { requestKey: nextKey(), title: "", message: "", recipientMode: "all", targetLguIds: [] }; }

export function AdminCustomNotifications({ csrfToken, history, onSent }: { csrfToken: string; history: ManualBroadcastHistoryEntry[]; onSent: () => Promise<void> }) {
  const [draft, setDraft] = useState<Draft>(freshDraft); const [loaded, setLoaded] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [confirmation, setConfirmation] = useState<number | null>(null); const cancelRef = useRef<HTMLButtonElement>(null); const selected = useMemo(() => new Set(draft.targetLguIds), [draft.targetLguIds]);
  useEffect(() => { try { const stored = sessionStorage.getItem(DRAFT_KEY); if (stored) setDraft(JSON.parse(stored) as Draft); } catch { /* use blank draft */ } finally { setLoaded(true); } }, []);
  useEffect(() => { if (loaded) sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); }, [draft, loaded]);
  useEffect(() => { if (confirmation !== null) cancelRef.current?.focus(); const close = (event: KeyboardEvent) => { if (event.key === "Escape") setConfirmation(null); }; window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close); }, [confirmation]);
  const body = () => ({ ...draft, message: draft.message.trim(), title: draft.title.trim() || undefined });
  const request = async (url: string) => {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken }, body: JSON.stringify(body()) });
    const result = await response.json().catch(() => ({})); if (!response.ok) throw new Error(result.error || "Notification request was rejected."); return result;
  };
  async function prepare(event: React.FormEvent) {
    event.preventDefault(); setError("");
    if (!draft.message.trim()) { setError("Enter a notification message."); return; }
    if (draft.message.trim().length > 500) { setError("Messages may contain at most 500 characters."); return; }
    if (draft.recipientMode === "selected-lgus" && !draft.targetLguIds.length) { setError("Select at least one LGU."); return; }
    setBusy(true); try { const preview = await request("/api/admin/notifications/preview"); setConfirmation(preview.recipientCount); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not calculate recipients."); } finally { setBusy(false); }
  }
  async function send() {
    setBusy(true); setError("");
    try {
      const result = await request("/api/admin/notifications");
      setConfirmation(null); setDraft(freshDraft()); sessionStorage.removeItem(DRAFT_KEY); await onSent();
      setError(result.created ? `Notification queued for ${result.recipientCount} subscriber${result.recipientCount === 1 ? "" : "s"}.` : `Existing broadcast retained for ${result.recipientCount} subscriber${result.recipientCount === 1 ? "" : "s"}.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Notification could not be queued."); } finally { setBusy(false); }
  }
  const toggle = (id: LGUId) => setDraft((current) => ({ ...current, targetLguIds: current.targetLguIds.includes(id) ? current.targetLguIds.filter((item) => item !== id) : [...current.targetLguIds, id] }));
  return <section aria-labelledby="custom-notification-title" className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
    <div><h2 id="custom-notification-title" className="flex items-center gap-2 text-xl font-bold text-slate-950 dark:text-white"><Bell className="h-5 w-5 text-blue-600" />Custom Notification</h2><p className="mt-1 text-sm text-slate-500">Send an opt-in Web Push announcement using the existing delivery outbox.</p></div>
    {error && <p role="status" className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-100">{error}</p>}
    <form onSubmit={prepare} className="space-y-4">
      <div><label htmlFor="custom-notification-message" className="block text-sm font-bold text-slate-800 dark:text-slate-200">Message</label><textarea id="custom-notification-message" value={draft.message} onChange={(event) => setDraft((current) => ({ ...current, message: event.target.value }))} maxLength={500} rows={3} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white" aria-describedby="custom-notification-limit" /><p id="custom-notification-limit" className="mt-1 text-xs text-slate-500">{draft.message.length}/500 characters</p></div>
      <fieldset><legend className="text-sm font-bold text-slate-800 dark:text-slate-200">Recipients</legend><div className="mt-2 flex flex-wrap gap-4 text-sm"><label className="flex items-center gap-2"><input type="radio" checked={draft.recipientMode === "all"} onChange={() => setDraft((current) => ({ ...current, recipientMode: "all" }))} />All notification subscribers</label><label className="flex items-center gap-2"><input type="radio" checked={draft.recipientMode === "selected-lgus"} onChange={() => setDraft((current) => ({ ...current, recipientMode: "selected-lgus" }))} />Selected LGUs</label></div></fieldset>
      {draft.recipientMode === "selected-lgus" && <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800"><div className="mb-2 flex flex-wrap gap-2"><button type="button" onClick={() => setDraft((current) => ({ ...current, targetLguIds: [...ALL_LGU_IDS] }))} className="flex min-h-9 items-center gap-1 rounded-lg border border-slate-300 px-2.5 text-xs font-bold dark:border-slate-700"><CheckSquare className="h-3.5 w-3.5" />Select all LGUs</button><button type="button" onClick={() => setDraft((current) => ({ ...current, targetLguIds: [] }))} className="flex min-h-9 items-center gap-1 rounded-lg border border-slate-300 px-2.5 text-xs font-bold dark:border-slate-700"><Square className="h-3.5 w-3.5" />Clear</button></div><div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-6">{ALL_LGU_IDS.map((id) => <label key={id} className="flex min-h-8 items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300"><input type="checkbox" checked={selected.has(id)} onChange={() => toggle(id)} />{NCR_LGUS[id].name}</label>)}</div></div>}
      <button type="submit" disabled={busy} className="flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white disabled:opacity-60">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Send notification</button>
    </form>
    <div className="border-t border-slate-100 pt-3 dark:border-slate-800"><h3 className="text-sm font-bold text-slate-900 dark:text-white">Recent manual broadcasts</h3>{history.length === 0 ? <p className="mt-2 text-sm text-slate-500">No custom notifications sent.</p> : <div className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">{history.map((entry) => <article key={entry.id} className="py-2 text-xs"><p className="font-bold text-slate-900 dark:text-white">{entry.title}</p><p className="truncate text-slate-600 dark:text-slate-300">{entry.message}</p><p className="mt-1 text-slate-500">{new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" }).format(new Date(entry.createdAt))} · {entry.recipientMode === "all" ? "All subscribers" : `${entry.targetLguIds.length} selected LGU${entry.targetLguIds.length === 1 ? "" : "s"}`} · {entry.recipientCount} targeted · {entry.deliveredCount} delivered · {entry.pendingCount} pending/retrying</p></article>)}</div>}</div>
    {confirmation !== null && <div role="dialog" aria-modal="true" aria-labelledby="custom-notification-confirmation" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"><div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900"><div className="flex items-start justify-between gap-3"><h3 id="custom-notification-confirmation" className="text-lg font-bold text-slate-950 dark:text-white">Confirm notification</h3><button type="button" onClick={() => setConfirmation(null)} aria-label="Cancel notification"><X className="h-5 w-5" /></button></div><p className="mt-3 text-sm text-slate-600 dark:text-slate-300">Send this notification to {confirmation} active subscriber{confirmation === 1 ? "" : "s"}{draft.recipientMode === "all" ? " across all notification preferences" : " matching the selected LGUs"}?</p><div className="mt-5 flex justify-end gap-2"><button ref={cancelRef} type="button" onClick={() => setConfirmation(null)} disabled={busy} className="min-h-10 rounded-xl border border-slate-300 px-3 text-sm font-bold dark:border-slate-700">Cancel</button><button type="button" onClick={send} disabled={busy} className="min-h-10 rounded-xl bg-blue-600 px-3 text-sm font-bold text-white disabled:opacity-60">{busy ? "Sending…" : "Send notification"}</button></div></div></div>}
  </section>;
}
