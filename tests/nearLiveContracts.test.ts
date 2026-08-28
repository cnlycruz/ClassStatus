import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { COLLECTOR_SOURCES, OPERATIONAL_COLLECTOR_SOURCES } from "@/data/sources";

const read = (...parts: string[]) => fs.readFileSync(path.join(process.cwd(), ...parts), "utf8");
const migration = "20260825162450_add_preview_collector_schedule_and_lease.sql";
const productionRuntimeMigration = "20260825203903_add_production_runtime_security_support.sql";
const productionSchedulerMigration = "20260825204234_activate_production_collector_scheduler.sql";
const publicProjectionMigration = "20260828070822_harden_public_suspension_projection.sql";

describe("near-live update contracts", () => {
  it("advertises exactly one-minute polling only for the operational Tier 3 sources", () => {
    expect(OPERATIONAL_COLLECTOR_SOURCES.map((source) => ({
      id: source.id,
      tier: source.reliabilityTier,
      interval: source.checkIntervalMinutes,
      enabled: source.enabled,
    }))).toEqual([
      { id: "rappler-walang-pasok", tier: 3, interval: 1, enabled: true },
      { id: "gma-news-walang-pasok", tier: 3, interval: 1, enabled: true },
    ]);
    expect(COLLECTOR_SOURCES.filter((source) => source.reliabilityTier < 3)
      .every((source) => !source.enabled)).toBe(true);
  });

  it("uses a five-minute namespace lease and an idempotently named Preview schedule", () => {
    const sql = read("supabase", "migrations", migration);
    expect(sql).toContain("primary key");
    expect(sql).toContain("interval '5 minutes'");
    expect(sql).toContain("lease.lease_expires_at <= clock_timestamp()");
    expect(sql).toContain("classstatus_preview_acquire_collector_lease");
    expect(sql).toContain("classstatus_production_acquire_collector_lease");
    expect(sql).toContain("classstatus-preview-collector-every-minute");
    expect(sql).toContain("'* * * * *'");
    expect(sql).toContain("https://class-status-preview.vercel.app/api/cron/collector");
    expect(sql).toContain("vault.decrypted_secrets");
    expect(sql).toContain("classstatus-preview-cron-secret");
    expect(sql).not.toMatch(/Authorization',\s*'Bearer [^']/);
  });

  it("keeps worker RPCs proof-required, anon-only, and behind forced RLS", () => {
    const sql = read("supabase", "migrations", migration);
    expect(sql).toContain("force row level security");
    expect(sql).toMatch(/classstatus_preview_worker_upsert_collected\(text, bigint, uuid, text\) to anon;/i);
    expect(sql).toMatch(/revoke execute on function public\.classstatus_preview_worker_upsert_collected[\s\S]*?from public, authenticated, service_role;/i);
    expect(sql).toContain("verify_preview_collector_capability");
    expect(sql).toContain("set search_path = ''");
  });

  it("keeps dashboard refresh silent, single-flight, and independent of selection state", () => {
    const page = read("src", "app", "page.tsx");
    const refreshBlock = page.slice(page.indexOf("const loadData"), page.indexOf("useEffect(() => {"));
    expect(page).toContain("activeDashboardRequest.current");
    expect(page).toContain('fetch("/api/lgus", { cache: "no-store"');
    expect(page).toContain("startVisibilityAwareDashboardRefresh");
    expect(refreshBlock).toContain("if (controller.signal.aborted || hasDashboardData.current) return;");
    expect(refreshBlock).not.toContain("setSelectedLguId");
    expect(page).not.toMatch(/window\.location\.reload|location\.reload|router\.refresh/);
  });

  it("routes both manual and scheduled sweeps through the durable execution guard", () => {
    const manual = read("src", "app", "api", "collector", "run", "route.ts");
    const scheduled = read("src", "app", "api", "cron", "collector", "route.ts");
    expect(manual).toContain("runCollectorWithLease");
    expect(manual).toContain("requireAdminMutation");
    expect(scheduled).toContain("runScheduledCollectorWithLease");
    expect(scheduled).not.toContain("requireAdminMutation");
  });

  it("forces the public LGU API network-fresh and keeps service-worker API exclusion", () => {
    const api = read("src", "app", "api", "lgus", "route.ts");
    const worker = read("public", "sw.js");
    expect(api).toContain('dynamic = "force-dynamic"');
    expect(api).toContain('revalidate = 0');
    expect(api).toContain('"Cache-Control": "no-store"');
    expect(worker).toContain('NETWORK_ONLY_PREFIXES = ["/api/", "/collector/", "/auth/"]');
  });

  it("keeps the Supabase public list authoritative, namespace-isolated, and privately projected", () => {
    const sql = read("supabase", "migrations", publicProjectionMigration);
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("suspension.deployment_namespace = p_namespace");
    expect(sql).toContain("suspension.administrative_state = 'active'");
    expect(sql).toContain("suspension.provenance_type in ('manual-admin', 'automatic-collector')");
    expect(sql).toContain("coalesce(suspension.record -> 'isDemo', 'false'::jsonb) = 'false'::jsonb");
    expect(sql).toContain("suspension.record #>> '{collectorProvenance,pipeline}' = 'tier3-media'");
    expect(sql).toContain("suspension.record ->> 'confidence' = 'admin-verified'");
    for (const privateField of [
      "administrativeState", "revision", "eventKey", "collectorProvenance",
      "parserOutcome", "fullAnnouncementText",
    ]) {
      expect(sql).toContain(`- '${privateField}'`);
    }
    expect(sql).toMatch(/revoke execute on function classstatus_private\.list_public_suspensions\(text\)[\s\S]*?from public, anon, authenticated, service_role;/i);
    expect(sql).toMatch(/grant execute on function public\.classstatus_production_list_public_suspensions\(\)[\s\S]*?to anon, authenticated;/i);
  });

  it("keeps the cron secret server-only", () => {
    const template = read(".env.example");
    expect(template).toContain("CLASSSTATUS_CRON_SECRET=");
    expect(template).not.toContain("NEXT_PUBLIC_CLASSSTATUS_CRON_SECRET");
  });

  it("keeps Production runtime support separate from scheduler activation", () => {
    const runtimeSql = read("supabase", "migrations", productionRuntimeMigration);
    const schedulerSql = read("supabase", "migrations", productionSchedulerMigration);
    expect(runtimeSql).not.toContain("cron.schedule");
    expect(runtimeSql).not.toContain("classstatus-production-collector-every-minute");
    expect(runtimeSql).not.toContain("https://class-status.vercel.app/api/cron/collector");
    expect(schedulerSql).toContain("classstatus-production-collector-every-minute");
    expect(schedulerSql).toContain("https://classstatus.vercel.app/api/cron/collector");
    expect(schedulerSql).toContain("classstatus-production-cron-secret");
    expect(schedulerSql).not.toContain("classstatus-preview-collector-every-minute");
    expect(schedulerSql).not.toContain("cron.unschedule");
  });

  it("uses Vercel's configured main Production branch without repository overrides", () => {
    expect(fs.existsSync(path.join(process.cwd(), "vercel.json"))).toBe(false);
    const runbook = read("PRODUCTION_CUTOVER.md");
    expect(runbook).toContain("Production Branch is `main`");
    expect(runbook).toContain("git merge --ff-only deployment-preview");
  });
});
