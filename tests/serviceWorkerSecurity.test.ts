import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

const origin = "https://classstatus.example";
const source = fs.readFileSync(path.join(process.cwd(), "public/sw.js"), "utf8");

function worker() {
  const listeners: Record<string, (event: Record<string, unknown>) => void> = {};
  const cache = { match: vi.fn(), put: vi.fn() };
  const caches = { open: vi.fn(async () => cache), keys: vi.fn(async () => ["class-status-static-v1", "class-status-static-v3", "unrelated"]), delete: vi.fn() };
  const response = { ok: true, type: "basic", clone: vi.fn(() => ({ body: "static" })) };
  const fetch = vi.fn(async () => response);
  const clients = { claim: vi.fn(), matchAll: vi.fn(async () => []), openWindow: vi.fn() };
  const showNotification = vi.fn(async () => undefined);
  vm.runInNewContext(source, {
    URL, caches, fetch,
    self: { location: { origin }, clients, registration: { showNotification }, skipWaiting: vi.fn(), addEventListener: (name: string, handler: typeof listeners[string]) => { listeners[name] = handler; } },
  });
  return { listeners, caches, cache, fetch, response, clients, showNotification };
}

describe("service worker security boundaries (executed worker)", () => {
  it.each([
    "/", "/collector", "/collector/login", "/auth/reset-password?token=private",
    "/api", "/api/lgus", "/api/admin/bootstrap", "/api/collector/logs",
    "/api/alerts/config", "/api/alerts/preferences", "/api/share/ncr",
    "/_next/static/../../api/admin/bootstrap", "/icons/../api/lgus",
    "https://other.example/_next/static/chunk.js",
  ])("never intercepts sensitive, navigation or foreign URL %s", (url) => {
    const w = worker();
    const respondWith = vi.fn();
    w.listeners.fetch({ request: { url: new URL(url, origin).href, method: "GET", mode: "cors" }, respondWith });
    expect(respondWith).not.toHaveBeenCalled();
    expect(w.caches.open).not.toHaveBeenCalled();
  });

  it.each([{ method: "POST", mode: "cors" }, { method: "GET", mode: "navigate" }])("does not cache $method / $mode requests even for static paths", (options) => {
    const w = worker();
    const respondWith = vi.fn();
    w.listeners.fetch({ request: { url: `${origin}/_next/static/chunk.js`, ...options }, respondWith });
    expect(respondWith).not.toHaveBeenCalled();
  });

  it("caches only successful same-origin static responses and preserves query keys", async () => {
    const w = worker();
    const request = { url: `${origin}/icons/class-status-icon-192.png?v=3`, method: "GET", mode: "cors" };
    let pending: Promise<unknown> | undefined;
    w.listeners.fetch({ request, respondWith: (promise: Promise<unknown>) => { pending = promise; } });
    await pending;
    expect(w.cache.match).toHaveBeenCalledWith(request);
    expect(w.fetch).toHaveBeenCalledWith(request);
    expect(w.cache.put).toHaveBeenCalledWith(request, { body: "static" });
    w.cache.put.mockClear();
    w.response.ok = false;
    w.listeners.fetch({ request, respondWith: (promise: Promise<unknown>) => { pending = promise; } });
    await pending;
    expect(w.cache.put).not.toHaveBeenCalled();
    w.response.ok = true;
    w.response.type = "opaque";
    w.listeners.fetch({ request, respondWith: (promise: Promise<unknown>) => { pending = promise; } });
    await pending;
    expect(w.cache.put).not.toHaveBeenCalled();
  });

  it("removes old application caches on activation without touching unrelated caches", async () => {
    const w = worker();
    let pending: Promise<unknown> | undefined;
    w.listeners.activate({ waitUntil: (promise: Promise<unknown>) => { pending = promise; } });
    await pending;
    expect(w.caches.delete).toHaveBeenCalledExactlyOnceWith("class-status-static-v1");
    expect(w.clients.claim).toHaveBeenCalledOnce();
  });

  it.each(["//evil.example", "/\\evil.example", "javascript:alert(1)", "https://evil.example", null])("contains hostile notification destination %s at display and click", async (url) => {
    const w = worker();
    let pending: Promise<unknown> | undefined;
    const waitUntil = (promise: Promise<unknown>) => { pending = promise; };
    w.listeners.push({ data: { json: () => ({ title: "Notice", url }) }, waitUntil });
    await pending;
    expect(w.showNotification).toHaveBeenCalledWith("Notice", expect.objectContaining({ data: { url: "/" } }));
    // Validate again at click time, including notifications saved by an older worker.
    w.listeners.notificationclick({ notification: { data: { url }, close: vi.fn() }, waitUntil });
    await pending;
    expect(w.clients.openWindow).toHaveBeenCalledWith("/");
  });

  it("preserves the supported LGU deep link and tolerates malformed push objects", async () => {
    const w = worker();
    let pending: Promise<unknown> | undefined;
    const waitUntil = (promise: Promise<unknown>) => { pending = promise; };
    w.listeners.push({ data: { json: () => ({ title: "Notice", url: "/?lgu=manila" }) }, waitUntil });
    await pending;
    expect(w.showNotification).toHaveBeenCalledWith("Notice", expect.objectContaining({ data: { url: "/?lgu=manila" } }));
    for (const value of [null, [], "invalid"]) {
      w.listeners.push({ data: { json: () => value }, waitUntil });
      await pending;
    }
    expect(w.showNotification).toHaveBeenCalledTimes(4);
  });
});
