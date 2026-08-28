import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state = { scheduled: true, namespace: "production" as "preview" | "production" };
  const publicRpc = vi.fn();
  const userRpc = vi.fn();
  const userClient = {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: "22222222-2222-4222-8222-222222222222" } }, error: null })),
      getSession: vi.fn(async () => ({ data: { session: { access_token: "verified-access-token" } }, error: null })),
    },
    rpc: userRpc,
  };
  return { state, publicRpc, userRpc, userClient };
});

vi.mock("@/collector/executionContext", () => ({
  isCollectorWorkerExecution: () => mocks.state.scheduled,
}));

vi.mock("@/lib/storage/driver", () => ({
  getDeploymentNamespace: () => mocks.state.namespace,
  getStorageDriver: () => "supabase",
}));

vi.mock("@/lib/admin/config", () => ({
  getConfiguredAdminUserId: () => "22222222-2222-4222-8222-222222222222",
}));

vi.mock("@/lib/supabase/server", () => ({
  createPublicSupabaseClient: () => ({ rpc: mocks.publicRpc }),
  createUserSupabaseClient: async () => mocks.userClient,
  sessionIdFromAccessToken: () => "11111111-1111-4111-8111-111111111111",
}));

import { supabaseSuspensionStore } from "@/lib/storage/supabase";

const eventKey = `v2e:${"a".repeat(64)}`;
const conflictKey = `v2f:${"b".repeat(64)}`;
const candidate = {
  id: "record-1",
  lguId: "manila",
  status: "suspended",
  eventKey,
  parserOutcome: "accepted:tier3-lgu-suspension:v2",
};

describe("scheduled collector storage path", () => {
  beforeEach(() => {
    mocks.state.scheduled = true;
    mocks.state.namespace = "production";
    vi.clearAllMocks();
    process.env.CLASSSTATUS_CRON_SECRET = "test-production-cron-secret-" + "x".repeat(32);
    delete process.env.SUPABASE_SECRET_KEY;
  });

  afterEach(() => {
    delete process.env.CLASSSTATUS_CRON_SECRET;
    delete process.env.SUPABASE_SECRET_KEY;
  });

  it("uses the publishable client and signed proof with the secret key completely absent", async () => {
    mocks.publicRpc.mockResolvedValueOnce({
      data: { action: "created", record: candidate },
      error: null,
    });

    await expect(supabaseSuspensionStore.upsertCollected({
      candidate,
      eventKey,
      conflictKey,
    } as never)).resolves.toMatchObject({ action: "created", record: candidate });

    expect(mocks.publicRpc).toHaveBeenCalledWith(
      "classstatus_production_worker_upsert_collected",
      expect.objectContaining({
        p_payload: JSON.stringify({ record: candidate, eventKey, conflictKey }),
        p_issued_at: expect.any(Number),
        p_nonce: expect.stringMatching(/^[0-9a-f-]{36}$/),
        p_signature: expect.stringMatching(/^[0-9a-f]{64}$/),
      })
    );
    expect(mocks.userRpc).not.toHaveBeenCalled();
  });

  it("uses a fresh logs proof and keeps the manual Production path authenticated", async () => {
    mocks.publicRpc.mockResolvedValueOnce({ data: true, error: null });
    await supabaseSuspensionStore.appendCollectorLogs([{ id: "log-1" }] as never);
    expect(mocks.publicRpc).toHaveBeenCalledWith(
      "classstatus_production_worker_append_collector_logs",
      expect.objectContaining({ p_payload: JSON.stringify({ logs: [{ id: "log-1" }] }) })
    );

    mocks.state.scheduled = false;
    mocks.userRpc.mockResolvedValueOnce({ data: { action: "created", record: candidate }, error: null });
    await supabaseSuspensionStore.upsertCollected({
      candidate,
      eventKey,
      conflictKey,
    } as never);
    expect(mocks.userRpc).toHaveBeenCalledWith(
      "classstatus_production_upsert_collected",
      expect.objectContaining({ p_record: candidate })
    );
  });

  it("keeps Preview storage on Preview RPCs while Preview remains deployed", async () => {
    mocks.state.namespace = "preview";
    process.env.CLASSSTATUS_CRON_SECRET = "test-preview-cron-secret-" + "x".repeat(32);
    mocks.publicRpc.mockResolvedValueOnce({ data: true, error: null });
    await supabaseSuspensionStore.appendCollectorLogs([{ id: "log-preview" }] as never);
    expect(mocks.publicRpc).toHaveBeenCalledWith(
      "classstatus_preview_worker_append_collector_logs",
      expect.objectContaining({ p_payload: JSON.stringify({ logs: [{ id: "log-preview" }] }) })
    );
  });

  it("reads Production public and admin state only through Production RPCs", async () => {
    mocks.state.scheduled = false;
    mocks.publicRpc.mockResolvedValueOnce({ data: [], error: null });
    await expect(supabaseSuspensionStore.listPublicRecords()).resolves.toEqual([]);
    expect(mocks.publicRpc).toHaveBeenCalledWith(
      "classstatus_production_list_public_suspensions"
    );

    mocks.userRpc.mockResolvedValueOnce({
      data: { records: [], audit: [], confirmations: [], idempotency: [] },
      error: null,
    });
    await expect(supabaseSuspensionStore.readState()).resolves.toMatchObject({
      records: [],
      audit: [],
    });
    expect(mocks.userRpc).toHaveBeenCalledWith(
      "classstatus_production_admin_snapshot",
      {}
    );
  });

  it("returns the Supabase public projection without requiring stripped collector metadata", async () => {
    const projected = {
      id: "public-record-1",
      lguId: "pateros",
      status: "classes-suspended",
      publicationProvenance: {
        type: "automatic-collector",
        publicLabel: "Published from approved Tier 3 media evidence",
      },
    };
    mocks.publicRpc.mockResolvedValueOnce({ data: [projected], error: null });

    const records = await supabaseSuspensionStore.listPublicRecords();

    expect(records).toEqual([projected]);
    expect(records[0].collectorProvenance).toBeUndefined();
    expect(records[0].administrativeState).toBeUndefined();
    expect(mocks.publicRpc).toHaveBeenCalledWith(
      "classstatus_production_list_public_suspensions"
    );
  });
});
