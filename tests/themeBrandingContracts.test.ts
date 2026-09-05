import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const read = (...parts: string[]) => fs.readFileSync(path.join(process.cwd(), ...parts), "utf8");

describe("theme-aware browser branding", () => {
  it("switches the navbar logo through the document dark-mode class", () => {
    const navbar = read("src", "components", "Navbar.tsx");
    expect(navbar).toContain('src="/NEWLOGO.PNG"');
    expect(navbar).toContain('src="/NEWLOGODARK.png"');
    expect(navbar).toContain("block h-full w-full object-contain dark:hidden");
    expect(navbar).toContain("hidden h-full w-full object-contain dark:block");
    expect(navbar).not.toContain('className="block h-full w-full rounded-xl');
    expect(navbar).not.toContain('className="hidden h-full w-full rounded-xl');
    expect(navbar).not.toContain('src={theme === "dark" ? "/LOGODARK.png" : "/LOGO.PNG"}');
  });

  it("uses the high-contrast new dark logo in the server-rendered NCR share card", () => {
    const route = read("src", "app", "api", "share", "ncr", "route.ts");
    expect(route).toContain('readFile(join(process.cwd(), "public", "NEWLOGODARK.png"))');
    expect(route).not.toContain('readFile(join(process.cwd(), "public", "NEWLOGO.PNG"))');
    expect(route).not.toContain('readFile(join(process.cwd(), "public", "icons", "class-status-icon-192.png"))');
  });

  it("uses metadata media descriptors for the light and dark favicon assets", () => {
    const layout = read("src", "app", "layout.tsx");
    expect(layout).toContain('url: "/favicon.ico?v=3"');
    expect(layout).toContain('url: "/favicon-32x32.png?v=3"');
    expect(layout).toContain('url: "/favicon-dark-32x32.png?v=3"');
    expect(layout).toContain('media: "(prefers-color-scheme: light)"');
    expect(layout).toContain('media: "(prefers-color-scheme: dark)"');
    expect(layout).not.toContain("ThemeFavicon");
  });

  it("keeps installed-app icon metadata on the fixed light asset set", () => {
    const manifest = read("src", "app", "manifest.ts");
    const layout = read("src", "app", "layout.tsx");
    expect(manifest).not.toContain("class-status-favicon-dark.png");
    expect(manifest).toContain("class-status-icon-192.png");
    expect(manifest).toContain("class-status-icon-512.png");
    expect(layout).toContain("class-status-apple-touch-icon.png");
  });
});
