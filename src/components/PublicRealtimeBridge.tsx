"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient, type RealtimeChannel } from "@supabase/supabase-js";
import type { ClassStatusRealtimeConfig, PublicAnnouncement } from "@/lib/realtime/types";

const VISITOR_ID_KEY = "classstatus.visitor.id";
const VISIT_SESSION_KEY = "classstatus.visit.session";
const SESSION_TTL_MS = 30 * 60 * 1000;

function readOrCreateVisitorId(): string {
  const existing = window.localStorage.getItem(VISITOR_ID_KEY);
  if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing;
  const created = crypto.randomUUID();
  window.localStorage.setItem(VISITOR_ID_KEY, created);
  return created;
}

function readOrCreateVisitSession(): { id: string; isNew: boolean } {
  const now = Date.now();
  try {
    const parsed = JSON.parse(window.localStorage.getItem(VISIT_SESSION_KEY) || "null") as {
      id?: unknown;
      expiresAt?: unknown;
    } | null;
    if (
      parsed &&
      typeof parsed.id === "string" &&
      /^[0-9a-f-]{36}$/i.test(parsed.id) &&
      typeof parsed.expiresAt === "number" &&
      parsed.expiresAt > now
    ) {
      return { id: parsed.id, isNew: false };
    }
  } catch {
    // Invalid local state is replaced below.
  }

  const id = crypto.randomUUID();
  window.localStorage.setItem(
    VISIT_SESSION_KEY,
    JSON.stringify({ id, expiresAt: now + SESSION_TTL_MS })
  );
  return { id, isNew: true };
}

function normalizeAnnouncement(value: unknown): PublicAnnouncement | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (
    typeof item.id !== "string" ||
    typeof item.message !== "string" ||
    typeof item.createdAt !== "string" ||
    typeof item.expiresAt !== "string"
  ) return null;
  return {
    id: item.id,
    message: item.message,
    createdAt: item.createdAt,
    expiresAt: item.expiresAt,
  };
}

export function PublicRealtimeBridge() {
  const pathname = usePathname();
  const [announcement, setAnnouncement] = useState<PublicAnnouncement | null>(null);
  const announcementTimer = useRef<number | null>(null);

  useEffect(() => {
    if (pathname.startsWith("/collector")) return;

    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    let client: ReturnType<typeof createClient> | null = null;
    let currentLguId: string | null = null;

    const showAnnouncement = (candidate: PublicAnnouncement | null) => {
      if (announcementTimer.current !== null) {
        window.clearTimeout(announcementTimer.current);
        announcementTimer.current = null;
      }
      if (!candidate) {
        setAnnouncement(null);
        return;
      }
      const remaining = Date.parse(candidate.expiresAt) - Date.now();
      if (remaining <= 0) {
        setAnnouncement(null);
        return;
      }
      setAnnouncement(candidate);
      announcementTimer.current = window.setTimeout(() => {
        setAnnouncement(null);
        announcementTimer.current = null;
      }, remaining);
    };

    const updatePresence = () => {
      if (!channel) return;
      void channel.track({
        path: pathname,
        lguId: currentLguId,
        updatedAt: new Date().toISOString(),
      });
    };

    const handleLguView = (event: Event) => {
      const custom = event as CustomEvent<{ lguId?: string }>;
      currentLguId = typeof custom.detail?.lguId === "string" ? custom.detail.lguId : null;
      updatePresence();
    };

    const start = async () => {
      const response = await fetch("/api/realtime/config", { cache: "no-store" });
      if (!response.ok || cancelled) return;
      const config = await response.json() as ClassStatusRealtimeConfig;
      client = createClient(config.url, config.publishableKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });

      const visitorId = readOrCreateVisitorId();
      const visit = readOrCreateVisitSession();
      if (visit.isNew) {
        void client.rpc(`classstatus_${config.namespace}_record_visit`, { p_visit_id: visit.id });
      }

      const { data: current } = await client.rpc(`classstatus_${config.namespace}_current_announcement`);
      if (!cancelled) showAnnouncement(normalizeAnnouncement(current));

      channel = client.channel(`classstatus:${config.namespace}:public`, {
        config: { presence: { key: visitorId } },
      });

      channel
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "classstatus_announcements",
            filter: `deployment_namespace=eq.${config.namespace}`,
          },
          (payload) => {
            const row = payload.new as Record<string, unknown>;
            showAnnouncement(normalizeAnnouncement({
              id: row.id,
              message: row.message,
              createdAt: row.created_at,
              expiresAt: row.expires_at,
            }));
          }
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") updatePresence();
        });

      window.addEventListener("classstatus:lgu-view", handleLguView);
    };

    void start().catch(() => undefined);

    return () => {
      cancelled = true;
      window.removeEventListener("classstatus:lgu-view", handleLguView);
      if (announcementTimer.current !== null) {
        window.clearTimeout(announcementTimer.current);
        announcementTimer.current = null;
      }
      if (client && channel) void client.removeChannel(channel);
    };
  }, [pathname]);

  if (!announcement || pathname.startsWith("/collector")) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-20 z-[70] flex justify-center px-3" aria-live="polite">
      <div className="max-w-[min(92vw,760px)] rounded-full border border-blue-200/80 bg-white/95 px-4 py-2.5 text-center text-sm font-semibold text-slate-900 shadow-xl backdrop-blur dark:border-blue-900/80 dark:bg-slate-900/95 dark:text-white">
        <span className="mr-2" aria-hidden>📢</span>{announcement.message}
      </div>
    </div>
  );
}
