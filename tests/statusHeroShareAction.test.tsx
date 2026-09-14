import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { StatusHero } from "@/components/StatusHero";

describe("public share-card action", () => {
  const renderStatusHero = () => renderToStaticMarkup(
    <StatusHero
      summary={null}
      activeFilter="all"
      onFilterChange={vi.fn()}
      viewMode="map"
      onViewModeChange={vi.fn()}
      onRefresh={vi.fn()}
    />,
  );

  it("renders a labeled, idle download button in the status controls", () => {
    const html = renderStatusHero();

    expect(html).toContain("Download Share Card");
    expect(html).toContain("Share Card");
    expect(html).toContain('aria-label="Download Share Card"');
    expect(html).toContain('aria-busy="false"');
    expect(html).toContain("sm:w-[13.75rem]");
    expect(html).toContain("sm:whitespace-nowrap");
    expect(html).not.toContain("Generating…");
  });

  it("spins only the refresh icon while a manual dashboard refresh is active", () => {
    const idle = renderToStaticMarkup(
      <StatusHero
        summary={null}
        activeFilter="all"
        onFilterChange={vi.fn()}
        viewMode="map"
        onViewModeChange={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );
    const refreshing = renderToStaticMarkup(
      <StatusHero
        summary={null}
        activeFilter="all"
        onFilterChange={vi.fn()}
        viewMode="map"
        onViewModeChange={vi.fn()}
        onRefresh={vi.fn()}
        isRefreshing
      />,
    );

    expect(idle).toContain("Refresh");
    expect(idle).not.toContain("animate-spin");
    expect(idle).toContain('aria-busy="false"');
    expect(refreshing).toContain("animate-spin");
    expect(refreshing).toContain('aria-busy="true"');
    expect(refreshing).toContain("disabled=\"\"");
    expect(refreshing).toContain("h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4 animate-spin");
  });

  it("renders identical initial markup for mobile and desktop browser globals", () => {
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");

    try {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: { innerWidth: 390, matchMedia: vi.fn() },
      });
      const mobileMarkup = renderStatusHero();

      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: { innerWidth: 1366, matchMedia: vi.fn() },
      });
      const desktopMarkup = renderStatusHero();

      expect(mobileMarkup).toBe(desktopMarkup);
      expect(mobileMarkup).toContain(
        "grid w-full min-w-0 grid-cols-[max-content_minmax(0,1fr)] items-center gap-2 sm:flex sm:flex-wrap xl:w-auto xl:justify-end",
      );
    } finally {
      if (originalWindow) {
        Object.defineProperty(globalThis, "window", originalWindow);
      } else {
        Reflect.deleteProperty(globalThis, "window");
      }
    }
  });
});
