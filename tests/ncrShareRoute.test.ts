import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSuspensions: vi.fn(),
}));

vi.mock("@/collector/storage", () => ({
  getSuspensions: mocks.getSuspensions,
}));

vi.mock("next/og", () => ({
  ImageResponse: class extends Response {
    constructor(_element: unknown, init: { headers?: HeadersInit } = {}) {
      const headers = new Headers(init.headers);
      headers.set("Content-Type", "image/png");
      super(new Uint8Array([137, 80, 78, 71]), { status: 200, headers });
    }
  },
}));

import { GET } from "@/app/api/share/ncr/route";
import { NCR_SHARE_IMAGE_SIZE } from "@/lib/share/ncrShareCardData";

describe("GET /api/share/ncr", () => {
  beforeEach(() => {
    mocks.getSuspensions.mockReset();
    mocks.getSuspensions.mockResolvedValue([]);
  });

  it("returns a 1200-square PNG response for a valid public date", async () => {
    expect(NCR_SHARE_IMAGE_SIZE).toEqual({ width: 1200, height: 1200 });
    const response = await GET(new NextRequest("http://localhost:3000/api/share/ncr?date=2026-08-31"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-disposition")).toContain("class-status-ncr-2026-08-31.png");
    expect(mocks.getSuspensions).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed dates before reading public storage", async () => {
    const response = await GET(new NextRequest("http://localhost:3000/api/share/ncr?date=not-a-date"));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid date. Use YYYY-MM-DD." });
    expect(mocks.getSuspensions).not.toHaveBeenCalled();
  });

  it("returns a clean unavailable response when the public read fails", async () => {
    mocks.getSuspensions.mockRejectedValueOnce(new Error("storage unavailable"));
    const response = await GET(new NextRequest("http://localhost:3000/api/share/ncr?date=2026-08-31"));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "The NCR share card is temporarily unavailable." });
  });
});
