import { describe, expect, it } from "vitest";
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
    this.leases.set(namespace, { owner: ownerToken, expiresAt: this.now + COLLECTOR_LEASE_TTL_MS });
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
      namespace: "preview",
      lease,
      ownerToken: "11111111-1111-4111-8111-111111111111",
      runSweep: async () => { await firstSweep; return summary; },
    });
    await Promise.resolve();

    await expect(executeCollectorWithLease({
      namespace: "preview",
      lease,
      ownerToken: "22222222-2222-4222-8222-222222222222",
      runSweep: async () => summary,
    })).resolves.toEqual({ success: true, skipped: true, reason: "collector_already_running" });

    finishFirst();
    await expect(first).resolves.toEqual({ success: true, skipped: false, summary });
  });

  it("recovers an expired lease", async () => {
    const lease = new MemoryLease();
    expect(await lease.acquire("preview", "first")).toBe(true);
    lease.now = COLLECTOR_LEASE_TTL_MS + 1;
    expect(await lease.acquire("preview", "replacement")).toBe(true);
  });

  it("keeps Preview and Production leases independent", async () => {
    const lease = new MemoryLease();
    expect(await lease.acquire("preview", "preview-owner")).toBe(true);
    expect(await lease.acquire("production", "production-owner")).toBe(true);
    expect(await lease.acquire("preview", "other-preview-owner")).toBe(false);
  });
});
