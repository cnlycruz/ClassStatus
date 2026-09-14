import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createECDH } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/alerts/subscribe/route";
import { pushRegistrationIdentityHash } from "@/lib/notifications/registrationSecurity";

const origin = "http://localhost:3000";
const ecdh = createECDH("prime256v1");
ecdh.generateKeys();
const keys = {
  p256dh: ecdh.getPublicKey().toString("base64url"),
  auth: Buffer.alloc(16, 9).toString("base64url"),
};
let directory: string;

function body(suffix = "fixture") {
  return {
    subscription: { endpoint: `https://fcm.googleapis.com/fcm/send/${suffix}`, keys },
    lguIds: ["manila"],
  };
}

function request(value: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`${origin}/api/alerts/subscribe`, {
    method: "POST",
    headers: { origin, "sec-fetch-site": "same-origin", "content-type": "application/json", ...headers },
    body: typeof value === "string" ? value : JSON.stringify(value),
  });
}

describe("anonymous push registration security", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-09-14T00:01:00Z") });
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "classstatus-push-registration-"));
    vi.stubEnv("CLASSSTATUS_DATA_DIR", directory);
    vi.stubEnv("CLASSSTATUS_STORAGE_DRIVER", "local-json");
    vi.stubEnv("CLASSSTATUS_SUPABASE_NAMESPACE", "preview");
    vi.stubEnv("CLASSSTATUS_PUBLIC_ORIGIN", origin);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("registers a valid subscription and keeps duplicate registration idempotent", async () => {
    const first = await POST(request(body()));
    const second = await POST(request(body()));
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(await second.json()).toEqual(await first.json());
    const state = JSON.parse(fs.readFileSync(path.join(directory, "push_notifications.json"), "utf8"));
    expect(state.subscriptions).toHaveLength(1);
  });

  it.each([
    ["malformed JSON", "{"],
    ["missing subscription", { lguIds: ["manila"] }],
    ["unexpected structure", { ...body(), unexpected: true }],
    ["unknown LGU", { ...body(), lguIds: ["not-an-ncr-lgu"] }],
    ["duplicate LGU", { ...body(), lguIds: ["manila", "manila"] }],
    ["invalid endpoint", { ...body(), subscription: { ...body().subscription, endpoint: "https://attacker.example/push" } }],
  ])("rejects %s before persistence", async (_label, value) => {
    const response = await POST(request(value));
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "INVALID_SUBSCRIPTION" });
    expect(fs.existsSync(path.join(directory, "push_notifications.json"))).toBe(false);
  });

  it("requires JSON and rejects declared or streamed oversized bodies", async () => {
    expect((await POST(request(body(), { "content-type": "text/plain" }))).status).toBe(415);
    expect((await POST(request(body(), { "content-length": "8193" }))).status).toBe(413);
    expect((await POST(request(`${JSON.stringify(body())}${" ".repeat(8192)}`))).status).toBe(413);
    expect(fs.existsSync(path.join(directory, "push_notifications.json"))).toBe(false);
  });

  it("allows normal distinct registrations and blocks cardinality abuse with 429", async () => {
    for (let index = 0; index < 30; index += 1) {
      expect((await POST(request(body(`normal-${index}`)))).status).toBe(201);
    }
    const blocked = await POST(request(body("blocked")));
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({ error: "RATE_LIMITED" });
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(Number(blocked.headers.get("retry-after"))).toBeLessThanOrEqual(600);
    expect((await POST(request(body("blocked")))).status).toBe(429);
  });

  it("gives duplicate retries a higher ceiling but still bounds write churn", async () => {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      expect((await POST(request(body("duplicate-retry")))).status).toBe(201);
    }
    expect((await POST(request(body("duplicate-retry")))).status).toBe(429);
    expect((await POST(request(body("duplicate-retry")))).status).toBe(429);
  });

  it("uses only Vercel's platform client-IP header in hosted storage", () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("CLASSSTATUS_STORAGE_DRIVER", "supabase");
    vi.stubEnv("CLASSSTATUS_SECURITY_PEPPER", Buffer.alloc(32, 3).toString("base64"));
    const first = request(body(), { "x-vercel-forwarded-for": "2001:db8::1", "x-forwarded-for": "198.51.100.5" });
    const equivalent = request(body(), { "x-vercel-forwarded-for": "2001:0db8:0:0:0:0:0:1", "x-forwarded-for": "203.0.113.9" });
    expect(pushRegistrationIdentityHash(first)).toBe(pushRegistrationIdentityHash(equivalent));
    expect(() => pushRegistrationIdentityHash(request(body(), { "x-forwarded-for": "198.51.100.5" }))).toThrow("identity-unavailable");
  });
});
