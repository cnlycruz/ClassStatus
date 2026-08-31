import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const read = (...parts: string[]) => fs.readFileSync(path.join(process.cwd(), ...parts), "utf8");

describe("theme-aware browser branding", () => {
  it("switches the navbar logo from the resolved app theme", () => {
    const navbar = read("src", "components", "Navbar.tsx");
    expect(navbar).toContain('theme === "dark" ? "/LOGODARK.png" : "/LOGO.PNG"');
  });

  it("uses the original light logo in the server-rendered NCR share card", () => {
    const route = read("src", "app", "api", "share", "ncr", "route.ts");
    expect(route).toContain('readFile(join(process.cwd(), "public", "LOGO.PNG"))');
    expect(route).not.toContain('readFile(join(process.cwd(), "public", "LOGODARK.png"))');
    expect(route).not.toContain('readFile(join(process.cwd(), "public", "icons", "class-status-icon-192.png"))');
  });

  it("updates one metadata favicon link for both explicit theme assets", () => {
    const favicon = read("src", "components", "ThemeFavicon.tsx");
    expect(favicon).toContain('const LIGHT_FAVICON = "/icons/class-status-favicon.png"');
    expect(favicon).toContain('const DARK_FAVICON = "/icons/class-status-favicon-dark.png"');
    expect(favicon).toContain('link[rel="icon"][sizes="32x32"]');
    expect(favicon).toContain("existingFavicon.href = href");
    expect(favicon).toContain("document.head.appendChild(favicon)");
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
