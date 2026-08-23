import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendCollectorLogs, getCollectorLogs, resetStorageCacheForTests } from "../src/collector/storage";
import { CollectorLog } from "../src/types";

const originalDataDirectory = process.env.CLASSSTATUS_DATA_DIR;
let testDirectory: string;

function log(id: string, message: string): CollectorLog {
  return {
    id,
    runId: `run-${id}`,
    timestamp: "2026-08-22T17:10:05.000Z",
    level: "info",
    sourceId: "engine",
    sourceName: "Collector Engine",
    message,
  };
}

describe("collector log storage cache", () => {
  beforeEach(() => {
    testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "classstatus-log-cache-"));
    process.env.CLASSSTATUS_DATA_DIR = testDirectory;
    resetStorageCacheForTests();
  });

  afterEach(() => {
    resetStorageCacheForTests();
    if (originalDataDirectory === undefined) delete process.env.CLASSSTATUS_DATA_DIR;
    else process.env.CLASSSTATUS_DATA_DIR = originalDataDirectory;
    fs.rmSync(testDirectory, { recursive: true, force: true });
  });

  it("reloads when another process changes collector_logs.json", async () => {
    await appendCollectorLogs([log("server", "Server-side run")]);
    expect((await getCollectorLogs())[0].id).toBe("server");

    const externalLog = log("cli", "External CLI run with a different file version");
    const file = path.join(testDirectory, "collector_logs.json");
    fs.writeFileSync(file, JSON.stringify([externalLog], null, 2), "utf-8");
    const futureMtime = new Date(Date.now() + 5_000);
    fs.utimesSync(file, futureMtime, futureMtime);

    expect(await getCollectorLogs()).toEqual([externalLog]);
  });
});
