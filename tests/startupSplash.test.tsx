import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/font/google", () => ({
  Caveat: () => ({ className: "font-caveat" }),
}));

import { StartupSplash } from "@/components/StartupSplash";

describe("startup splash", () => {
  it("renders a decorative, full-viewport public launch overlay", () => {
    const html = renderToStaticMarkup(<StartupSplash onComplete={vi.fn()} />);

    expect(html).toContain("data-startup-splash");
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("Class Status");
    expect(html).toContain("startup-splash-wordmark");
    expect(html).toContain("min-h-[100dvh]");
    expect(html).toContain("z-[100]");
  });
});
