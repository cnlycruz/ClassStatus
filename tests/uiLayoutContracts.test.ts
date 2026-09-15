import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const read = (...parts: string[]) => fs.readFileSync(path.join(process.cwd(), ...parts), "utf8");

describe("public responsive UI contracts", () => {
  it("offers a stateful public share-card action and preserves the admin shortcut", () => {
    const statusHero = read("src", "components", "StatusHero.tsx");
    const adminConsole = read("src", "app", "collector", "AdminConsoleClient.tsx");

    expect(statusHero).toContain("handleShareCardDownload");
    expect(statusHero).toContain('aria-label="Download Share Card"');
    expect(statusHero).toContain("isShareCardGenerating ? \"Generating…\" : \"Share Card\"");
    expect(statusHero).toContain("isShareCardGenerating ? \"Generating…\" : \"Download Share Card\"");
    expect(statusHero).toContain("aria-busy={isShareCardGenerating}");
    expect(statusHero).toContain("Open image instead");

    expect(adminConsole).toContain('href="/api/share/ncr"');
    expect(adminConsole).toContain("download");
    expect(adminConsole).toContain("Download Share Card");
  });

  it("uses exactly four deterministic hero layouts at the required viewport boundaries", () => {
    const statusHero = read("src", "components", "StatusHero.tsx");
    const heroStyles = read("src", "components", "StatusHero.module.css");

    expect(statusHero).toContain('import styles from "./StatusHero.module.css"');
    expect(statusHero).toContain("min-h-11");
    expect(statusHero).toContain("styles.shareLabelShort");
    expect(statusHero).toContain("styles.shareLabelLong");
    expect(statusHero).not.toContain("sm:min-h-10");
    expect(statusHero).toContain("sm:h-4 sm:w-4");
    expect(statusHero).not.toMatch(/innerWidth|matchMedia|useMediaQuery|isMobile|isDesktop|typeof window|resize/);
    expect(statusHero).not.toContain("flex-wrap");

    expect(heroStyles).toContain("@media (min-width: 560px) and (max-width: 899px)");
    expect(heroStyles).toContain("@media (min-width: 900px) and (max-width: 1399px)");
    expect(heroStyles).toContain("@media (min-width: 1400px)");
    expect(heroStyles).not.toMatch(/auto-fit|auto-fill|@container/);

    expect(heroStyles).toContain('"heading heading"\n    "statuses statuses"\n    "refresh share"\n    "view view"');
    expect(heroStyles).toContain('"heading heading heading"\n      "statuses statuses statuses"\n      "refresh share view"');
    expect(heroStyles).toContain('"heading statuses refresh"\n      "heading share view"');
    expect(heroStyles).toContain('"heading statuses refresh share view"');
    expect(heroStyles.match(/grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/g)).toHaveLength(1);
    expect(heroStyles.match(/grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/g)).toHaveLength(1);
    expect(heroStyles.match(/grid-template-columns: repeat\(4, max-content\)/g)).toHaveLength(2);
  });

  it("keeps public navigation and map controls at pointer-independent touch sizes", () => {
    const navbar = read("src", "components", "Navbar.tsx");
    const map = read("src", "components", "NcrInteractiveMap.tsx");

    expect(navbar).toContain('className="group flex min-h-11');
    expect(navbar).toContain("flex h-11 w-11 shrink-0");
    expect(navbar.match(/flex h-11 w-11 items-center justify-center/g)).toHaveLength(2);
    expect(navbar).toContain("flex min-h-11 items-center gap-2.5");
    expect(map.match(/map-touch-control flex h-11 w-11/g)).toHaveLength(3);
    expect(map).not.toContain("sm:h-8 sm:w-8");
  });

  it("uses a taller responsive desktop map region without platform detection", () => {
    const page = read("src", "app", "page.tsx");
    const globals = read("src", "app", "globals.css");
    const map = read("src", "components", "NcrInteractiveMap.tsx");

    expect(page).toContain("lg:h-[clamp(52rem,84dvh,56rem)]");
    expect(page).not.toContain("lg:h-[46rem]");
    expect(page).not.toContain("calc(100dvh-20rem)");
    expect(globals).not.toContain("calc(100dvh - 13rem)");
    expect(globals).not.toContain("height: min(31.5rem");
    expect(globals).not.toMatch(/\.lgu-detail-body\s*\{[^}]*overflow-y:\s*auto/s);
    expect(`${page}\n${map}`).not.toMatch(
      /navigator\.(?:userAgent|platform)|userAgent|Windows/i,
    );
  });

  it("keeps the footer aligned with the dashboard's wide desktop container and corrected brand name", () => {
    const footer = read("src", "components", "Footer.tsx");
    expect(footer).toContain("2xl:max-w-[min(90vw,1920px)]");
    expect(footer).toContain("Class Status NCR");
    expect(footer).not.toContain("ClassStatus NCR");
  });

  it("keeps source titles uncompressed on mobile and promotes the external link to a touch target", () => {
    const page = read("src", "app", "sources", "page.tsx");
    expect(page).toContain("flex flex-col items-start gap-2 sm:flex-row");
    expect(page).toContain("flex flex-col gap-3 pt-2 sm:flex-row");
    expect(page).toContain("h-11 w-11");
  });

  it("uses a draggable panel and lets the desktop schools list consume remaining height", () => {
    const panel = read("src", "components", "LguDetailPanel.tsx");
    const globals = read("src", "app", "globals.css");
    expect(panel).toContain("onPointerDown={handlePointerDown}");
    expect(panel).toContain("touch-none");
    expect(panel).toContain("lg:flex-1 lg:overflow-y-auto");
    expect(panel).toContain('showAllHistory ? "lg:overflow-y-auto" : "lg:overflow-hidden"');
    expect(panel).not.toContain("max-h-44");
    expect(globals).not.toContain("lgu-detail-scroll-region");
  });

  it("keeps one compact, accessible freshness indicator beside evidence without changing the panel layout", () => {
    const panel = read("src", "components", "LguDetailPanel.tsx");
    expect(panel).toContain("formatFreshness");
    expect(panel).toContain("freshness?.text");
    expect(panel).toContain("Freshness unavailable");
    expect(panel).toContain("title={freshness?.exactTime}");
    expect(panel).toContain("60_000 - (Date.now() % 60_000)");
    expect(panel).toContain("!record &&");
  });
});
