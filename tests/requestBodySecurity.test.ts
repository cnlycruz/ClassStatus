import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { readBoundedJson } from "@/lib/admin/requestSecurity";

function streamRequest(chunks: Uint8Array[], cancel = vi.fn()) {
  let reads = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (reads === chunks.length) controller.close();
      else controller.enqueue(chunks[reads++]);
    },
    cancel,
  }, { highWaterMark: 0 });
  const init = { method: "POST", body, duplex: "half" as const };
  const request = new NextRequest("http://localhost:3000/api/admin/auth/login", init);
  return { request, cancel, reads: () => reads };
}

describe("streamed JSON request limits", () => {
  it("rejects and cancels an oversized body before consuming its remainder", async () => {
    const input = streamRequest(Array.from({ length: 100 }, () => new Uint8Array(32).fill(32)));
    await expect(readBoundedJson(input.request, 64)).rejects.toMatchObject({ status: 413, code: "REQUEST_TOO_LARGE" });
    expect(input.reads()).toBe(3);
    expect(input.cancel).toHaveBeenCalledOnce();
  });

  it("counts actual bytes, including split UTF-8 characters, and accepts the exact limit", async () => {
    const bytes = new TextEncoder().encode(JSON.stringify({ text: "é😀" }));
    const input = streamRequest(Array.from(bytes, (byte) => Uint8Array.of(byte)));
    await expect(readBoundedJson(input.request, bytes.length)).resolves.toEqual({ text: "é😀" });
    const short = streamRequest([bytes]);
    await expect(readBoundedJson(short.request, bytes.length - 1)).rejects.toMatchObject({ status: 413 });
  });

  it("returns a controlled validation error for malformed JSON and UTF-8", async () => {
    const malformed = streamRequest([new TextEncoder().encode('{"value":')]);
    await expect(readBoundedJson(malformed.request)).rejects.toMatchObject({ status: 422, code: "INVALID_JSON" });
    const invalidEncoding = streamRequest([Uint8Array.from([34, 0xff, 34])]);
    await expect(readBoundedJson(invalidEncoding.request)).rejects.toMatchObject({ status: 422, code: "INVALID_JSON" });
  });
});
