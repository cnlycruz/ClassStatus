import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  reconcileExpiredRemovals: vi.fn(),
  readState: vi.fn(),
  getCollectorLogs: vi.fn(),
  getCollectorFreshness: vi.fn(),
  listManualBroadcastHistory: vi.fn(),
  listAudit: vi.fn(),
}));

vi.mock("@/lib/admin/requestSecurity", () => ({
  requireAdmin: mocks.requireAdmin,
  adminErrorResponse: () => Response.json({ success: false, error: "INTERNAL_ERROR" }, { status: 500 }),
}));
vi.mock("@/lib/admin/suspensions", () => ({ reconcileExpiredRemovals: mocks.reconcileExpiredRemovals }));
vi.mock("@/lib/storage", () => ({ suspensionStore: { readState: mocks.readState } }));
vi.mock("@/collector/storage", () => ({ getCollectorLogs: mocks.getCollectorLogs, getCollectorFreshness: mocks.getCollectorFreshness }));
vi.mock("@/lib/notifications/storage", () => ({ listManualBroadcastHistory: mocks.listManualBroadcastHistory }));
vi.mock("@/lib/admin/audit", () => ({ listAudit: mocks.listAudit }));

import { GET } from "@/app/api/admin/bootstrap/route";

describe("admin bootstrap diagnostics", () => {
  beforeEach(() => {
    mocks.requireAdmin.mockResolvedValue({ id: "session", csrfToken: "csrf", absoluteExpiresAt: "2099-01-01T00:00:00.000Z", idleExpiresAt: "2099-01-01T00:00:00.000Z" });
    mocks.reconcileExpiredRemovals.mockResolvedValue(0);
    mocks.readState.mockResolvedValue({ records: [], audit: [] });
    mocks.getCollectorLogs.mockResolvedValue([]);
    mocks.listAudit.mockResolvedValue([]);
  });

  it("keeps the authenticated console available when optional diagnostics are unavailable", async () => {
    mocks.getCollectorFreshness.mockRejectedValue(new Error("freshness unavailable"));
    mocks.listManualBroadcastHistory.mockRejectedValue(new Error("notification history unavailable"));

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.health.lastCompleteSweepAt).toBeNull();
    expect(payload.manualNotifications).toEqual([]);
    expect(payload.registries.lgus).toHaveLength(17);
  });
});
