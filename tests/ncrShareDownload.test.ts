import { describe, expect, it, vi } from "vitest";
import {
  buildNcrShareCardUrl,
  createNcrShareCardDownloadController,
  downloadNcrShareCard,
  getShareCardFilename,
  type NcrShareCardDownloadResult,
} from "@/lib/share/downloadNcrShareCard";

function pngResponse(headers: Record<string, string> = {}): Response {
  return new Response(new Blob(["png"], { type: "image/png" }), {
    status: 200,
    headers: {
      "content-type": "image/png",
      ...headers,
    },
  });
}

describe("NCR share-card download", () => {
  it("builds the live route and includes an active effective date when supplied", () => {
    expect(buildNcrShareCardUrl()).toBe("/api/share/ncr");
    expect(buildNcrShareCardUrl("2026-08-31")).toBe("/api/share/ncr?date=2026-08-31");
  });

  it("uses the endpoint filename and triggers a PNG download", async () => {
    const fetchImpl = vi.fn(async () => pngResponse({
      "content-disposition": 'inline; filename="class-status-ncr-2026-08-31.png"',
    }));
    const triggerDownload = vi.fn();
    const revokeObjectUrl = vi.fn();
    let cleanup: (() => void) | undefined;

    const result = await downloadNcrShareCard(
      { effectiveDate: "2026-08-31" },
      {
        fetchImpl: fetchImpl as typeof fetch,
        createObjectUrl: () => "blob:share-card",
        revokeObjectUrl,
        triggerDownload,
        scheduleCleanup: (callback) => { cleanup = callback; },
      },
    );

    expect(fetchImpl).toHaveBeenCalledWith("/api/share/ncr?date=2026-08-31", { cache: "no-store" });
    expect(triggerDownload).toHaveBeenCalledWith("blob:share-card", "class-status-ncr-2026-08-31.png");
    expect(result).toEqual({
      mode: "download",
      url: "/api/share/ncr?date=2026-08-31",
      filename: "class-status-ncr-2026-08-31.png",
    });

    cleanup?.();
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:share-card");
  });

  it("prevents duplicate generation requests while one is in flight", async () => {
    let finish!: (result: NcrShareCardDownloadResult) => void;
    const pending = new Promise<NcrShareCardDownloadResult>((resolve) => { finish = resolve; });
    const runDownload = vi.fn(() => pending);
    const controller = createNcrShareCardDownloadController(runDownload);

    const first = controller.run();
    const duplicate = controller.run();

    expect(controller.isBusy()).toBe(true);
    expect(duplicate).toBe(first);
    expect(runDownload).toHaveBeenCalledTimes(1);

    finish({ mode: "download", url: "/api/share/ncr", filename: "class-status-ncr.png" });
    await first;
    expect(controller.isBusy()).toBe(false);
  });

  it("opens the generated image when programmatic download is unavailable", async () => {
    const openFallback = vi.fn(() => true);

    const result = await downloadNcrShareCard({}, {
      fetchImpl: (async () => pngResponse()) as typeof fetch,
      createObjectUrl: () => "blob:share-card",
      revokeObjectUrl: vi.fn(),
      triggerDownload: () => { throw new Error("DOWNLOAD_UNAVAILABLE"); },
      openFallback,
    });

    expect(result).toEqual({ mode: "fallback", url: "/api/share/ncr" });
    expect(openFallback).toHaveBeenCalledWith("/api/share/ncr");
  });

  it("surfaces request failures instead of silently opening an error response", async () => {
    const openFallback = vi.fn(() => true);

    await expect(downloadNcrShareCard({}, {
      fetchImpl: (async () => new Response("unavailable", { status: 503 })) as typeof fetch,
      openFallback,
    })).rejects.toThrow("SHARE_CARD_REQUEST_FAILED");

    expect(openFallback).not.toHaveBeenCalled();
  });

  it("falls back to a safe filename when the response omits one", () => {
    expect(getShareCardFilename(null)).toBe("class-status-ncr.png");
    expect(getShareCardFilename("inline; filename=class-status-ncr-2026-08-31.png"))
      .toBe("class-status-ncr-2026-08-31.png");
  });
});
