import fs from "fs";
import path from "path";
import { NextRequest } from "next/server";
import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const adminUserId = "22222222-2222-4222-8222-222222222222";
  const state = {
    userId: adminUserId as string | null,
    authError: null as Error | null,
    throwDuringVerification: false,
  };
  const getUser = vi.fn(async () => {
    if (state.throwDuringVerification) throw new Error("provider unavailable");
    return {
      data: { user: state.userId ? { id: state.userId } : null },
      error: state.authError,
    };
  });
  const createPublicSupabaseClient = vi.fn(() => ({ auth: { getUser } }));
  return {
    adminUserId,
    publicOrigin: "https://class-status.example",
    state,
    getUser,
    createPublicSupabaseClient,
  };
});

vi.mock("@/lib/admin/config", () => ({
  getConfiguredAdminUserId: () => mocks.adminUserId,
  getPublicOrigin: () => mocks.publicOrigin,
}));

vi.mock("@/lib/supabase/server", () => ({
  createPublicSupabaseClient: mocks.createPublicSupabaseClient,
}));

vi.mock("@/lib/supabase/runtimeConfig", () => ({
  getSupabaseRuntimeConfig: () => ({
    url: "https://public-project.supabase.co",
    publishableKey: "public-publishable-key",
  }),
}));

import { POST } from "@/app/api/auth/reset-password/authorize/route";
import ResetPasswordPage from "@/app/auth/reset-password/page";

const bearerToken = "header.payload.signature";

function authorizationRequest(options: {
  authorization?: string;
  origin?: string;
  fetchSite?: string;
  url?: string;
  headers?: Record<string, string>;
  body?: string;
} = {}): NextRequest {
  const headers = new Headers(options.headers);
  headers.set("origin", options.origin ?? mocks.publicOrigin);
  headers.set("sec-fetch-site", options.fetchSite ?? "same-origin");
  if (options.authorization !== undefined) headers.set("authorization", options.authorization);
  if (options.body !== undefined) headers.set("content-type", "application/json");
  return new NextRequest(options.url ?? `${mocks.publicOrigin}/api/auth/reset-password/authorize`, {
    method: "POST",
    headers,
    body: options.body,
  });
}

async function expectDenied(response: Response, sensitiveValues: string[] = []): Promise<void> {
  expect(response.status).toBe(401);
  expect(response.headers.get("cache-control")).toBe("no-store, private");
  const body = await response.text();
  expect(JSON.parse(body)).toEqual({ authorized: false });
  for (const value of sensitiveValues) expect(body).not.toContain(value);
}

