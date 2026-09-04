import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  requireAdminMutation: vi.fn(),
  readBoundedJson: vi.fn(),
  previewManualBroadcast: vi.fn(),
}));

vi.mock("@/lib/admin/requestSecurity", () => ({
  requireAdminMutation: mocks.requireAdminMutation,
  readBoundedJson: mocks.readBoundedJson,
  adminErrorResponse: (error: unknown) => {
    const value = error as { status?: number; code?: string };
    return Response.json({ success: false, error: value.code || "INTERNAL_ERROR" }, { status: value.status || 500 });
  },
}));
vi.mock("@/lib/notifications/storage", () => ({ previewManualBroadcast: mocks.previewManualBroadcast }));

import { POST } from "@/app/api/admin/notifications/preview/route";

const validInput = {
  requestKey: "11111111-1111-4111-8111-111111111111",
  message: "Heavy rain is expected this afternoon.",
  recipientMode: "all",
  targetLguIds: [],
};

function request() {
  return new NextRequest("http://localhost:3000/api/admin/notifications/preview", { method: "POST" });
}

describe("admin notification recipient preview route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminMutation.mockResolvedValue({ id: "admin" });
    mocks.readBoundedJson.mockResolvedValue(validInput);
  });

  it("returns an available recipient count for authenticated valid requests", async () => {
    mocks.previewManualBroadcast.mockResolvedValue(3);

    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ available: true, recipientCount: 3 });
  });

  it("degrades an operational count-store failure without returning INTERNAL_ERROR", async () => {
    mocks.previewManualBroadcast.mockRejectedValue(new Error("notification-storage-unavailable"));

    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ available: false, recipientCount: null });
  });

  it("continues to reject unauthenticated requests before previewing", async () => {
    mocks.requireAdminMutation.mockRejectedValue({ status: 401, code: "UNAUTHENTICATED" });

    const response = await POST(request());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: "UNAUTHENTICATED" });
    expect(mocks.previewManualBroadcast).not.toHaveBeenCalled();
  });

  it("continues to reject invalid notification input", async () => {
    mocks.readBoundedJson.mockResolvedValue({ ...validInput, message: "" });

    const response = await POST(request());

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({ error: "INVALID_NOTIFICATION" });
    expect(mocks.previewManualBroadcast).not.toHaveBeenCalled();
  });
});
