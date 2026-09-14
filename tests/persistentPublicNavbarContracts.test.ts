import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (...parts: string[]) => fs.readFileSync(path.join(process.cwd(), ...parts), "utf8");

describe("persistent public navbar contracts", () => {
  it("owns public navbar chrome in the persistent root layout", () => {
    const layout = read("src", "app", "layout.tsx");
    const shell = read("src", "components", "PublicAppShell.tsx");

    expect(layout).toContain("<PublicAppShell>{children}</PublicAppShell>");
    expect(shell).toContain('"/", "/sources", "/about", "/install"');
    expect(shell).toContain("PUBLIC_PATHS.has(pathname) && <Navbar />");
    expect(shell).toContain("<StartupSplash onComplete={dismissStartupSplash} />");
    expect(shell).toContain("const hasShownStartupSplash = useRef(!isPublicPath)");
  });

  it("does not let individual public pages create their own navbar", () => {
    for (const page of ["page.tsx", "sources/page.tsx", "about/page.tsx", "install/page.tsx"]) {
      expect(read("src", "app", ...page.split("/"))).not.toContain("<Navbar");
    }
  });

  it("keeps homepage search and selected-LGU alerts connected through browser events", () => {
    const navbar = read("src", "components", "Navbar.tsx");
    const home = read("src", "app", "page.tsx");

    expect(navbar).toContain('new Event("classstatus:open-school-search")');
    expect(navbar).toContain("onClick={openSchoolSearch}");
    expect(home).toContain('addEventListener("classstatus:open-school-search", openSchoolSearch)');
    expect(navbar).toContain('addEventListener("classstatus:lgu-view", handleLguView)');
    expect(home).toContain("reportLguView(lguId);");
  });

  it("reserves a stable desktop clock width", () => {
    const navbar = read("src", "components", "Navbar.tsx");

    expect(navbar).toContain('w-[15ch] tabular-nums font-mono');
    expect(navbar).toContain('fallback="--:--:-- -- PHT"');
  });

  it("keeps startup branding scoped to an initial public shell mount", () => {
    const shell = read("src", "components", "PublicAppShell.tsx");
    const splash = read("src", "components", "StartupSplash.tsx");
    const styles = read("src", "app", "globals.css");

    expect(shell).toContain("hasShownStartupSplash.current = true");
    expect(shell).not.toContain("window.location");
    expect(splash).toContain('data-startup-splash');
    expect(splash).toContain('aria-hidden="true"');
    expect(splash).toContain('matchMedia("(prefers-reduced-motion: reduce)")');
    expect(splash).toContain("reducedMotion ? 280 : 1_450");
    expect(styles).toContain("@keyframes startup-handwriting-reveal");
    expect(styles).toContain("@keyframes startup-handwriting-ink");
    expect(styles).toContain("@keyframes startup-splash-dismiss");
    expect(styles).toContain("safe-area-inset-top");
    expect(styles).toContain(".startup-splash-wordmark");
    expect(styles).toContain("pointer-events: none");
    expect(styles).toContain("prefers-reduced-motion: reduce");
  });
});
