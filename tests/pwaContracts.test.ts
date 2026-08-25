import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const read = (...parts: string[]) => fs.readFileSync(path.join(process.cwd(), ...parts), "utf8");

describe("PWA contracts", () => {
  it("publishes the Class Status manifest and icon set", () => {
    const manifest = read("src", "app", "manifest.ts");
    const layout = read("src", "app", "layout.tsx");

    expect(manifest).toContain('name: "Class Status NCR"');
    expect(manifest).toContain('short_name: "Class Status"');
    expect(manifest).toContain('display: "standalone"');
    expect(manifest).toContain('src: "/icons/class-status-icon-192.png"');
    expect(manifest).toContain('src: "/icons/class-status-icon-512.png"');
    expect(layout).toContain('manifest: "/manifest.webmanifest"');
    expect(layout).toContain('applicationName: "Class Status NCR"');
    expect(layout).toContain('title: "Class Status NCR | Metro Manila Class Suspension Tracker (May Pasok Ba?)"');

    for (const icon of [
      "class-status-favicon.png",
      "class-status-favicon-dark.png",
      "class-status-apple-touch-icon.png",
      "class-status-icon-192.png",
      "class-status-icon-512.png",
    ]) {
      expect(fs.existsSync(path.join(process.cwd(), "public", "icons", icon))).toBe(true);
    }

    const darkFavicon = fs.readFileSync(path.join(process.cwd(), "public", "icons", "class-status-favicon-dark.png"));
    expect(darkFavicon.readUInt32BE(16)).toBe(32);
    expect(darkFavicon.readUInt32BE(20)).toBe(32);
  });

  it("registers a browser-only service worker with static-only caching", () => {
    const registration = read("src", "components", "ServiceWorkerRegistration.tsx");
    const worker = read("public", "sw.js");

    expect(registration).toContain('"serviceWorker" in navigator');
    expect(registration).toContain('navigator.serviceWorker.register("/sw.js"');
    expect(registration).toContain('updateViaCache: "none"');
    expect(worker).toContain('request.mode === "navigate"');
    expect(worker).toContain('url.origin !== self.location.origin');
    expect(worker).toContain('url.pathname.startsWith("/_next/static/")');
    expect(worker).toContain('NETWORK_ONLY_PREFIXES = ["/api/", "/collector/", "/auth/"]');
    expect(worker).toContain('"/icons/class-status-favicon-dark.png"');
    expect(worker).not.toContain('"/LOGODARK.png"');
    expect(worker).not.toContain('caches.match(event.request)');
  });
});
