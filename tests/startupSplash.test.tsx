import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { StartupSplash } from "@/components/StartupSplash";

describe("startup splash", () => {
  it("renders all 17 logical LGU pieces from the canonical NCR geometry", () => {
    const html = renderToStaticMarkup(<StartupSplash onComplete={vi.fn()} />);

    expect(html).toContain("data-startup-splash");
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("Class Status");
    expect(html).toContain("startup-ncr-map");
    expect((html.match(/data-startup-lgu=/g) ?? [])).toHaveLength(17);
    expect((html.match(/startup-lgu-path/g) ?? [])).toHaveLength(18);
    expect(html).toContain('viewBox="32 0 736 1000"');
    expect(html).toContain("min-h-[100dvh]");
    expect(html).toContain("z-[100]");
  });
});
