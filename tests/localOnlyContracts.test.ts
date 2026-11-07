import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const exists = (name: string) => fs.existsSync(path.join(root, name));
const read = (name: string) => fs.readFileSync(path.join(root, name), "utf8");

describe("local-only ClassStatus contracts", () => {
  it("retains the local collector, JSON storage and authenticated admin paths", () => {
    expect(exists("src/collector/engine.ts")).toBe(true);
    expect(exists("src/lib/storage/localJson.ts")).toBe(true);
    expect(exists("src/lib/admin/auth.ts")).toBe(true);
    expect(exists("src/app/api/collector/run/route.ts")).toBe(true);
  });
  it("does not retain cloud runtime modules or scheduled hosted endpoints", () => {
    expect(exists("src/lib/storage/supabase.ts")).toBe(false);
    expect(exists("src/lib/supabase")).toBe(false);
    expect(exists("middleware.ts")).toBe(false);
    expect(exists("src/app/api/cron/collector/route.ts")).toBe(false);
  });
  it("documents a local origin, data directory and manual collector", () => {
    const env = read(".env.example");
    expect(env).toContain("CLASSSTATUS_DATA_DIR=./data");
    expect(env).toContain("CLASSSTATUS_PUBLIC_ORIGIN=http://localhost:3000");
    expect(env).not.toContain("SUPABASE_URL=");
    expect(read("README.md")).toContain("npm run collect");
  });
});
