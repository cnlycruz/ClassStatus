import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const read = (...parts: string[]) => fs.readFileSync(path.join(process.cwd(), ...parts), "utf8");

describe("public responsive UI contracts", () => {
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
    expect(panel).not.toContain("max-h-44");
    expect(globals).not.toContain("lgu-detail-scroll-region");
  });
});
