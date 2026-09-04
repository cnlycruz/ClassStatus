import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET as getLogs } from "@/app/api/collector/logs/route";
import { GET as getBootstrap } from "@/app/api/admin/bootstrap/route";
import { POST as runCollector } from "@/app/api/collector/run/route";
import { POST as clearLiveData } from "@/app/api/demo-mode/route";
import { PUT as mutateSources } from "@/app/api/collector/sources/route";
import { readBoundedJson, validateMutationEnvelope } from "@/lib/admin/requestSecurity";
import { checkLoginThrottle, recordLoginFailure } from "@/lib/admin/auth";
import { securityStore } from "@/lib/storage";

beforeEach(() => {
  process.env.CLASSSTATUS_ADMIN_USERNAME = "admin"; process.env.CLASSSTATUS_ADMIN_PASSWORD_HASH = "$argon2id$v=19$m=8192,t=1,p=1$YQ$YQ";
  process.env.CLASSSTATUS_SESSION_SECRET = Buffer.alloc(32, 5).toString("base64"); process.env.CLASSSTATUS_PUBLIC_ORIGIN = "http://localhost:3000"; process.env.CLASSSTATUS_STORAGE_DRIVER = "local-json";
  securityStore.mutateSecurity((state) => { delete state.activeSession; state.identifierBuckets = []; state.globalFailures = []; });
});

describe("admin route boundaries", () => {
  it("rejects unauthenticated diagnostics and collector mutations", async () => {
    expect((await getLogs()).status).toBe(401);
    expect((await getBootstrap()).status).toBe(401);
    const request = new NextRequest("http://localhost:3000/api/collector/run", { method: "POST", headers: { origin: "http://localhost:3000", "sec-fetch-site": "same-origin", "content-type": "application/json", "x-csrf-token": "forged" }, body: "{}" });
    expect((await runCollector(request)).status).toBe(401);
  });
  it("permanently disables legacy bulk/source mutations", async () => {
    expect((await clearLiveData()).status).toBe(405);
    const request = new NextRequest("http://localhost:3000/api/collector/sources", { method: "PUT", body: "{}" });
    expect((await mutateSources(request)).status).toBe(405);
  });
  it("requires exact origin, same-site metadata, JSON, and session CSRF", () => {
    const valid = new NextRequest("http://localhost:3000/api/admin/test", { method: "POST", headers: { origin: "http://localhost:3000", "sec-fetch-site": "same-origin", "content-type": "application/json", "x-csrf-token": "bound-token" }, body: "{}" });
    expect(() => validateMutationEnvelope(valid, "http://localhost:3000", "bound-token")).not.toThrow();
    const crossOrigin = new NextRequest("http://localhost:3000/api/admin/test", { method: "POST", headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site", "content-type": "application/json", "x-csrf-token": "bound-token" }, body: "{}" });
    expect(() => validateMutationEnvelope(crossOrigin, "http://localhost:3000", "bound-token")).toThrow("REQUEST_ORIGIN_REJECTED");
    const forged = new NextRequest("http://localhost:3000/api/admin/test", { method: "POST", headers: { origin: "http://localhost:3000", "sec-fetch-site": "same-origin", "content-type": "application/json", "x-csrf-token": "forged" }, body: "{}" });
    expect(() => validateMutationEnvelope(forged, "http://localhost:3000", "bound-token")).toThrow("CSRF_REJECTED");
  });
  it("bounds JSON bodies and applies login backoff", async () => {
    const oversized = new NextRequest("http://localhost:3000/api/admin/test", { method: "POST", body: JSON.stringify({ value: "x".repeat(100) }) });
    await expect(readBoundedJson(oversized, 32)).rejects.toThrow("REQUEST_TOO_LARGE");
    for (let attempt = 0; attempt < 5; attempt++) await recordLoginFailure("admin");
    expect((await checkLoginThrottle("admin")).allowed).toBe(false);
    expect((await checkLoginThrottle("unknown")).allowed).toBe(true);
  });
  it("returns unavailable instead of falling back to local JSON on Vercel production", async () => {
    process.env.VERCEL = "1"; process.env.VERCEL_ENV = "production";
    try { expect((await getLogs()).status).toBe(503); }
    finally { delete process.env.VERCEL; delete process.env.VERCEL_ENV; }
  });
});
