import { afterEach, describe, expect, it } from "vitest";
import { getStorageDriver, getDeploymentNamespace } from "@/lib/storage/driver";

const originalDriver = process.env.CLASSSTATUS_STORAGE_DRIVER;
const originalNamespace = process.env.CLASSSTATUS_LOCAL_NAMESPACE;
afterEach(() => {
  if (originalDriver === undefined) delete process.env.CLASSSTATUS_STORAGE_DRIVER;
  else process.env.CLASSSTATUS_STORAGE_DRIVER = originalDriver;
  if (originalNamespace === undefined) delete process.env.CLASSSTATUS_LOCAL_NAMESPACE;
  else process.env.CLASSSTATUS_LOCAL_NAMESPACE = originalNamespace;
});

describe("local-only storage configuration", () => {
  it("uses local JSON by default", () => {
    delete process.env.CLASSSTATUS_STORAGE_DRIVER;
    expect(getStorageDriver()).toBe("local-json");
  });
  it("refuses stale hosted settings", () => {
    process.env.CLASSSTATUS_STORAGE_DRIVER = "supabase";
    expect(() => getStorageDriver()).toThrow("ADMIN_STORAGE_UNAVAILABLE");
  });
  it("uses a stable local partition by default", () => {
    delete process.env.CLASSSTATUS_LOCAL_NAMESPACE;
    expect(getDeploymentNamespace()).toBe("preview");
  });
});
