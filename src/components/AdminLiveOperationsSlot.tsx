"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient, type RealtimeChannel } from "@supabase/supabase-js";
import {
  Activity,
  BellRing,
  CircleDot,
  Eye,
  Pause,
  Play,
  Radio,
  RefreshCw,
  Send,
  Users,
} from "lucide-react";
import { groupCollectorLogs } from "@/collector/logRuns";
import { NCR_LGUS } from "@/data/lgus";
import type { ClassStatusRealtimeConfig, PublicAnnouncement, PublicTrafficMetrics } from "@/lib/realtime/types";
import type { CollectorLog } from "@/types";

type LiveBootstrap = {
  session: { csrfToken: string };
  traffic: PublicTrafficMetrics;
  announcements: PublicAnnouncement[];
};

type LogFilter = "all" | CollectorLog["level"];
type StreamState = "connecting" | "live" | "reconnecting";

const MANILA_TIME = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function formatLogTime(timestamp: string): string {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? timestamp : MANILA_TIME.format(date);
}

function formatRecentTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function mergeLogs(current: CollectorLog[], incoming: CollectorLog[]): CollectorLog[] {
  const map = new Map<string, CollectorLog>();
  for (const log of [...incoming, ...current]) map.set(log.id, log);
  return Array.from(map.values())
    .sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp))
    .slice(0, 200);
}

