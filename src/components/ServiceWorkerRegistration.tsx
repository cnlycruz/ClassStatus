"use client";

import { useEffect } from "react";

const STATIC_CACHE_PREFIX = "class-status-static-";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker.getRegistrations().then((registrations) =>
        Promise.all(registrations.map((registration) => registration.unregister()))
      );

      if ("caches" in window) {
        void caches.keys().then((cacheNames) =>
          Promise.all(
            cacheNames
              .filter((cacheName) => cacheName.startsWith(STATIC_CACHE_PREFIX))
              .map((cacheName) => caches.delete(cacheName))
          )
        );
      }
      return;
    }

    if (!window.isSecureContext) return;

    void navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    }).catch(() => {
      // Installation is progressive enhancement; live data remains network-driven.
    });
  }, []);

  return null;
}
