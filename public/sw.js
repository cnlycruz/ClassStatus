const STATIC_CACHE_PREFIX = "class-status-static-";
const STATIC_CACHE_NAME = `${STATIC_CACHE_PREFIX}v3`;
const STATIC_ICON_PATHS = new Set([
  "/icons/class-status-favicon.png",
  "/icons/class-status-favicon-dark.png",
  "/icons/class-status-apple-touch-icon.png",
  "/icons/class-status-icon-192.png",
  "/icons/class-status-icon-512.png",
  "/icons/class-status-notification-badge.png",
]);
const NETWORK_ONLY_PREFIXES = ["/api/", "/collector/", "/auth/"];

function isSafeStaticAsset(request) {
  if (request.method !== "GET" || request.mode === "navigate") return false;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  if (NETWORK_ONLY_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) return false;

  return url.pathname.startsWith("/_next/static/") || STATIC_ICON_PATHS.has(url.pathname);
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((cacheName) => cacheName.startsWith(STATIC_CACHE_PREFIX) && cacheName !== STATIC_CACHE_NAME)
            .map((cacheName) => caches.delete(cacheName))
        )
      ),
      self.clients.claim(),
    ])
  );
});

self.addEventListener("fetch", (event) => {
  if (!isSafeStaticAsset(event.request)) return;

  event.respondWith(
    caches.open(STATIC_CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request);
      if (cached) return cached;

      const response = await fetch(event.request);
      if (response.ok && response.type === "basic") {
        void cache.put(event.request, response.clone());
      }
      return response;
    })
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = {}; }
  const title = typeof payload.title === "string" ? payload.title : "Class Status";
  const body = typeof payload.body === "string" ? payload.body : "";
  const url = typeof payload.url === "string" && payload.url.startsWith("/") ? payload.url : "/";
  const tag = typeof payload.tag === "string" ? payload.tag : "class-status-alert";
  event.waitUntil(self.registration.showNotification(title, {
    body,
    tag,
    data: { url },
    icon: "/icons/class-status-icon-192.png?v=3",
    badge: "/icons/class-status-notification-badge.png",
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destination = event.notification.data && typeof event.notification.data.url === "string"
    ? event.notification.data.url : "/";
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (windows) => {
    const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) {
      if ("navigate" in existing) await existing.navigate(destination);
      return existing.focus();
    }
    return self.clients.openWindow(destination);
  }));
});
