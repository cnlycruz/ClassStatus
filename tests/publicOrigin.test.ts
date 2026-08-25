import { afterEach, describe, expect, it, vi } from "vitest";

const original = { ...process.env };

afterEach(() => {
  process.env = { ...original };
  vi.resetModules();
});

describe("hosted public origin", () => {
  it("prefers the configured stable Preview alias over the generated deployment URL", async () => {
    process.env.VERCEL = "1";
    process.env.VERCEL_ENV = "preview";
    process.env.VERCEL_URL = "generated-random.vercel.app";
    process.env.CLASSSTATUS_PUBLIC_ORIGIN = "https://class-status-preview.vercel.app";
    const { getPublicOrigin } = await import("@/lib/admin/config");
    expect(getPublicOrigin()).toBe("https://class-status-preview.vercel.app");
  });

  it("requires the configured stable Production origin", async () => {
    process.env.VERCEL = "1";
    process.env.VERCEL_ENV = "production";
    process.env.VERCEL_URL = "generated-random.vercel.app";
    process.env.CLASSSTATUS_PUBLIC_ORIGIN = "https://class-status.vercel.app";
    const { getPublicOrigin } = await import("@/lib/admin/config");
    expect(getPublicOrigin()).toBe("https://class-status.vercel.app");
    delete process.env.CLASSSTATUS_PUBLIC_ORIGIN;
    expect(() => getPublicOrigin()).toThrow("ADMIN_AUTH_UNAVAILABLE");
  });
});
