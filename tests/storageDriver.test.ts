import fs from "fs";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { getDeploymentNamespace, getStorageDriver } from "@/lib/storage/driver";

const managedNames = [
  "VERCEL",
  "VERCEL_ENV",
  "CLASSSTATUS_STORAGE_DRIVER",
  "CLASSSTATUS_SUPABASE_NAMESPACE",
] as const;
const original = Object.fromEntries(managedNames.map((name) => [name, process.env[name]]));

afterEach(() => {
  for (const name of managedNames) {
    const value = original[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("storage driver and namespace isolation", () => {
  it("defaults to local JSON only outside Vercel", () => {
    delete process.env.VERCEL;
    delete process.env.VERCEL_ENV;
    delete process.env.CLASSSTATUS_STORAGE_DRIVER;
    expect(getStorageDriver()).toBe("local-json");
  });

  it.each(["preview", "production"])("rejects local JSON in Vercel %s", (environment) => {
    process.env.VERCEL = "1";
    process.env.VERCEL_ENV = environment;
    process.env.CLASSSTATUS_STORAGE_DRIVER = "local-json";
    expect(() => getStorageDriver()).toThrow("ADMIN_STORAGE_UNAVAILABLE");
  });

  it("derives Preview exclusively from trusted VERCEL_ENV", () => {
    process.env.VERCEL = "1";
    process.env.VERCEL_ENV = "preview";
    process.env.CLASSSTATUS_STORAGE_DRIVER = "supabase";
    process.env.CLASSSTATUS_SUPABASE_NAMESPACE = "production";
    expect(getStorageDriver()).toBe("supabase");
    expect(getDeploymentNamespace()).toBe("preview");
  });

  it("derives Production exclusively from trusted VERCEL_ENV", () => {
    process.env.VERCEL = "1";
    process.env.VERCEL_ENV = "production";
    process.env.CLASSSTATUS_STORAGE_DRIVER = "supabase";
    process.env.CLASSSTATUS_SUPABASE_NAMESPACE = "preview";
    expect(getStorageDriver()).toBe("supabase");
    expect(getDeploymentNamespace()).toBe("production");
  });

  it("keeps the committed environment template free of browser-exposed Supabase variables", () => {
    const template = fs.readFileSync(path.join(process.cwd(), ".env.example"), "utf8");
    expect(template).not.toMatch(/NEXT_PUBLIC_SUPABASE/);
    expect(template).not.toContain("SUPABASE_SECRET_KEY=");
    expect(template).toContain("SUPABASE_PUBLISHABLE_KEY=");
  });
});
