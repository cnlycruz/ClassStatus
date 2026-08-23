import fs from "fs";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { getSupabaseSecretKey } from "@/lib/admin/config";
import { getDeploymentNamespace, getStorageDriver } from "@/lib/storage/driver";

const managedNames = [
  "VERCEL",
  "VERCEL_ENV",
  "CLASSSTATUS_STORAGE_DRIVER",
  "CLASSSTATUS_SUPABASE_NAMESPACE",
  "SUPABASE_SECRET_KEY",
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

  it("does not allow a Supabase secret key in Preview", () => {
    process.env.VERCEL = "1";
    process.env.VERCEL_ENV = "preview";
    process.env.CLASSSTATUS_STORAGE_DRIVER = "supabase";
    process.env.SUPABASE_SECRET_KEY = "not-a-real-secret";
    expect(() => getSupabaseSecretKey()).toThrow("ADMIN_STORAGE_UNAVAILABLE");
  });

  it("keeps the committed environment template free of browser-exposed Supabase variables", () => {
    const template = fs.readFileSync(path.join(process.cwd(), ".env.example"), "utf8");
    expect(template).not.toMatch(/NEXT_PUBLIC_SUPABASE/);
    expect(template).toContain("SUPABASE_SECRET_KEY=");
    expect(template).toContain("Never configure this for Preview");
  });
});