describe("password recovery authorization route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.state.userId = mocks.adminUserId;
    mocks.state.authError = null;
    mocks.state.throwDuringVerification = false;
  });

  it("accepts an admin Bearer token through the public Supabase auth client", async () => {
    const response = await POST(authorizationRequest({ authorization: `Bearer ${bearerToken}` }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    expect(await response.json()).toEqual({ authorized: true });
    expect(mocks.createPublicSupabaseClient).toHaveBeenCalledTimes(1);
    expect(mocks.getUser).toHaveBeenCalledWith(bearerToken);
  });

  it("generically denies an authenticated non-admin", async () => {
    mocks.state.userId = "33333333-3333-4333-8333-333333333333";
    await expectDenied(
      await POST(authorizationRequest({ authorization: `Bearer ${bearerToken}` })),
      [bearerToken, mocks.state.userId, mocks.adminUserId]
    );
  });

  it.each([
    undefined,
    "",
    "Basic abc",
    "bearer abc",
    "Bearer ",
    "Bearer token with spaces",
    "Bearer token,other",
  ])("generically denies a missing or malformed Authorization header", async (authorization) => {
    await expectDenied(await POST(authorizationRequest({ authorization })));
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("bounds the accepted Authorization header length", async () => {
    const oversized = `Bearer ${"a".repeat(8_192)}`;
    await expectDenied(await POST(authorizationRequest({ authorization: oversized })), [oversized]);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("rejects cookie identity without an explicit Bearer token", async () => {
    const cookieValue = "sb-public-auth-token=valid-looking-cookie";
    await expectDenied(await POST(authorizationRequest({ headers: { cookie: cookieValue } })), [cookieValue]);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("ignores spoofed user IDs from query, body, cookies, and headers", async () => {
    mocks.state.userId = "33333333-3333-4333-8333-333333333333";
    const spoofedBody = JSON.stringify({ userId: mocks.adminUserId });
    const response = await POST(authorizationRequest({
      authorization: `Bearer ${bearerToken}`,
      url: `${mocks.publicOrigin}/api/auth/reset-password/authorize?userId=${mocks.adminUserId}`,
      headers: {
        cookie: `userId=${mocks.adminUserId}`,
        "x-user-id": mocks.adminUserId,
      },
      body: spoofedBody,
    }));
    await expectDenied(response, [bearerToken, mocks.adminUserId, mocks.state.userId]);
    expect(mocks.getUser).toHaveBeenCalledWith(bearerToken);
  });

  it("fails closed on invalid tokens and provider failures without reflecting details", async () => {
    mocks.state.authError = new Error(`invalid token ${bearerToken}`);
    await expectDenied(
      await POST(authorizationRequest({ authorization: `Bearer ${bearerToken}` })),
      [bearerToken]
    );

    mocks.state.authError = null;
    mocks.state.throwDuringVerification = true;
    await expectDenied(
      await POST(authorizationRequest({ authorization: `Bearer ${bearerToken}` })),
      [bearerToken, "provider unavailable"]
    );
  });

  it("requires the configured exact origin and same-origin fetch metadata", async () => {
    await expectDenied(await POST(authorizationRequest({
      authorization: `Bearer ${bearerToken}`,
      origin: "https://evil.example",
      fetchSite: "cross-site",
    })));
    await expectDenied(await POST(authorizationRequest({
      authorization: `Bearer ${bearerToken}`,
      fetchSite: "none",
    })));
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("uses no privileged credential, admin Auth API, cookie, body, or query identity", () => {
    const route = fs.readFileSync(
      path.join(process.cwd(), "src/app/api/auth/reset-password/authorize/route.ts"),
      "utf8"
    );
    expect(route).toContain("createPublicSupabaseClient");
    expect(route).toContain(".auth.getUser(match[1])");
    expect(route).not.toMatch(/SUPABASE_SECRET_KEY|service_role|\.auth\.admin|console\.|request\.cookies|request\.json|formData|searchParams/);
  });
});

describe("reset password server/client boundary", () => {
  it("serializes only intentionally public Supabase configuration into the Client Component", () => {
    vi.stubGlobal("React", React);
    try {
      const element = ResetPasswordPage() as unknown as { props: Record<string, unknown> };
      expect(element.props).toEqual({
        supabaseUrl: "https://public-project.supabase.co",
        supabasePublishableKey: "public-publishable-key",
      });
      expect(JSON.stringify(element.props)).not.toContain(mocks.adminUserId);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("contains no admin UUID prop, admin config import, server secret, or hidden user identifier", () => {
    const page = fs.readFileSync(path.join(process.cwd(), "src/app/auth/reset-password/page.tsx"), "utf8");
    const form = fs.readFileSync(path.join(process.cwd(), "src/app/auth/reset-password/ResetPasswordForm.tsx"), "utf8");
    const helper = fs.readFileSync(path.join(process.cwd(), "src/lib/supabase/passwordRecovery.ts"), "utf8");
    const clientSources = `${page}\n${form}\n${helper}`;
    expect(clientSources).not.toMatch(/adminUserId|getConfiguredAdminUserId|CLASSSTATUS_ADMIN_USER_ID|SUPABASE_SECRET_KEY|service_role|type=["']hidden["']/);
    expect(form).not.toContain("process.env");
  });
});