export function AdminLiveOperationsSlot() {
  const pathname = usePathname();
  const router = useRouter();
  const [bootstrap, setBootstrap] = useState<LiveBootstrap | null>(null);
  const [logs, setLogs] = useState<CollectorLog[]>([]);
  const [streamState, setStreamState] = useState<StreamState>("connecting");
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const pausedBuffer = useRef<CollectorLog[]>([]);
  const [pausedCount, setPausedCount] = useState(0);
  const [autoScroll, setAutoScroll] = useState(true);
  const [logFilter, setLogFilter] = useState<LogFilter>("all");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const logViewport = useRef<HTMLDivElement>(null);
  const [activeNow, setActiveNow] = useState(0);
  const [mostViewed, setMostViewed] = useState<Array<{ id: string; count: number }>>([]);
  const [presenceConnected, setPresenceConnected] = useState(false);
  const [announcementMessage, setAnnouncementMessage] = useState("");
  const [announcementBusy, setAnnouncementBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const loadBootstrap = useCallback(async () => {
    const response = await fetch("/api/admin/live", { cache: "no-store" });
    if (response.status === 401) {
      router.replace("/collector/login");
      return;
    }
    if (!response.ok) throw new Error("Live operations data is unavailable.");
    setBootstrap(await response.json() as LiveBootstrap);
  }, [router]);

  useEffect(() => {
    if (pathname !== "/collector") return;
    void loadBootstrap().catch((reason) => setError(reason instanceof Error ? reason.message : "Live operations unavailable."));
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadBootstrap().catch(() => undefined);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [loadBootstrap, pathname]);

  useEffect(() => {
    if (pathname !== "/collector") return;
    const source = new EventSource("/api/admin/live/logs");
    const receive = (event: MessageEvent<string>) => {
      let incoming: CollectorLog[] = [];
      try { incoming = JSON.parse(event.data) as CollectorLog[]; } catch { return; }
      if (pausedRef.current) {
        pausedBuffer.current = mergeLogs(pausedBuffer.current, incoming);
        setPausedCount(pausedBuffer.current.length);
      } else {
        setLogs((current) => mergeLogs(current, incoming));
      }
    };
    source.onopen = () => setStreamState("live");
    source.onerror = () => setStreamState("reconnecting");
    source.addEventListener("snapshot", receive as EventListener);
    source.addEventListener("logs", receive as EventListener);
    return () => source.close();
  }, [pathname]);

  useEffect(() => {
    if (pathname !== "/collector") return;
    let client: ReturnType<typeof createClient> | null = null;
    let channel: RealtimeChannel | null = null;
    let cancelled = false;

    const syncPresence = () => {
      if (!channel) return;
      const state = channel.presenceState<Record<string, unknown>>();
      const keys = Object.keys(state);
      setActiveNow(keys.length);
      const counts = new Map<string, number>();
      for (const key of keys) {
        const entries = state[key] || [];
        const latest = [...entries].reverse().find((entry) => typeof entry.lguId === "string" && entry.lguId);
        const lguId = typeof latest?.lguId === "string" ? latest.lguId : null;
        if (lguId && lguId in NCR_LGUS) counts.set(lguId, (counts.get(lguId) || 0) + 1);
      }
      setMostViewed(Array.from(counts, ([id, count]) => ({ id, count })).sort((a, b) => b.count - a.count).slice(0, 5));
    };

    const start = async () => {
      const response = await fetch("/api/realtime/config", { cache: "no-store" });
      if (!response.ok || cancelled) return;
      const config = await response.json() as ClassStatusRealtimeConfig;
      client = createClient(config.url, config.publishableKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      channel = client.channel(`classstatus:${config.namespace}:public`);
      channel
        .on("presence", { event: "sync" }, syncPresence)
        .on("presence", { event: "join" }, syncPresence)
        .on("presence", { event: "leave" }, syncPresence)
        .subscribe((status) => {
          setPresenceConnected(status === "SUBSCRIBED");
          if (status === "SUBSCRIBED") syncPresence();
        });
    };

    void start().catch(() => setPresenceConnected(false));
    return () => {
      cancelled = true;
      if (client && channel) void client.removeChannel(channel);
    };
  }, [pathname]);

  useEffect(() => {
    pausedRef.current = paused;
    if (!paused && pausedBuffer.current.length > 0) {
      const buffered = pausedBuffer.current;
      pausedBuffer.current = [];
      setPausedCount(0);
      setLogs((current) => mergeLogs(current, buffered));
    }
  }, [paused]);

  const runs = useMemo(() => groupCollectorLogs(logs), [logs]);
  const selectedRun = runs.find((run) => run.id === selectedRunId) || runs[0];
  const displayedLogs = useMemo(() => {
    const source = selectedRun?.logs || [];
    return source
      .filter((log) => logFilter === "all" || log.level === logFilter)
      .slice()
      .sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp));
  }, [logFilter, selectedRun]);

  useEffect(() => {
    if (!autoScroll || paused || !logViewport.current) return;
    logViewport.current.scrollTo({ top: logViewport.current.scrollHeight, behavior: "smooth" });
  }, [autoScroll, displayedLogs.length, paused]);

  const latestRun = runs[0];
  const latestLog = logs[0];
  const healthySourceCount = latestRun
    ? new Set(latestRun.logs.filter((log) => log.level === "success" && log.sourceId !== "engine").map((log) => log.sourceId)).size
    : 0;
  const failedSourceCount = latestRun
    ? new Set(latestRun.logs.filter((log) => log.level === "error" && log.sourceId !== "engine").map((log) => log.sourceId)).size
    : 0;

  async function announce(event: FormEvent) {
    event.preventDefault();
    if (!bootstrap || !announcementMessage.trim()) return;
    setAnnouncementBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/announcements", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": bootstrap.session.csrfToken,
        },
        body: JSON.stringify({ message: announcementMessage.trim() }),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401) {
        router.replace("/collector/login");
        return;
      }
      if (!response.ok) throw new Error(payload.error || "Announcement was rejected.");
      const created = payload.announcement as PublicAnnouncement;
      setBootstrap((current) => current ? {
        ...current,
        announcements: [created, ...current.announcements].slice(0, 50),
      } : current);
      setAnnouncementMessage("");
      setNotice(`Announcement sent to approximately ${activeNow} active visitor${activeNow === 1 ? "" : "s"}.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Announcement failed.");
    } finally {
      setAnnouncementBusy(false);
    }
  }

  if (pathname !== "/collector") return null;

  return (
    <section className="mx-auto w-full max-w-7xl space-y-5 px-4 pb-10 sm:px-6 lg:px-8" aria-labelledby="live-ops-title">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 id="live-ops-title" className="text-2xl font-extrabold tracking-tight text-slate-950 dark:text-white">Live Operations</h2>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-black uppercase ${streamState === "live" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"}`}>
              <span className={`h-2 w-2 rounded-full ${streamState === "live" ? "bg-emerald-500" : "bg-amber-500 animate-pulse"}`} />
              {streamState === "live" ? "Live" : "Reconnecting"}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">Realtime traffic, collector events, and short public announcements.</p>
        </div>
        <button onClick={() => void loadBootstrap().catch((reason) => setError(reason.message))} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 text-sm font-bold dark:border-slate-700">
          <RefreshCw className="h-4 w-4" /> Refresh metrics
        </button>
      </div>

      {(notice || error) && <div className={`rounded-xl border px-4 py-3 text-sm ${error ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200" : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"}`}>{error || notice}</div>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard icon={<Users />} label="Active now" value={`${activeNow}`} detail={presenceConnected ? "Anonymous realtime presence" : "Presence reconnecting"} />
        <MetricCard icon={<Eye />} label="Total visits" value={bootstrap ? bootstrap.traffic.totalVisits.toLocaleString() : "—"} detail="30-minute browsing sessions" />
        <MetricCard icon={<Activity />} label="Today" value={bootstrap ? bootstrap.traffic.todayVisits.toLocaleString() : "—"} detail={bootstrap ? `${bootstrap.traffic.last15Minutes.toLocaleString()} in the last 15 minutes` : "Loading traffic"} />
        <MetricCard icon={<Radio />} label="Collector" value={latestRun && !latestRun.completedAt ? "RUNNING" : latestRun ? "IDLE" : "WAITING"} detail={`${healthySourceCount} healthy · ${failedSourceCount} failed`} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 text-slate-100 shadow-xl">
          <div className="flex flex-col gap-3 border-b border-slate-800 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-bold">LIVE COLLECTOR</span>
              {paused && <span className="rounded-full bg-amber-950 px-2 py-1 text-[10px] font-black uppercase text-amber-300">Paused {pausedCount ? `· ${pausedCount} buffered` : ""}</span>}
              {latestLog && <span className="text-[10px] text-slate-500">latest {formatLogTime(latestLog.timestamp)}</span>}
            </div>
            <div className="flex flex-wrap gap-2 text-[11px]">
              <button onClick={() => setPaused((value) => !value)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 font-bold hover:bg-slate-900">
                {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}{paused ? "Resume" : "Pause"}
              </button>
              <button onClick={() => setAutoScroll((value) => !value)} className={`min-h-9 rounded-lg border px-2.5 font-bold ${autoScroll ? "border-emerald-800 bg-emerald-950 text-emerald-300" : "border-slate-700"}`}>Auto-scroll {autoScroll ? "ON" : "OFF"}</button>
            </div>
          </div>

          <div className="flex flex-col gap-2 border-b border-slate-800 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-1.5">
              {(["all", "info", "success", "warn", "error"] as LogFilter[]).map((level) => <button key={level} onClick={() => setLogFilter(level)} className={`rounded-md border px-2 py-1 text-[10px] font-black uppercase ${logFilter === level ? "border-blue-600 bg-blue-950 text-blue-300" : "border-slate-800 text-slate-400"}`}>{level}</button>)}
            </div>
            {runs.length > 0 && <select value={selectedRun?.id || ""} onChange={(event) => setSelectedRunId(event.target.value)} className="max-w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 font-mono text-[10px] text-slate-200">
              {runs.map((run, index) => <option key={run.id} value={run.id}>{index === 0 ? "Latest" : "Run"} · {run.id}</option>)}
            </select>}
          </div>

          <div ref={logViewport} className="max-h-[440px] min-h-64 overflow-auto p-4 font-mono text-xs">
            {!selectedRun ? <div className="flex min-h-56 items-center justify-center text-slate-500">Waiting for collector logs…</div> : <div className="space-y-2">
              <div className="mb-3 rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-[10px] text-slate-400">runId: <span className="text-slate-200">{selectedRun.id}</span></div>
              {displayedLogs.map((log) => <div key={log.id} className="grid grid-cols-[64px_58px_minmax(0,1fr)] gap-2 leading-relaxed">
                <span className="text-slate-500">{formatLogTime(log.timestamp)}</span>
                <span className={`h-fit rounded border px-1 text-center text-[9px] font-black uppercase ${log.level === "success" ? "border-emerald-800 text-emerald-400" : log.level === "error" ? "border-red-800 text-red-400" : log.level === "warn" ? "border-amber-800 text-amber-400" : "border-blue-800 text-blue-400"}`}>{log.level}</span>
                <span className="break-words text-slate-300"><strong className="text-slate-100">[{log.sourceName}]</strong> {log.message}</span>
              </div>)}
              {displayedLogs.length === 0 && <p className="py-10 text-center text-slate-500">No logs match this filter.</p>}
            </div>}
          </div>
        </div>

        <div className="space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2"><CircleDot className="h-4 w-4 text-emerald-500" /><h3 className="font-bold text-slate-950 dark:text-white">Most checked right now</h3></div>
            <div className="mt-4 space-y-2">
              {mostViewed.length === 0 ? <p className="text-sm text-slate-500">No LGU detail views are active yet.</p> : mostViewed.map((item, index) => <div key={item.id} className="flex items-center justify-between text-sm"><span>{index + 1}. {NCR_LGUS[item.id as keyof typeof NCR_LGUS]?.name || item.id}</span><strong>{item.count}</strong></div>)}
            </div>
          </div>

          <form onSubmit={announce} className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2"><BellRing className="h-4 w-4 text-blue-500" /><h3 className="font-bold text-slate-950 dark:text-white">Announcement</h3></div>
            <p className="mt-1 text-xs text-slate-500">Appears to connected public visitors for exactly 10 seconds.</p>
            <textarea value={announcementMessage} onChange={(event) => setAnnouncementMessage(event.target.value)} maxLength={120} rows={3} placeholder="Type a short site announcement…" className="mt-4 w-full rounded-xl border border-slate-300 bg-transparent px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700" />
            <div className="mt-2 flex items-center justify-between gap-3"><span className="text-xs text-slate-500">{announcementMessage.length}/120</span><button disabled={announcementBusy || !announcementMessage.trim()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white disabled:opacity-50"><Send className="h-4 w-4" />{announcementBusy ? "Sending…" : "Announce"}</button></div>
          </form>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800"><h3 className="font-bold text-slate-950 dark:text-white">Recent announcements</h3><p className="mt-1 text-xs text-slate-500">Latest 50 retained in the admin view.</p></div>
        {!bootstrap || bootstrap.announcements.length === 0 ? <p className="px-5 py-8 text-center text-sm text-slate-500">No announcements sent yet.</p> : bootstrap.announcements.map((item) => <div key={item.id} className="flex flex-col gap-1 border-b border-slate-100 px-5 py-3 text-sm last:border-0 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between"><span className="font-medium text-slate-800 dark:text-slate-200">{item.message}</span><span className="shrink-0 text-xs text-slate-500">{formatRecentTimestamp(item.createdAt)}</span></div>)}
      </div>
    </section>
  );
}

function MetricCard({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><div className="flex items-center justify-between text-sm font-semibold text-slate-500"><span>{label}</span><span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span></div><div className="mt-2 text-2xl font-black text-slate-950 dark:text-white">{value}</div><p className="mt-1 text-xs text-slate-500">{detail}</p></div>;
}
