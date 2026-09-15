import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isPortfolioEmbedMode } from "@/lib/embedMode";

const read = (...parts: string[]) => fs.readFileSync(path.join(process.cwd(), ...parts), "utf8");

describe("portfolio embed mode", () => {
  it("activates only for the exact portfolio embed query value", () => {
    expect(isPortfolioEmbedMode("?embed=portfolio")).toBe(true);
    expect(isPortfolioEmbedMode("?lgu=manila&embed=portfolio")).toBe(true);
    expect(isPortfolioEmbedMode("")).toBe(false);
    expect(isPortfolioEmbedMode("?embed=true")).toBe(false);
    expect(isPortfolioEmbedMode("?embed=PORTFOLIO")).toBe(false);
  });

  it("keeps suppression session-scoped without writing dismissal preferences", () => {
    const provider = read("src", "components", "EmbedModeProvider.tsx");
    expect(provider).toContain("window.location.search");
    expect(provider).not.toMatch(/localStorage|sessionStorage|setItem|removeItem/);
  });

  it("limits embed behavior to automatic overlays and retains public interaction", () => {
    const alerts = read("src", "components", "SuspensionAlerts.tsx");
    const installPrompt = read("src", "components", "InstallPrompt.tsx");
    const page = read("src", "app", "page.tsx");
    const map = read("src", "components", "NcrInteractiveMap.tsx");
    const navbar = read("src", "components", "Navbar.tsx");

    expect(alerts).toContain("shouldAutoOpenAlertSetup");
    expect(alerts).toContain('onClick={() => setOpen(true)}');
    expect(alerts).toContain("Notification.requestPermission()");
    expect(installPrompt).toContain("shouldAutoShowInstallPrompt");
    expect(navbar).toContain('href="/install"');

    expect(page).toContain("<NcrInteractiveMap");
    expect(page).toContain("<ListView");
    expect(page).toContain("<SchoolFinderModal");
    expect(map).toContain("onPointerDown={handlePointerDown}");
    expect(`${providerSource()}\n${alerts}\n${installPrompt}`).not.toMatch(/pointer-events-none|disabled={portfolioEmbed}|readOnly={portfolioEmbed}/);
  });
});

function providerSource(): string {
  return read("src", "components", "EmbedModeProvider.tsx");
}
