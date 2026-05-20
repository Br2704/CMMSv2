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
    ["POST", "PUT", "PATCH", "DELETE"].includes(request.method) &&
    (url.pathname.startsWith("/api/work-orders") ||
      url.pathname.startsWith("/api/pm-schedules") ||
      url.pathname.startsWith("/api/calibration") ||
      url.pathname.startsWith("/api/amc") ||
      url.pathname.startsWith("/api/assets") ||
      url.pathname.startsWith("/api/logs")),
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
    const tag = data.tag || data.id || `cmms-${Date.now()}`;
    const groupId = data.groupId || 'default';
    
    const options: NotificationOptions = {
      body: data.body || data.message || "",
      icon: data.icon || "/tamoptix/tamoptix-logo.png",
      badge: data.badge || "/tamoptix/tamoptix-favicon.svg",
      tag,
      data: {
        url: data.url || data.link || "/",
        action: data.action || "open",
        woId: data.woId || null,
        notificationId: data.notificationId || null,
        groupId,
        timestamp: Date.now(),
      },
      vibrate: [200, 100, 200],
      requireInteraction: true,
      silent: data.silent || false,
      renotify: true,
      actions: [
        { action: "open", title: "View Details" },
        { action: "dismiss", title: "Dismiss" },
      ],
    };

    event.waitUntil(
      (async () => {
        // Grouping is handled by 'tag' for individual unread, 
        // but 'groupId' can be used for platform-specific grouping if supported.
        await self.registration.showNotification(data.title || "CMMS", options);
        
        try {
          if ("setAppBadge" in navigator) {
            const count = data.unreadCount || await getUnreadNotificationCount();
            if (count > 0) {
              await (navigator as any).setAppBadge(count);
            } else {
              await (navigator as any).clearAppBadge();
            }
          }
        } catch (err) {
          console.warn("[SW] Badge API error:", err);
        }
      })()
    );
  } catch {
    const text = event.data.text();
    event.waitUntil(
      self.registration.showNotification("CMMS", {
        body: text,
        badge: "/tamoptix/tamoptix-favicon.svg",
        icon: "/tamoptix/tamoptix-logo.png",
      })
    );
  }
});

async function getUnreadNotificationCount(): Promise<number> {
  try {
    const cache = await caches.open("app-shell-pages");
    return 0;
  } catch {
    return 0;
  }
}

async function isSameOriginUrl(url: string): Promise<boolean> {
  try {
    const parsed = new URL(url, self.location.origin);
    return parsed.origin === self.location.origin;
  } catch {
    return false;
  }
}

async function openOrFocusClient(url: string): Promise<void> {
  if (!(await isSameOriginUrl(url))) {
    const safeUrl = new URL("/", self.location.origin).toString();
    console.warn("[SW] Blocked navigation to external URL:", url);
    url = safeUrl;
  }

  const clients = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });

  for (const client of clients) {
    const clientUrl = new URL(client.url);
    const targetUrl = new URL(url, self.location.origin);
    if (clientUrl.pathname === targetUrl.pathname && "focus" in client) {
      await client.focus();
      return;
    }
  }

  await self.clients.openWindow(url);
}

async function dismissNotification(tag: string): Promise<void> {
  const notifications = await self.registration.getNotifications({ tag });
  notifications.forEach((n) => n.close());
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const urlToOpen = data.url || "/";
  const action = event.action || "open";

  event.waitUntil(
    (async () => {
      try {
        if ("clearAppBadge" in navigator) {
          await navigator.clearAppBadge();
        }
      } catch {
        // Badge API not supported
      }

      if (action === "dismiss") {
        return;
      }

      if (action === "open" && data.woId) {
        await openOrFocusClient(`/work-orders?id=${data.woId}`);
        return;
      }

      await openOrFocusClient(urlToOpen);
    })()
  );
});

self.addEventListener("notificationclose", (event) => {
  const tag = event.notification.tag;
  event.waitUntil(dismissNotification(tag));
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "CLEAR_BADGE") {
    if ("clearAppBadge" in navigator) {
      navigator.clearAppBadge().catch(() => {});
    }
  }
});

self.addEventListener("sync", (event) => {
  if (event.tag === "cmms-mobile-sync") {
    event.waitUntil(
      (async () => {
        const clients = await self.clients.matchAll({ type: "window" });
        for (const client of clients) {
          client.postMessage({ type: "SYNC_TRIGGERED" });
        }
      })()
    );
  }
});
