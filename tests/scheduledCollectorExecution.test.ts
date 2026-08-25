import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  state: { namespace: "production" as "preview" | "production" },
  publicRpc: vi.fn(),
  userRpc: vi.fn(),
  runSweep: vi.fn(),
}));

vi.mock("@/collector/engine", () => ({
  globalCollector: { runSweep: mocks.runSweep },
}));

vi.mock("@/lib/storage/driver", () => ({
  getStorageDriver: () => "supabase",
  getDeploymentNamespace: () => mocks.state.namespace,
}));

vi.mock("@/lib/supabase/server", () => ({
  createPublicSupabaseClient: () => ({ rpc: mocks.publicRpc }),
  createUserSupabaseClient: async () => ({ rpc: mocks.userRpc }),
}));

import { runCollectorWithLease, runScheduledCollectorWithLease } from "@/collector/execution";

describe("hosted collector lease clients", () => {
  beforeEach(() => {
    mocks.state.namespace = "production";
    vi.clearAllMocks();
    process.env.CLASSSTATUS_CRON_SECRET = "test-production-cron-secret-" + "x".repeat(32);
    delete process.env.SUPABASE_SECRET_KEY;
    mocks.publicRpc.mockResolvedValue({ data: true, error: null });
    mocks.userRpc.mockResolvedValue({ data: true, error: null });
    mocks.runSweep.mockResolvedValue({ runs: [] });
  });

  afterEach(() => {
    delete process.env.CLASSSTATUS_CRON_SECRET;
    delete process.env.SUPABASE_SECRET_KEY;
  });

  it("acquires and releases a scheduled Production lease through fresh publishable-key proofs", async () => {
    await expect(runScheduledCollectorWithLease()).resolves.toMatchObject({ success: true, skipped: false });
    expect(mocks.publicRpc).toHaveBeenCalledTimes(2);
    expect(mocks.publicRpc).toHaveBeenNthCalledWith(
      1,
      "classstatus_production_worker_acquire_collector_lease",
      expect.objectContaining({
        p_payload: expect.stringMatching(/^\{"ownerToken":"[0-9a-f-]{36}"\}$/),
        p_signature: expect.stringMatching(/^[0-9a-f]{64}$/),
      })
    );
    expect(mocks.publicRpc).toHaveBeenNthCalledWith(
      2,
      "classstatus_production_worker_release_collector_lease",
      expect.objectContaining({ p_signature: expect.stringMatching(/^[0-9a-f]{64}$/) })
    );
    const firstProof = mocks.publicRpc.mock.calls[0]?.[1];
    const secondProof = mocks.publicRpc.mock.calls[1]?.[1];
    expect(firstProof.p_nonce).not.toBe(secondProof.p_nonce);
    expect(firstProof.p_signature).not.toBe(secondProof.p_signature);
    expect(mocks.userRpc).not.toHaveBeenCalled();
  });

  it("keeps a manual Production run on the authenticated lease RPC", async () => {
    await expect(runCollectorWithLease()).resolves.toMatchObject({ success: true, skipped: false });
    expect(mocks.userRpc).toHaveBeenNthCalledWith(
      1,
      "classstatus_production_acquire_collector_lease",
      expect.objectContaining({ p_owner_token: expect.stringMatching(/^[0-9a-f-]{36}$/) })
    );
    expect(mocks.userRpc).toHaveBeenNthCalledWith(
      2,
      "classstatus_production_release_collector_lease",
      expect.objectContaining({ p_owner_token: expect.any(String) })
    );
    expect(mocks.publicRpc).not.toHaveBeenCalled();
  });

  it("preserves the currently deployed Preview worker path during cutover", async () => {
    mocks.state.namespace = "preview";
    process.env.CLASSSTATUS_CRON_SECRET = "test-preview-cron-secret-" + "x".repeat(32);
    await expect(runScheduledCollectorWithLease()).resolves.toMatchObject({ success: true, skipped: false });
    expect(mocks.publicRpc).toHaveBeenNthCalledWith(
      1,
      "classstatus_preview_worker_acquire_collector_lease",
      expect.objectContaining({ p_signature: expect.stringMatching(/^[0-9a-f]{64}$/) })
    );
  });
});
