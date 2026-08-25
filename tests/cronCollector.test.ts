import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const executionMocks = vi.hoisted(() => ({
  runScheduledCollectorWithLease: vi.fn(),
}));

vi.mock("@/collector/execution", () => executionMocks);

import { POST } from "@/app/api/cron/collector/route";

const secret = "test-preview-cron-secret-" + "x".repeat(32);

function request(authorization?: string) {
  return new NextRequest("http://localhost:3000/api/cron/collector", {
    method: "POST",
    headers: authorization ? { authorization } : undefined,
  });
}

beforeEach(() => {
  process.env.CLASSSTATUS_CRON_SECRET = secret;
  executionMocks.runScheduledCollectorWithLease.mockReset();
  executionMocks.runScheduledCollectorWithLease.mockResolvedValue({
    success: true,
    skipped: true,
    reason: "collector_already_running",
  });
});

afterEach(() => {
  delete process.env.CLASSSTATUS_CRON_SECRET;
});

describe("scheduled collector endpoint", () => {
  it("rejects missing and invalid bearer credentials without running the collector", async () => {
    for (const candidate of [undefined, "Bearer wrong-secret", `Basic ${secret}`]) {
      const response = await POST(request(candidate));
      expect(response.status).toBe(401);
      expect(response.headers.get("cache-control")).toBe("no-store, private");
      expect(await response.text()).not.toContain(secret);
    }
    expect(executionMocks.runScheduledCollectorWithLease).not.toHaveBeenCalled();
  });

  it("accepts the configured secret, returns a safe skip, and never echoes the secret", async () => {
    const response = await POST(request(`Bearer ${secret}`));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      skipped: true,
      reason: "collector_already_running",
    });
    expect(executionMocks.runScheduledCollectorWithLease).toHaveBeenCalledOnce();
    expect(JSON.stringify(response.headers)).not.toContain(secret);
  });

  it("does not accept a query-string secret or reuse the admin route", async () => {
    const queryRequest = new NextRequest(
      `http://localhost:3000/api/cron/collector?secret=${encodeURIComponent(secret)}`,
      { method: "POST" }
    );
    expect((await POST(queryRequest)).status).toBe(401);

    const route = fs.readFileSync(
      path.join(process.cwd(), "src", "app", "api", "cron", "collector", "route.ts"),
      "utf8"
    );
    expect(route).not.toContain("requireAdminMutation");
    expect(route).not.toContain("/api/collector/run");
  });

  it("does not pass caller-controlled namespace inputs into collector execution", async () => {
    const maliciousRequest = new NextRequest(
      "https://class-status.vercel.app/api/cron/collector?namespace=preview",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${secret}`,
          "content-type": "application/json",
          "x-classstatus-namespace": "preview",
          cookie: "deployment_namespace=preview",
        },
        body: JSON.stringify({ namespace: "preview" }),
      }
    );
    expect((await POST(maliciousRequest)).status).toBe(200);
    expect(executionMocks.runScheduledCollectorWithLease).toHaveBeenCalledWith();
    const route = fs.readFileSync(
      path.join(process.cwd(), "src", "app", "api", "cron", "collector", "route.ts"),
      "utf8"
    );
    expect(route).not.toMatch(/searchParams|cookies\(|request\.json\(|x-classstatus-namespace/i);
  });
});
