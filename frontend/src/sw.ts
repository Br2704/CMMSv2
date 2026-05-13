import { precacheAndRoute } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { NetworkFirst, StaleWhileRevalidate, CacheFirst, NetworkOnly } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { CacheableResponsePlugin } from "workbox-cacheable-response";
import { BackgroundSyncPlugin } from "workbox-background-sync";

declare let self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);

registerRoute(
  ({ request }) => request.mode === "navigate",
  new NetworkFirst({
    cacheName: "app-shell-pages",
    networkTimeoutSeconds: 4,
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 7 }),
    ],
  })
);

registerRoute(
  ({ request, url }) =>
    request.destination === "image" ||
    url.pathname.startsWith("/jkfenner/") ||
    url.pathname.startsWith("/tamoptix/"),
  new StaleWhileRevalidate({
    cacheName: "app-branding-images",
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 30 }),
    ],
  })
);

registerRoute(
  ({ url }) => url.pathname.startsWith("/api/branding/logo"),
  new NetworkFirst({
    cacheName: "branding-logo-assets",
    networkTimeoutSeconds: 3,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 }),
    ],
  })
);

registerRoute(
  ({ url }) => url.pathname.startsWith("/api/branding/manifest"),
  new NetworkFirst({
    cacheName: "branding-manifests",
    networkTimeoutSeconds: 3,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 60 * 60 }),
    ],
  })
);

const bgSyncPlugin = new BackgroundSyncPlugin("cmms-background-updates", {
  maxRetentionTime: 24 * 60,
});

registerRoute(
  ({ url, request }) =>
    request.method === "POST" &&
    (url.pathname.startsWith("/api/work-orders") ||
      url.pathname.startsWith("/api/pm-schedules") ||
      url.pathname.startsWith("/api/calibration") ||
      url.pathname.startsWith("/api/amc")),
  new NetworkOnly({ plugins: [bgSyncPlugin] })
);

registerRoute(
  /^https:\/\/fonts\.googleapis\.com\/.*/i,
  new CacheFirst({
    cacheName: "google-fonts-cache",
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }),
    ],
  })
);

registerRoute(
  /^https:\/\/fonts\.gstatic\.com\/.*/i,
  new CacheFirst({
    cacheName: "gstatic-fonts-cache",
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }),
    ],
  })
);

self.addEventListener("push", (event) => {
  if (!event.data) return;
  try {
    const data = event.data.json();
    const options: NotificationOptions = {
      body: data.body || data.message || "",
      icon: data.icon || "/jkfenner/jkfenner-logo.png",
      badge: data.badge || "/jkfenner/jkfenner-favicon.svg",
      tag: data.tag || data.id || "cmms-push",
      data: { url: data.url || data.link || "/" },
      vibrate: [200, 100, 200],
      requireInteraction: true,
    };
    event.waitUntil(
      self.registration.showNotification(data.title || "CMMS", options)
    );
  } catch {
    const text = event.data.text();
    event.waitUntil(
      self.registration.showNotification("CMMS", { body: text })
    );
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url === urlToOpen && "focus" in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(urlToOpen);
    })
  );
});
