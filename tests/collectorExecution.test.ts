import { describe, expect, it } from "vitest";
import { maxDuration as manualCollectorMaxDuration } from "@/app/api/collector/run/route";
import {
  COLLECTOR_LEASE_TTL_MS,
  executeCollectorWithLease,
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
    const ttl = COLLECTOR_LEASE_TTL_MS;
    this.leases.set(namespace, { owner: ownerToken, expiresAt: this.now + ttl });
    return true;
  }

  async release(namespace: DeploymentNamespace, ownerToken: string): Promise<void> {
    if (this.leases.get(namespace)?.owner === ownerToken) this.leases.delete(namespace);
  }
}

const summary = {} as CollectorSummary;

describe("collector execution lease", () => {
  

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
    lease.now = COLLECTOR_LEASE_TTL_MS - 1;
    expect(await lease.acquire("production", "replacement")).toBe(false);
    lease.now = COLLECTOR_LEASE_TTL_MS + 1;
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

  
});
