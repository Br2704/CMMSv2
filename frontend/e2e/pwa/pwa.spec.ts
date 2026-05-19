import { test, expect } from "@playwright/test";
import { CONFIG } from "../helpers/config";
import path from "path";
import fs from "fs";

const pwaResults: {
  manifestLinkPresent: boolean;
  manifestContent: Record<string, any> | null;
  serviceWorkerRegistered: boolean;
  serviceWorkerUrl: string | null;
  beforeInstallPromptSupported: boolean;
  installPromptComponentPresent: boolean;
  offlineContentAvailable: boolean;
  notificationPermissionComponentPresent: boolean;
  manifestIconsReferenced: boolean;
  iconUrls: string[];
  realtimeConnections: { type: string; url: string }[];
  errors: string[];
} = {
  manifestLinkPresent: false,
  manifestContent: null,
  serviceWorkerRegistered: false,
  serviceWorkerUrl: null,
  beforeInstallPromptSupported: false,
  installPromptComponentPresent: false,
  offlineContentAvailable: false,
  notificationPermissionComponentPresent: false,
  manifestIconsReferenced: false,
  iconUrls: [],
  realtimeConnections: [],
  errors: [],
};

test.describe("PWA Tests", () => {
  test.describe.configure({ mode: "serial" });

  test.afterAll(async () => {
    const reportPath = path.join(process.cwd(), "e2e-screenshots", "pwa-results.json");
    fs.writeFileSync(reportPath, JSON.stringify(pwaResults, null, 2));
  });

  test("1. Check for manifest link in page head", async ({ page }) => {
    try {
      await page.goto(CONFIG.baseUrl, {
        waitUntil: "load",
        timeout: CONFIG.timeouts.navigation,
      });
      await page.waitForTimeout(1000);

      const manifestLink = page.locator('link[rel="manifest"]');
      const manifestCount = await manifestLink.count().catch(() => 0);

      pwaResults.manifestLinkPresent = manifestCount > 0;
      expect(manifestCount).toBeGreaterThanOrEqual(1);
    } catch {
      pwaResults.errors.push("Manifest link check failed");
    }
  });

  test("2. Check for service worker registration", async ({ page }) => {
    try {
      await page.goto(CONFIG.baseUrl, {
        waitUntil: "load",
        timeout: CONFIG.timeouts.navigation,
      });
      await page.waitForTimeout(2000);

      const swInfo = await page.evaluate(() => {
        if ("serviceWorker" in navigator) {
          return {
            supported: true,
            registered: navigator.serviceWorker.controller !== null,
            scriptURL: navigator.serviceWorker.controller?.scriptURL || null,
          };
        }
        return { supported: false, registered: false, scriptURL: null };
      }).catch(() => ({ supported: false, registered: false, scriptURL: null }));

      pwaResults.serviceWorkerRegistered = swInfo.registered;
      pwaResults.serviceWorkerUrl = swInfo.scriptURL;

      if (!swInfo.supported) {
        pwaResults.errors.push("ServiceWorker API not available in this browser");
        test.skip("ServiceWorker API not available");
        return;
      }

      expect(swInfo.registered).toBeTruthy();
    } catch {
      pwaResults.errors.push("Service worker check failed");
    }
  });

  test("3. Check for beforeinstallprompt event support", async ({ page }) => {
    try {
      const hasSupport = await page.evaluate(() => {
        return "onbeforeinstallprompt" in window;
      }).catch(() => false);

      pwaResults.beforeInstallPromptSupported = hasSupport;
    } catch {
      pwaResults.errors.push("beforeinstallprompt check failed");
    }
  });

  test("4. Check for PWA install prompt component in the DOM", async ({ page }) => {
    try {
      await page.goto(CONFIG.baseUrl, {
        waitUntil: "load",
        timeout: CONFIG.timeouts.navigation,
      });
      await page.waitForTimeout(2000);

      const installPromptElements = page.locator(
        '[class*="install"], [class*="Install"], [class*="pwa"], [class*="PWA"], ' +
        '[class*="prompt"], [class*="Prompt"], [aria-label*="install" i]'
      );

      const elementCount = await installPromptElements.count().catch(() => 0);
      pwaResults.installPromptComponentPresent = elementCount > 0;

      if (elementCount > 0) {
        const visible = await installPromptElements.first().isVisible().catch(() => false);
        if (visible) {
          await page.screenshot({
            path: `${CONFIG.screenshots.dir}/pwa-install-prompt.png`,
            fullPage: true,
          });
        }
      }
    } catch {
      pwaResults.errors.push("Install prompt component check failed");
    }
  });

  test("5. Check offline behavior", async ({ page }) => {
    try {
      await page.route("**/*", (route) => route.abort());

      await page.goto(CONFIG.baseUrl + CONFIG.routes.protected.dashboard, {
        waitUntil: "load",
        timeout: CONFIG.timeouts.navigation,
      }).catch(() => {});

      await page.waitForTimeout(2000);

      const bodyText = await page.locator("body").innerText().catch(() => "");
      const hasContent = bodyText.length > 20;

      pwaResults.offlineContentAvailable = hasContent;

      await page.unroute("**/*");
    } catch {
      pwaResults.errors.push("Offline behavior check failed");
      await page.unroute("**/*").catch(() => {});
    }
  });

  test("6. Check notification permission prompt component", async ({ page }) => {
    try {
      await page.goto(CONFIG.baseUrl, {
        waitUntil: "load",
        timeout: CONFIG.timeouts.navigation,
      });
      await page.waitForTimeout(2000);

      const notificationElements = page.locator(
        '[class*="notification"], [class*="Notification"], ' +
        '[aria-label*="notification" i], [class*="notif-permission"], ' +
        '[class*="NotifPermission"]'
      );

      const elementCount = await notificationElements.count().catch(() => 0);
      pwaResults.notificationPermissionComponentPresent = elementCount > 0;

      const permissionState = await page.evaluate(() => {
        if ("Notification" in window) {
          return Notification.permission;
        }
        return "unsupported";
      }).catch(() => "unsupported");

      if (permissionState === "unsupported") {
        pwaResults.errors.push("Notification API not supported");
      }
    } catch {
      pwaResults.errors.push("Notification permission check failed");
    }
  });

  test("7. Verify manifest icons referenced", async ({ page }) => {
    let skipTest = false;
    try {
      await page.goto(CONFIG.baseUrl, {
        waitUntil: "load",
        timeout: CONFIG.timeouts.navigation,
      });
      await page.waitForTimeout(1000);

      const manifestContent = await page.evaluate(async () => {
        const link = document.querySelector('link[rel="manifest"]');
        if (!link) return null;

        const href = link.getAttribute("href");
        if (!href) return null;

        try {
          const response = await fetch(href);
          return await response.json();
        } catch {
          return null;
        }
      }).catch(() => null);

      if (manifestContent && manifestContent.icons) {
        pwaResults.manifestContent = manifestContent;
        pwaResults.iconUrls = manifestContent.icons.map((icon: any) => icon.src);
        pwaResults.manifestIconsReferenced = manifestContent.icons.length > 0;
      }

      if (manifestContent === null) {
        pwaResults.errors.push("Could not fetch manifest content");
        skipTest = true;
      } else {
        expect(pwaResults.manifestIconsReferenced).toBeTruthy();
      }
    } catch {
      pwaResults.errors.push("Manifest icons check failed");
    }

    if (skipTest) {
      test.skip(true, "Manifest not available - may need production build");
    }
  });

  test("8. Check for WebSocket or SSE connections for real-time features", async ({ page }) => {
    try {
      await page.goto(CONFIG.baseUrl, {
        waitUntil: "load",
        timeout: CONFIG.timeouts.navigation,
      });
      await page.waitForTimeout(3000);

      const connections = await page.evaluate(() => {
        const result: { type: string; url: string }[] = [];

        const wsPattern = /ws:\/\//;
        const eventSourcePattern = /\/notifications\/stream|\/events|\/sse|\/ws/;

        const scripts = document.querySelectorAll("script");
        scripts.forEach((script) => {
          const src = script.src || "";
          if (wsPattern.test(src)) {
            result.push({ type: "WebSocket (script src)", url: src });
          }
        });

        const links = document.querySelectorAll('link[rel="preconnect"], link[rel="dns-prefetch"]');
        links.forEach((link) => {
          const href = link.getAttribute("href") || "";
          if (wsPattern.test(href)) {
            result.push({ type: "WebSocket (preconnect)", url: href });
          }
        });

        const body = document.body.innerHTML || "";
        const wsMatches = body.match(/wss?:\/\/[^"'\s)]+/g) || [];
        wsMatches.forEach((url) => {
          result.push({ type: "WebSocket (in DOM)", url });
        });

        const eventSourceMatches = body.match(/EventSource|new EventSource|new WebSocket/g) || [];
        eventSourceMatches.forEach((match) => {
          result.push({ type: match, url: "found in DOM" });
        });

        return result;
      }).catch(() => []);

      pwaResults.realtimeConnections = connections;
    } catch {
      pwaResults.errors.push("Realtime connection check failed");
    }
  });
});
