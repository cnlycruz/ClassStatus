import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const failures = vi.hoisted(() => ({ operation: vi.fn() }));
vi.mock("@/lib/admin/suspensions", () => ({
  createPublicationPreview: failures.operation,
  publishManualSuspension: failures.operation,
  requestRemoval: failures.operation,
  undoRemoval: failures.operation,
}));
vi.mock("@/lib/admin/requestSecurity", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/admin/requestSecurity")>(),
  requireAdminMutation: async () => ({ id: "verified-session" }),
}));

import { POST as preview } from "@/app/api/admin/suspensions/preview/route";
import { POST as publish } from "@/app/api/admin/suspensions/route";
import { POST as remove } from "@/app/api/admin/suspensions/[id]/remove/route";
import { POST as undo } from "@/app/api/admin/suspensions/[id]/undo/route";

const context = { params: Promise.resolve({ id: "test-record" }) };
const cases = [
  { name: "preview", handler: (request: NextRequest) => preview(request), body: {} },
  { name: "publish", handler: (request: NextRequest) => publish(request), body: { draft: {}, confirmationToken: "test", idempotencyKey: "test", confirmed: true } },
  { name: "remove", handler: (request: NextRequest) => remove(request, context), body: { expectedRevision: 1, idempotencyKey: "test", confirmed: true } },
  { name: "undo", handler: (request: NextRequest) => undo(request, context), body: { expectedRevision: 1, idempotencyKey: "test" } },
];

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

describe("suspension mutation error boundary", () => {
  it.each(cases)("does not expose unexpected storage errors from $name", async ({ handler, body }) => {
    const diagnostic = vi.spyOn(console, "error").mockImplementation(() => undefined);
    failures.operation.mockRejectedValueOnce(new Error("EACCES: read C:/private/runtime/state.json; upstream response contains confidential configuration"));
    const result = await handler(new NextRequest("http://localhost:3000/api/admin/suspensions", { method: "POST", body: JSON.stringify(body) }));
    expect(result.status).toBe(500);
    expect(await result.json()).toEqual({ success: false, error: "INTERNAL_ERROR" });
    expect(result.headers.get("cache-control")).toBe("no-store, private");
    expect(diagnostic).toHaveBeenCalledWith("Admin suspension mutation failed.", expect.any(Error));
  });

  it.each([
    ["confirmation-invalid", 409], ["stale-revision", 409], ["record-not-found", 404],
    ["target-invalid", 422], ["session-invalid", 401], ["ADMIN_STORAGE_UNAVAILABLE", 503],
  ])("preserves the intentional domain response for %s", async (code, status) => {
    failures.operation.mockRejectedValueOnce(new Error(code as string));
    const result = await preview(new NextRequest("http://localhost:3000/api/admin/suspensions/preview", { method: "POST", body: "{}" }));
    expect(result.status).toBe(status);
    expect(result.headers.get("cache-control")).toBe("no-store, private");
  });
});
