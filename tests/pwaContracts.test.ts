import fs from "fs";
import path from "path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

const read = (...parts: string[]) => fs.readFileSync(path.join(process.cwd(), ...parts), "utf8");

describe("PWA contracts", () => {
  it("publishes the Class Status manifest and icon set", () => {
    const manifest = read("src", "app", "manifest.ts");
    const layout = read("src", "app", "layout.tsx");

    expect(manifest).toContain('name: "Class Status NCR"');
    expect(manifest).toContain('short_name: "Class Status"');
    expect(manifest).toContain('display: "standalone"');
    expect(manifest).toContain('src: "/icons/class-status-icon-192.png?v=3"');
    expect(manifest).toContain('src: "/icons/class-status-icon-512.png?v=3"');
    expect(layout).toContain('manifest: "/manifest.webmanifest"');
    expect(layout).toContain('applicationName: "Class Status NCR"');
    expect(layout).toContain('title: "Class Status NCR | Metro Manila Class Suspension Tracker (May Pasok Ba?)"');

    for (const icon of [
      "class-status-favicon.png",
      "class-status-favicon-dark.png",
      "class-status-apple-touch-icon.png",
      "class-status-icon-192.png",
      "class-status-icon-512.png",
      "class-status-notification-badge.png",
    ]) {
      expect(fs.existsSync(path.join(process.cwd(), "public", "icons", icon))).toBe(true);
    }

    const darkFavicon = fs.readFileSync(path.join(process.cwd(), "public", "icons", "class-status-favicon-dark.png"));
    expect(darkFavicon.readUInt32BE(16)).toBe(32);
    expect(darkFavicon.readUInt32BE(20)).toBe(32);
    for (const [icon, dimension] of [["class-status-icon-192.png", 192], ["class-status-icon-512.png", 512], ["class-status-apple-touch-icon.png", 180], ["class-status-notification-badge.png", 192]] as const) {
      const image = fs.readFileSync(path.join(process.cwd(), "public", "icons", icon));
      expect(image.readUInt32BE(16)).toBe(dimension);
      expect(image.readUInt32BE(20)).toBe(dimension);
    }

    for (const favicon of ["favicon.ico", "favicon-16x16.png", "favicon-32x32.png", "favicon-dark-16x16.png", "favicon-dark-32x32.png"]) {
      expect(fs.existsSync(path.join(process.cwd(), "public", favicon))).toBe(true);
    }
  });

  it("keeps mask-safe transparent padding around installed app artwork", async () => {
    for (const icon of ["class-status-icon-192.png", "class-status-icon-512.png", "class-status-apple-touch-icon.png"]) {
      const imagePath = path.join(process.cwd(), "public", "icons", icon);
      const metadata = await sharp(imagePath).metadata();
      const { info } = await sharp(imagePath).trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer({ resolveWithObject: true });

      expect(info.width).toBeLessThan(metadata.width ?? 0);
      expect(info.height).toBeLessThan(metadata.height ?? 0);
      expect(info.width).toBeGreaterThan((metadata.width ?? 0) * 0.75);
      expect(info.height).toBeGreaterThan((metadata.height ?? 0) * 0.75);
    }
  });

  it("registers a browser-only service worker with static-only caching", () => {
    const registration = read("src", "components", "ServiceWorkerRegistration.tsx");
    const worker = read("public", "sw.js");

    expect(registration).toContain('"serviceWorker" in navigator');
    expect(registration).toContain('navigator.serviceWorker.register("/sw.js"');
    expect(registration).toContain('updateViaCache: "none"');
    expect(registration).toContain('process.env.NODE_ENV !== "production"');
    expect(registration).toContain("navigator.serviceWorker.getRegistrations()");
    expect(registration).toContain("registration.unregister()");
    expect(registration).toContain("cacheName.startsWith(STATIC_CACHE_PREFIX)");
    expect(worker).toContain('request.mode === "navigate"');
    expect(worker).toContain('url.origin !== self.location.origin');
    expect(worker).toContain('url.pathname.startsWith("/_next/static/")');
    expect(worker).toContain('NETWORK_ONLY_PREFIXES = ["/api/", "/collector/", "/auth/"]');
    expect(worker).toContain('"/icons/class-status-favicon-dark.png"');
    expect(worker).toContain('const STATIC_CACHE_NAME = `${STATIC_CACHE_PREFIX}v3`;');
    expect(worker).toContain('icon: "/icons/class-status-icon-192.png?v=3"');
    expect(worker).toContain('badge: "/icons/class-status-notification-badge.png"');
    expect(worker).not.toContain('"/NEWLOGO.PNG"');
    expect(worker).not.toContain('"/NEWLOGODARK.png"');
    expect(worker).not.toContain('caches.match(event.request)');
    expect(worker).toContain('self.addEventListener("push"');
    expect(worker).toContain("showNotification(title");
    expect(worker).toContain('self.addEventListener("notificationclick"');
    expect(worker).toContain("clients.openWindow(destination)");
  });

  it("keeps LAN development assets on HTTP while upgrading production requests", () => {
    const nextConfig = read("next.config.mjs");

    expect(nextConfig).toContain(
      'process.env.NODE_ENV === "production" ? "; upgrade-insecure-requests" : ""'
    );
    expect(nextConfig).toContain("frame-ancestors 'none'${upgradeInsecureRequests}");
    expect(nextConfig).not.toContain("frame-ancestors 'none'; upgrade-insecure-requests`");
  });
});
