import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const sessionId = "11111111-1111-4111-8111-111111111111";
  const adminUserId = "22222222-2222-4222-8222-222222222222";
  const state = { namespace: "production" as "preview" | "production", signedInUserId: adminUserId };
  const userRpc = vi.fn();
  const publicRpc = vi.fn();
  const signOut = vi.fn(async () => ({ error: null }));
  const userClient = {
    auth: {
      signInWithPassword: vi.fn(async () => ({
        data: {
          user: { id: state.signedInUserId },
          session: { access_token: "verified-access-token" },
        },
        error: null,
      })),
      getUser: vi.fn(async () => ({ data: { user: { id: state.signedInUserId } }, error: null })),
      getSession: vi.fn(async () => ({ data: { session: { access_token: "verified-access-token" } }, error: null })),
      signOut,
    },
    rpc: userRpc,
  };
  return {
    sessionId,
    adminUserId,
    state,
    userRpc,
    publicRpc,
    signOut,
    userClient,
  };
});

vi.mock("@/lib/storage/driver", () => ({
  getStorageDriver: () => "supabase",
  getDeploymentNamespace: () => mocks.state.namespace,
}));

vi.mock("@/lib/admin/config", () => ({
  adminCookieName: () => "unused",
  getAdminConfig: () => { throw new Error("unused"); },
  getConfiguredAdminUserId: () => mocks.adminUserId,
  getSecurityPepper: () => Buffer.alloc(32, 1),
}));

vi.mock("@/lib/storage", () => ({
  securityStore: {
    readSecurity: vi.fn(),
    mutateSecurity: vi.fn(),
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createUserSupabaseClient: async () => mocks.userClient,
  createPublicSupabaseClient: () => ({ rpc: mocks.publicRpc }),
  sessionIdFromAccessToken: () => mocks.sessionId,
}));

vi.mock("next/headers", () => ({ cookies: vi.fn() }));

import {
  authenticateAndIssueAdminSession,
  getAdminSession,
  recordLoginFailure,
  revokeAdminSession,
} from "@/lib/admin/auth";

function sessionPolicy(operation: string) {
  return operation.includes("start_admin_session")
    ? { sessionId: mocks.sessionId, absoluteExpiresAt: "2026-08-24T00:00:00.000Z", idleExpiresAt: "2026-08-23T16:30:00.000Z" }
    : operation.includes("touch_admin_session")
      ? { sessionId: mocks.sessionId, csrfDigest: expect.any(String), absoluteExpiresAt: "2026-08-24T00:00:00.000Z", idleExpiresAt: "2026-08-23T16:30:00.000Z" }
      : true;
}

describe("Supabase admin namespace boundaries", () => {
  beforeEach(() => {
    mocks.state.namespace = "production";
    mocks.state.signedInUserId = mocks.adminUserId;
    vi.clearAllMocks();
    mocks.userRpc.mockImplementation(async (operation: string) => ({ data: sessionPolicy(operation), error: null }));
  });

  it("uses only the authenticated user client for Production session-guard writes", async () => {
    expect(await authenticateAndIssueAdminSession("admin@example.com", "password")).toMatchObject({ id: mocks.sessionId });
    expect(mocks.userRpc).toHaveBeenCalledWith(
      "classstatus_production_start_admin_session",
      expect.objectContaining({
        p_login_fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
      })
    );
    expect(mocks.userRpc.mock.calls[0]?.[1]).not.toEqual(expect.objectContaining({
      p_admin_user_id: expect.anything(),
      p_admin_session_id: expect.anything(),
    }));
    expect(mocks.userRpc.mock.calls[0]?.[1]?.p_login_fingerprint).not.toBe("admin@example.com");

    await getAdminSession();
    await revokeAdminSession();
    expect(mocks.userRpc).toHaveBeenCalledWith(
      "classstatus_production_touch_admin_session",
      expect.objectContaining({ p_touch: true })
    );
    expect(mocks.userRpc).toHaveBeenCalledWith(
      "classstatus_production_revoke_admin_session",
      {}
    );
  });

  it("keeps Preview writes on the authenticated, namespace-fixed client", async () => {
    mocks.state.namespace = "preview";
    expect(await authenticateAndIssueAdminSession("admin@example.com", "password")).toMatchObject({ id: mocks.sessionId });
    expect(mocks.userRpc).toHaveBeenCalledWith(
      "classstatus_preview_start_admin_session",
      expect.objectContaining({
        p_login_fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
      })
    );
    expect(mocks.userRpc.mock.calls[0]?.[1]).not.toEqual(expect.objectContaining({
      p_admin_user_id: expect.anything(),
      p_admin_session_id: expect.anything(),
    }));
    expect(mocks.userRpc.mock.calls[0]?.[1]?.p_login_fingerprint).not.toBe("admin@example.com");
  });

  it("rejects an authenticated non-admin UUID before every policy RPC", async () => {
    mocks.state.signedInUserId = "33333333-3333-4333-8333-333333333333";
    expect(await authenticateAndIssueAdminSession("user@example.com", "password")).toBeNull();
    expect(await getAdminSession()).toBeNull();
    expect(mocks.userRpc).not.toHaveBeenCalled();
  });

  it("does not expose a hosted failure-recording RPC", async () => {
    await recordLoginFailure("admin@example.com");
    expect(mocks.publicRpc).not.toHaveBeenCalled();
  });
});
