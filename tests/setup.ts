import fs from "fs";
import os from "os";
import path from "path";
import { afterAll } from "vitest";

const testDataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "classstatus-ncr-tests-"));
process.env.CLASSSTATUS_DATA_DIR = testDataDirectory;

afterAll(() => {
  fs.rmSync(testDataDirectory, { recursive: true, force: true });
});
