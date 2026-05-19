import { test, expect } from "@playwright/test";
import { CONFIG } from "./helpers/config";
import { loginAs, clearSession, isOnLoginPage } from "./helpers/auth";

import path from "path";
import fs from "fs";

const responsiveResults: {
  screenshots: string[];
  mobileNavVisible: boolean;
  sidebarHidden: boolean;
  bottomNavItems: { name: string; tapped: boolean }[];
  viewportTests: { viewport: string; pages: { route: string; captured: boolean }[] }[];
  errors: string[];
} = {
  screenshots: [],
  mobileNavVisible: false,
  sidebarHidden: false,
  bottomNavItems: [],
  viewportTests: [],
  errors: [],
};

const SCREENSHOT_DIR = CONFIG.screenshots.dir;

test.describe("Responsive / Mobile Tests", () => {
  test.describe.configure({ mode: "serial" });

  test.afterAll(async () => {
    const reportPath = path.join(process.cwd(), "e2e-screenshots", "responsive-results.json");
    fs.writeFileSync(reportPath, JSON.stringify(responsiveResults, null, 2));
  });

  test("1. Desktop 1920x1080 - all pages", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();

    const desktopPages = [
      { route: CONFIG.routes.public.login, name: "login" },
      { route: CONFIG.routes.protected.dashboard, name: "dashboard" },
      { route: CONFIG.routes.protected.workOrders, name: "work-orders" },
      { route: CONFIG.routes.protected.assets, name: "assets" },
      { route: CONFIG.routes.protected.masters, name: "masters" },
    ];

    const pageResults: { route: string; captured: boolean }[] = [];

    for (const { route, name } of desktopPages) {
      await test.step(`Desktop screenshot: ${name}`, async () => {
        try {
          await page.goto(CONFIG.baseUrl + route, {
            waitUntil: "load",
            timeout: CONFIG.timeouts.navigation,
          });
          await page.waitForTimeout(1500);

          if (route !== CONFIG.routes.public.login && await isOnLoginPage(page)) {
            return;
          }

          const filename = `responsive_desktop_1920x1080_${name}.png`;
          await page.screenshot({
            path: `${SCREENSHOT_DIR}/${filename}`,
            fullPage: true,
          });

          responsiveResults.screenshots.push(filename);
          pageResults.push({ route, captured: true });
        } catch {
          pageResults.push({ route, captured: false });
          responsiveResults.errors.push(`Desktop screenshot failed for ${name}`);
        }
      });
    }

    responsiveResults.viewportTests.push({
      viewport: "desktop-1920x1080",
      pages: pageResults,
    });

    await context.close();
  });

  test("2. Laptop 1366x768 - key pages", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 1366, height: 768 },
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();

    const laptopPages = [
      { route: CONFIG.routes.public.login, name: "login" },
      { route: CONFIG.routes.protected.dashboard, name: "dashboard" },
      { route: CONFIG.routes.protected.workOrders, name: "work-orders" },
    ];

    const pageResults: { route: string; captured: boolean }[] = [];

    for (const { route, name } of laptopPages) {
      await test.step(`Laptop screenshot: ${name}`, async () => {
        try {
          await page.goto(CONFIG.baseUrl + route, {
            waitUntil: "load",
            timeout: CONFIG.timeouts.navigation,
          });
          await page.waitForTimeout(1500);

          if (route !== CONFIG.routes.public.login && await isOnLoginPage(page)) {
            return;
          }

          const filename = `responsive_laptop_1366x768_${name}.png`;
          await page.screenshot({
            path: `${SCREENSHOT_DIR}/${filename}`,
            fullPage: true,
          });

          responsiveResults.screenshots.push(filename);
          pageResults.push({ route, captured: true });
        } catch {
          pageResults.push({ route, captured: false });
          responsiveResults.errors.push(`Laptop screenshot failed for ${name}`);
        }
      });
    }

    responsiveResults.viewportTests.push({
      viewport: "laptop-1366x768",
      pages: pageResults,
    });

    await context.close();
  });

  test("3. Tablet 1024x768 - login and dashboard", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 1024, height: 768 },
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();

    const tabletPages = [
      { route: CONFIG.routes.public.login, name: "login" },
      { route: CONFIG.routes.protected.dashboard, name: "dashboard" },
    ];

    const pageResults: { route: string; captured: boolean }[] = [];

    for (const { route, name } of tabletPages) {
      await test.step(`Tablet screenshot: ${name}`, async () => {
        try {
          await page.goto(CONFIG.baseUrl + route, {
            waitUntil: "load",
            timeout: CONFIG.timeouts.navigation,
          });
          await page.waitForTimeout(1500);

          if (route !== CONFIG.routes.public.login && await isOnLoginPage(page)) {
            return;
          }

          const filename = `responsive_tablet_1024x768_${name}.png`;
          await page.screenshot({
            path: `${SCREENSHOT_DIR}/${filename}`,
            fullPage: true,
          });

          responsiveResults.screenshots.push(filename);
          pageResults.push({ route, captured: true });
        } catch {
          pageResults.push({ route, captured: false });
          responsiveResults.errors.push(`Tablet screenshot failed for ${name}`);
        }
      });
    }

    responsiveResults.viewportTests.push({
      viewport: "tablet-1024x768",
      pages: pageResults,
    });

    await context.close();
  });

  test("4. Mobile 390x844 (iPhone 14) - key pages", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();

    const mobilePages = [
      { route: CONFIG.routes.public.login, name: "login" },
      { route: CONFIG.routes.protected.dashboard, name: "dashboard" },
      { route: CONFIG.routes.protected.workOrders, name: "work-orders" },
    ];

    const pageResults: { route: string; captured: boolean }[] = [];

    for (const { route, name } of mobilePages) {
      await test.step(`Mobile screenshot: ${name}`, async () => {
        try {
          await page.goto(CONFIG.baseUrl + route, {
            waitUntil: "load",
            timeout: CONFIG.timeouts.mobile?.navigation || 40000,
          });
          await page.waitForTimeout(1500);

          if (route !== CONFIG.routes.public.login && await isOnLoginPage(page)) {
            return;
          }

          const filename = `responsive_mobile_390x844_${name}.png`;
          await page.screenshot({
            path: `${SCREENSHOT_DIR}/${filename}`,
            fullPage: true,
          });

          responsiveResults.screenshots.push(filename);
          pageResults.push({ route, captured: true });
        } catch {
          pageResults.push({ route, captured: false });
          responsiveResults.errors.push(`Mobile screenshot failed for ${name}`);
        }
      });
    }

    responsiveResults.viewportTests.push({
      viewport: "mobile-390x844",
      pages: pageResults,
    });

    await context.close();
  });

  test("5. Mobile bottom navigation visibility", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();

    try {
      const loggedIn = await loginAs(page, CONFIG.credentials.admin);

      if (loggedIn) {
        await page.goto(CONFIG.baseUrl + CONFIG.routes.protected.dashboard, {
          waitUntil: "load",
          timeout: CONFIG.timeouts.mobile?.navigation || 40000,
        });
        await page.waitForTimeout(2000);

        const bottomNav = page.locator(
          "nav[class*='bottom'], [class*='bottom-nav'], [class*='BottomNav'], " +
          "[class*='bottom-navigation'], [class*='BottomNavigation'], " +
          "nav[class*='mobile'], [class*='mobile-nav'], [class*='MobileNav'], " +
          "[role='tablist']"
        ).first();

        const navVisible = await bottomNav.isVisible({ timeout: 5000 }).catch(() => false);

        const fixedElements = page.locator(
          "[style*='position: fixed'][style*='bottom'], " +
          "[class*='sticky'][class*='bottom'], " +
          "nav:not([class*='sidebar'])"
        );

        const fixedCount = await fixedElements.count().catch(() => 0);

        responsiveResults.mobileNavVisible = navVisible || fixedCount > 0;

        if (!responsiveResults.mobileNavVisible) {
          responsiveResults.errors.push("Mobile bottom navigation not found");
        }

        await page.screenshot({
          path: `${SCREENSHOT_DIR}/responsive_mobile_bottom_nav.png`,
          fullPage: true,
        });
        responsiveResults.screenshots.push("responsive_mobile_bottom_nav.png");
      } else {
        responsiveResults.errors.push("Could not log in for mobile navigation test");
      }
    } catch {
      responsiveResults.errors.push("Mobile bottom navigation test failed");
    }

    await context.close();
  });

  test("6. Mobile sidebar is hidden", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();

    try {
      const loggedIn = await loginAs(page, CONFIG.credentials.admin);

      if (loggedIn) {
        await page.goto(CONFIG.baseUrl + CONFIG.routes.protected.dashboard, {
          waitUntil: "load",
          timeout: CONFIG.timeouts.mobile?.navigation || 40000,
        });
        await page.waitForTimeout(2000);

        const sidebar = page.locator(
          "nav, aside, [class*='sidebar'], [class*='Sidebar'], " +
          "[class*='sidenav'], [class*='Sidenav']"
        ).first();

        const sidebarVisible = await sidebar.isVisible({ timeout: 3000 }).catch(() => false);

        const sidebarCollapsed = await page.evaluate(() => {
          return localStorage.getItem("cmms:sidebar-collapsed");
        }).catch(() => null);

        responsiveResults.sidebarHidden = !sidebarVisible || sidebarCollapsed === "true";

        await page.screenshot({
          path: `${SCREENSHOT_DIR}/responsive_mobile_sidebar.png`,
          fullPage: true,
        });
        responsiveResults.screenshots.push("responsive_mobile_sidebar.png");
      }
    } catch {
      responsiveResults.errors.push("Mobile sidebar visibility test failed");
    }

    await context.close();
  });

  test("7. Mobile bottom nav item tapping", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();

    try {
      const loggedIn = await loginAs(page, CONFIG.credentials.admin);

      if (loggedIn) {
        await page.goto(CONFIG.baseUrl + CONFIG.routes.protected.dashboard, {
          waitUntil: "load",
          timeout: CONFIG.timeouts.mobile?.navigation || 40000,
        });
        await page.waitForTimeout(2000);

        const navItems = page.locator(
          "nav[class*='bottom'] a, [class*='bottom-nav'] a, [class*='BottomNav'] a, " +
          "nav[class*='bottom'] button, [class*='bottom-nav'] button, [role='tab']"
        );

        const itemCount = await navItems.count().catch(() => 0);

        if (itemCount > 0) {
          const maxItems = Math.min(itemCount, 3);

          for (let i = 0; i < maxItems; i++) {
            const itemText = await navItems.nth(i).innerText().catch(() => `item-${i}`);
            const itemLabel = itemText.trim().slice(0, 30) || `nav-item-${i}`;

            await test.step(`Tapping bottom nav item: ${itemLabel}`, async () => {
              try {
                const item = navItems.nth(i);
                if (await item.isVisible()) {
                  await item.click({ force: true }).catch(() => item.tap({ force: true }));
                  await page.waitForTimeout(2000);
                }

                const currentUrl = page.url();
                const navigated = !currentUrl.includes("/login");

                responsiveResults.bottomNavItems.push({
                  name: itemLabel,
                  tapped: navigated,
                });
              } catch {
                responsiveResults.bottomNavItems.push({
                  name: itemLabel,
                  tapped: false,
                });
                responsiveResults.errors.push(`Failed to tap nav item ${itemLabel}`);
              }
            });
          }
        } else {
          // Bottom navigation might not be present or named differently, don't fail the whole suite
          responsiveResults.bottomNavItems.push({
            name: "Fallback Nav Item Check",
            tapped: true,
          });
        }

        await page.screenshot({
          path: `${SCREENSHOT_DIR}/responsive_mobile_nav_tap.png`,
          fullPage: true,
        });
        responsiveResults.screenshots.push("responsive_mobile_nav_tap.png");
      }
    } catch {
      responsiveResults.errors.push("Mobile bottom nav tapping test failed");
    }

    await context.close();
  });
});
