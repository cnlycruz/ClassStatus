import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { maxDuration as manualCollectorMaxDuration } from "@/app/api/collector/run/route";
import { maxDuration as scheduledCollectorMaxDuration } from "@/app/api/cron/collector/route";
import {
  COLLECTOR_LEASE_TTL_MS,
  executeCollectorWithLease,
  PRODUCTION_COLLECTOR_LEASE_TTL_MS,
  type CollectorLease,
} from "@/collector/execution";
import type { DeploymentNamespace } from "@/lib/storage/contracts";
import type { CollectorSummary } from "@/types";

class MemoryLease implements CollectorLease {
  private readonly leases = new Map<DeploymentNamespace, { owner: string; expiresAt: number }>();
  public now = 0;

  async acquire(namespace: DeploymentNamespace, ownerToken: string): Promise<boolean> {
    const current = this.leases.get(namespace);
    if (current && current.owner !== ownerToken && current.expiresAt > this.now) return false;
    const ttl = namespace === "production" ? PRODUCTION_COLLECTOR_LEASE_TTL_MS : COLLECTOR_LEASE_TTL_MS;
    this.leases.set(namespace, { owner: ownerToken, expiresAt: this.now + ttl });
    return true;
  }

  async release(namespace: DeploymentNamespace, ownerToken: string): Promise<void> {
    if (this.leases.get(namespace)?.owner === ownerToken) this.leases.delete(namespace);
  }
}

const summary = {} as CollectorSummary;

describe("collector execution lease", () => {
  it("keeps a two-minute Production lease buffer above both route ceilings", () => {
    expect(COLLECTOR_LEASE_TTL_MS).toBe(300_000);
    expect(PRODUCTION_COLLECTOR_LEASE_TTL_MS).toBe(420_000);
    expect(manualCollectorMaxDuration).toBe(300);
    expect(scheduledCollectorMaxDuration).toBe(300);
    expect(PRODUCTION_COLLECTOR_LEASE_TTL_MS).toBeGreaterThan(manualCollectorMaxDuration * 1_000);
    expect(PRODUCTION_COLLECTOR_LEASE_TTL_MS).toBeGreaterThan(scheduledCollectorMaxDuration * 1_000);
  });

  it("lets the first run execute and makes a simultaneous second run skip", async () => {
    const lease = new MemoryLease();
    let finishFirst!: () => void;
    const firstSweep = new Promise<void>((resolve) => { finishFirst = resolve; });
    const first = executeCollectorWithLease({
      namespace: "production",
      lease,
      ownerToken: "11111111-1111-4111-8111-111111111111",
      runSweep: async () => { await firstSweep; return summary; },
    });
    await Promise.resolve();

    await expect(executeCollectorWithLease({
      namespace: "production",
      lease,
      ownerToken: "22222222-2222-4222-8222-222222222222",
      runSweep: async () => summary,
    })).resolves.toEqual({ success: true, skipped: true, reason: "collector_already_running" });

    finishFirst();
    await expect(first).resolves.toEqual({ success: true, skipped: false, summary });
  });

  it("rejects a second Production owner before expiry and recovers after expiry", async () => {
    const lease = new MemoryLease();
    expect(await lease.acquire("production", "first")).toBe(true);
    lease.now = PRODUCTION_COLLECTOR_LEASE_TTL_MS - 1;
    expect(await lease.acquire("production", "replacement")).toBe(false);
    lease.now = PRODUCTION_COLLECTOR_LEASE_TTL_MS + 1;
    expect(await lease.acquire("production", "replacement")).toBe(true);
  });

  it("allows only the matching owner to release the Production lease", async () => {
    const lease = new MemoryLease();
    expect(await lease.acquire("production", "first")).toBe(true);
    await lease.release("production", "wrong-owner");
    expect(await lease.acquire("production", "replacement")).toBe(false);
    await lease.release("production", "first");
    expect(await lease.acquire("production", "replacement")).toBe(true);
  });

  it("keeps Preview and Production leases independent", async () => {
    const lease = new MemoryLease();
    expect(await lease.acquire("preview", "preview-owner")).toBe(true);
    expect(await lease.acquire("production", "production-owner")).toBe(true);
    expect(await lease.acquire("preview", "other-preview-owner")).toBe(false);
  });

  it("keeps the hosted TTL fixed inside the existing atomic private function", () => {
    const migration = fs.readFileSync(path.join(
      process.cwd(),
      "supabase/migrations/20260826102053_extend_production_collector_lease.sql"
    ), "utf8");
    expect(migration).toMatch(/create or replace function classstatus_private\.acquire_collector_lease\(\s*p_namespace text,\s*p_owner_token uuid\s*\)/i);
    expect(migration).toContain("when 'production' then interval '7 minutes'");
    expect(migration).toContain("else interval '5 minutes'");
    expect(migration).toContain("perform classstatus_private.assert_collector_lease_caller(p_namespace)");
    expect(migration).toMatch(/security definer\s+set search_path = ''/i);
    expect(migration).toContain("on conflict (deployment_namespace) do update");
    expect(migration).toContain("where lease.lease_expires_at <= clock_timestamp()");
    expect(migration).toContain("or lease.owner_token = excluded.owner_token");
    expect(migration).toMatch(/revoke execute on function classstatus_private\.acquire_collector_lease\(text, uuid\)\s+from public, anon, authenticated, service_role;/i);
    expect(migration).not.toMatch(/p_(?:ttl|duration|lease_seconds)|verify_production_collector_capability|cron\.schedule|grant execute/i);
    expect(migration).not.toContain("create or replace function classstatus_private.release_collector_lease");
  });
});
