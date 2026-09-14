import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { StartupSplash } from "@/components/StartupSplash";

describe("startup splash", () => {
  it("renders a decorative NCR status scan in the full-viewport public launch overlay", () => {
    const html = renderToStaticMarkup(<StartupSplash onComplete={vi.fn()} />);

    expect(html).toContain("data-startup-splash");
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("Class Status");
    expect(html).toContain("startup-ncr-outline");
    expect(html).toContain("startup-ncr-scan");
    expect((html.match(/startup-status-node/g) ?? [])).toHaveLength(9);
    expect(html).not.toContain("NCR_GEO_PATHS");
    expect(html).toContain("min-h-[100dvh]");
    expect(html).toContain("z-[100]");
  });
});
