import { z } from "zod";
import { requireAdmin, adminErrorResponse } from "@/lib/admin/requestSecurity";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { getDeploymentNamespace } from "@/lib/storage/driver";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const logSchema = z.object({
  id: z.string(),
  runId: z.string().optional(),
  timestamp: z.string(),
  level: z.enum(["info", "warn", "error", "success"]),
  sourceId: z.string(),
  sourceName: z.string(),
  message: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

function sse(event: string, value: unknown): Uint8Array {
  return new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(value)}\n\n`);
}

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const client = await createUserSupabaseClient();
    const namespace = getDeploymentNamespace();

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
            const { data, error } = await client.rpc(
              `classstatus_${namespace}_list_collector_logs`,
              { p_limit: 200 }
            );
            if (error) throw error;
            const logs = z.array(logSchema).parse(data);
            const fresh = initial ? logs : logs.filter((log) => !seen.has(log.id));
            logs.forEach((log) => seen.add(log.id));
            if (fresh.length > 0) controller.enqueue(sse(initial ? "snapshot" : "logs", fresh));
            else controller.enqueue(sse("heartbeat", { at: new Date().toISOString() }));
          } catch {
            controller.enqueue(sse("stream-error", { error: "LOG_STREAM_UNAVAILABLE" }));
          }
          if (!closed) timer = setTimeout(() => void poll(false), 1000);
        };

        request.signal.addEventListener("abort", close, { once: true });
        void poll(true);
      },
      cancel() {
        // The request abort signal handles timer cleanup.
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store, private",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
