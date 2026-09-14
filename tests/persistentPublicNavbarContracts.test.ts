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
});
