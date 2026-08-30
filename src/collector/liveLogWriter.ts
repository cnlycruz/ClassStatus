import type { CollectorLog } from "@/types";
import { appendCollectorLogs } from "./storage";

export interface CollectorLogWriter {
  enqueue(log: CollectorLog): void;
  flush(): Promise<void>;
}

export function createCollectorLogWriter(flushDelayMs = 250): CollectorLogWriter {
  let pending: CollectorLog[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let writeChain: Promise<void> = Promise.resolve();
  let writeFailed = false;

  const flushPending = (): Promise<void> => {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
    if (pending.length === 0) return writeChain;
    const batch = pending;
    pending = [];
    writeChain = writeChain
      .then(() => appendCollectorLogs(batch))
      .catch((error) => {
        writeFailed = true;
        console.error("Collector live-log persistence failed; collection will continue.", error);
      });
    return writeChain;
  };

  return {
    enqueue(log) {
      pending.push(log);
      if (!timer) {
        timer = setTimeout(() => {
          timer = undefined;
          void flushPending();
        }, Math.max(0, flushDelayMs));
      }
    },
    async flush() {
      await flushPending();
      await writeChain;
      if (writeFailed) {
        console.error("One or more live collector log batches could not be persisted.");
      }
    },
  };
}
