"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Pause, Play } from "lucide-react";
import { formatCollectorTimestamp, groupCollectorLogs } from "@/collector/logRuns";
import type { CollectorLog } from "@/types";

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

function mergeLogs(current: CollectorLog[], incoming: CollectorLog[]): CollectorLog[] {
  const byId = new Map<string, CollectorLog>();
  for (const log of [...incoming, ...current]) byId.set(log.id, log);
  return Array.from(byId.values())
    .sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp))
    .slice(0, 200);
}

export function CollectorLiveConsoleSlot() {
  const [portalHost, setPortalHost] = useState<HTMLDivElement | null>(null);
  const [logs, setLogs] = useState<CollectorLog[]>([]);
  const [streamState, setStreamState] = useState<StreamState>("connecting");
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const pausedBuffer = useRef<CollectorLog[]>([]);
  const [pausedCount, setPausedCount] = useState(0);
  const [autoScroll, setAutoScroll] = useState(true);
  const [filter, setFilter] = useState<LogFilter>("all");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const viewport = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const title = document.getElementById("diagnostics-title");
    const section = title?.closest("section");
    if (!section) return;

    const directChildren = Array.from(section.children) as HTMLElement[];
    const legacyConsole = directChildren[1] || null;
    const host = document.createElement("div");
    host.dataset.classstatusLiveDiagnostics = "true";

    if (legacyConsole) {
      legacyConsole.style.display = "none";
      section.insertBefore(host, legacyConsole);
    } else {
      section.appendChild(host);
    }
    setPortalHost(host);

    return () => {
      setPortalHost(null);
      if (legacyConsole) legacyConsole.style.display = "";
      host.remove();
    };
  }, []);

  useEffect(() => {
    const source = new EventSource("/api/admin/live/logs");

    const receive = (event: MessageEvent<string>) => {
      let incoming: CollectorLog[];
      try {
        incoming = JSON.parse(event.data) as CollectorLog[];
      } catch {
        return;
      }

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
    source.addEventListener("heartbeat", () => setStreamState("live"));
    source.addEventListener("stream-error", () => setStreamState("reconnecting"));

    return () => source.close();
  }, []);

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
    return (selectedRun?.logs || [])
      .filter((log) => filter === "all" || log.level === filter)
      .slice()
      .sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp));
  }, [filter, selectedRun]);

  useEffect(() => {
    if (!autoScroll || paused || !viewport.current) return;
    viewport.current.scrollTo({ top: viewport.current.scrollHeight, behavior: "smooth" });
  }, [autoScroll, displayedLogs.length, paused, selectedRun?.id]);

  if (!portalHost) return null;

  return createPortal(
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 font-mono text-xs text-slate-100 shadow-xl">
      <div className="flex flex-col gap-3 border-b border-slate-800 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-black uppercase ${streamState === "live" ? "bg-emerald-950 text-emerald-300" : "bg-amber-950 text-amber-300"}`}>
            <span className={`h-2 w-2 rounded-full ${streamState === "live" ? "bg-emerald-500" : "bg-amber-500 animate-pulse"}`} />
            {streamState === "live" ? "Live" : "Reconnecting"}
          </span>
          {paused && <span className="rounded-full bg-amber-950 px-2 py-1 text-[10px] font-black uppercase text-amber-300">Paused{pausedCount ? ` · ${pausedCount} buffered` : ""}</span>}
          <span className="text-[10px] text-slate-500">Latest lines appear as the collector writes them.</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setPaused((value) => !value)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 text-[11px] font-bold hover:bg-slate-900">
            {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            {paused ? "Resume" : "Pause"}
          </button>
          <button type="button" onClick={() => setAutoScroll((value) => !value)} className={`min-h-9 rounded-lg border px-2.5 text-[11px] font-bold ${autoScroll ? "border-emerald-800 bg-emerald-950 text-emerald-300" : "border-slate-700"}`}>
            Auto-scroll {autoScroll ? "ON" : "OFF"}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2 border-b border-slate-800 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {(["all", "info", "success", "warn", "error"] as LogFilter[]).map((level) => (
            <button key={level} type="button" onClick={() => setFilter(level)} className={`rounded-md border px-2 py-1 text-[10px] font-black uppercase ${filter === level ? "border-blue-600 bg-blue-950 text-blue-300" : "border-slate-800 text-slate-400"}`}>
              {level}
            </button>
          ))}
        </div>
        {runs.length > 0 && (
          <select value={selectedRun?.id || ""} onChange={(event) => setSelectedRunId(event.target.value)} className="max-w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-[10px] text-slate-200">
            {runs.map((run, index) => (
              <option key={run.id} value={run.id}>
                {index === 0 ? "Latest" : "History"} — {formatCollectorTimestamp(run.startedAt)} — {run.id}
              </option>
            ))}
          </select>
        )}
      </div>

      <div ref={viewport} className="max-h-[440px] min-h-64 overflow-auto p-4">
        {!selectedRun ? (
          <div className="flex min-h-56 items-center justify-center text-slate-500">Waiting for collector logs…</div>
        ) : (
          <div className="space-y-2">
            <div className="mb-3 rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-[10px] text-slate-400">
              runId: <span className="text-slate-200">{selectedRun.id}</span>
            </div>
            {displayedLogs.map((log) => (
              <div key={log.id} className="grid grid-cols-[64px_58px_minmax(0,1fr)] gap-2 leading-relaxed">
                <span className="text-slate-500">{formatLogTime(log.timestamp)}</span>
                <span className={`h-fit rounded border px-1 text-center text-[9px] font-black uppercase ${log.level === "success" ? "border-emerald-800 text-emerald-400" : log.level === "error" ? "border-red-800 text-red-400" : log.level === "warn" ? "border-amber-800 text-amber-400" : "border-blue-800 text-blue-400"}`}>
                  {log.level}
                </span>
                <span className="break-words text-slate-300"><strong className="text-slate-100">[{log.sourceName}]</strong> {log.message}</span>
              </div>
            ))}
            {displayedLogs.length === 0 && <p className="py-10 text-center text-slate-500">No logs match this filter.</p>}
          </div>
        )}
      </div>
    </div>,
    portalHost
  );
}
