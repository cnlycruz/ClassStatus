import { requireAdmin, adminErrorResponse } from "@/lib/admin/requestSecurity";
import { getCollectorLogs } from "@/collector/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function sse(event: string, value: unknown): Uint8Array {
  return new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(value)}\n\n`);
}

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const seen = new Set<string>();
        const close = () => {
          if (closed) return;
          closed = true;
          if (timer) clearTimeout(timer);
          try { controller.close(); } catch { /* already closed */ }
        };
        const poll = async (initial = false) => {
          if (closed) return;
          try {
            const logs = await getCollectorLogs();
            if (closed) return;
            const fresh = initial ? logs : logs.filter((log) => !seen.has(log.id));
            for (const log of logs) seen.add(log.id);
            controller.enqueue(sse(fresh.length > 0 ? (initial ? "snapshot" : "logs") : "heartbeat",
              fresh.length > 0 ? fresh : { at: new Date().toISOString() }));
          } catch {
            if (!closed) controller.enqueue(sse("stream-error", { error: "LOG_STREAM_UNAVAILABLE" }));
          }
          if (!closed) timer = setTimeout(() => void poll(false), 1000);
        };
        request.signal.addEventListener("abort", close, { once: true });
        void poll(true);
      },
      cancel() { /* request abort closes stream */ },
    });
    return new Response(stream, { headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, private",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    } });
  } catch (error) { return adminErrorResponse(error); }
}
