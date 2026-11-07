import { afterEach, describe, expect, it } from "vitest";
import { getPublicOrigin } from "@/lib/admin/config";

const originalOrigin = process.env.CLASSSTATUS_PUBLIC_ORIGIN;
afterEach(() => {
  if (originalOrigin === undefined) delete process.env.CLASSSTATUS_PUBLIC_ORIGIN;
  else process.env.CLASSSTATUS_PUBLIC_ORIGIN = originalOrigin;
});

describe("local public origin", () => {
  it("uses the explicitly configured localhost origin", () => {
    process.env.CLASSSTATUS_PUBLIC_ORIGIN = "http://localhost:3000";
    expect(getPublicOrigin()).toBe("http://localhost:3000");
  });
  it("does not guess a hosting provider origin", () => {
    delete process.env.CLASSSTATUS_PUBLIC_ORIGIN;
    expect(() => getPublicOrigin()).toThrow("ADMIN_AUTH_UNAVAILABLE");
  });
});
