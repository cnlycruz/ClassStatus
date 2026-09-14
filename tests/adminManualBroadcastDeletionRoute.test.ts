import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ requireAdminMutation: vi.fn(), readBoundedJson: vi.fn(), deleteManualBroadcastHistory: vi.fn(), appendAudit: vi.fn() }));
vi.mock("@/lib/admin/requestSecurity", () => ({ requireAdminMutation: mocks.requireAdminMutation, readBoundedJson: mocks.readBoundedJson, adminErrorResponse: (error: { status?: number; code?: string }) => Response.json({ error: error.code || "INTERNAL_ERROR" }, { status: error.status || 500 }) }));
vi.mock("@/lib/notifications/storage", () => ({ deleteManualBroadcastHistory: mocks.deleteManualBroadcastHistory }));
vi.mock("@/lib/admin/audit", () => ({ appendAudit: mocks.appendAudit }));
import { DELETE } from "@/app/api/admin/notifications/[id]/route";

const id = "11111111-1111-4111-8111-111111111111";
const context = { params: Promise.resolve({ id }) };
function request() { return new NextRequest(`http://localhost:3000/api/admin/notifications/${id}`, { method: "DELETE" }); }

describe("manual broadcast history deletion route", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.requireAdminMutation.mockResolvedValue({ id: "admin" }); mocks.readBoundedJson.mockResolvedValue({}); mocks.deleteManualBroadcastHistory.mockResolvedValue(undefined); mocks.appendAudit.mockResolvedValue({}); });
  it("requires an authenticated admin before deleting history", async () => { mocks.requireAdminMutation.mockRejectedValue({ status: 401, code: "UNAUTHENTICATED" }); expect((await DELETE(request(), context)).status).toBe(401); expect(mocks.deleteManualBroadcastHistory).not.toHaveBeenCalled(); });
  it("deletes only the requested history record and appends audit evidence", async () => { const response = await DELETE(request(), context); expect(response.status).toBe(200); expect(mocks.deleteManualBroadcastHistory).toHaveBeenCalledWith(id); expect(mocks.appendAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "manual-broadcast-deletion", outcome: "success", recordId: id })); });
});
