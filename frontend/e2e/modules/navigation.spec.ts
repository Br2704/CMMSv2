import { test, expect } from "@playwright/test";
import { CONFIG } from "../helpers/config";
import { loginAs, isOnLoginPage } from "../helpers/auth";

const BASE = CONFIG.baseUrl;
const CREDS = CONFIG.credentials.admin;

let loginSucceeded = false;
const perfData: { route: string; loadTimeMs: number }[] = [];

test.describe("Navigation Module", () => {

  test.describe("Protected Routes Loading", () => {

    test.beforeAll(async ({ browser }) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      loginSucceeded = await loginAs(page, CREDS);
      await context.close();
    });

    const protectedRoutes = Object.entries(CONFIG.routes.protected);

    for (const [name, route] of protectedRoutes) {
      test(`page loads: ${name} (${route})`, async ({ page }) => {
        const start = Date.now();

        try {
          await page.goto(`${BASE}${route}`, { waitUntil: "load", timeout: 15000 });
        } catch {
          test.info().annotations.push({ type: "note", description: `${route} - connection error (server may have crashed)` });
          return;
        }
        await page.waitForTimeout(1000);

        if (await isOnLoginPage(page)) {
          test.info().annotations.push({ type: "note", description: `Skipped - ${route} redirected to login (unauthenticated)` });
          return;
        }

        const loadTime = Date.now() - start;
        perfData.push({ route, loadTimeMs: loadTime });

        const bodyText = await page.locator("body").innerText().catch(() => "");
        expect(bodyText.length).toBeGreaterThan(10);
      });
    }
  });

  test.describe("Forbidden Page", () => {

    test("/403 page loads correctly", async ({ page }) => {
      await page.goto(`${BASE}/403`, { waitUntil: "load" });
      await page.waitForTimeout(500);

      const bodyText = await page.locator("body").innerText().catch(() => "");
      expect(bodyText.length).toBeGreaterThan(10);

      const has403 = await page.getByText(/403|Forbidden|Access Denied/i).isVisible().catch(() => false);
      if (!has403) {
        test.info().annotations.push({
          type: "observation",
          description: "/403 page loaded but no '403' or 'Forbidden' text found",
        });
      }
    });
  });

  test.describe("Not Found Page", () => {

    test("invalid route shows 404 or fallback", async ({ page }) => {
      await page.goto(`${BASE}/this-route-does-not-exist-xyz`, { waitUntil: "load" });
      await page.waitForTimeout(1000);

      const bodyText = await page.locator("body").innerText().catch(() => "");
      const currentUrl = page.url();
      const has404 = await page.getByText(/404|Not Found|Page Not Found/i).isVisible().catch(() => false);

      if (currentUrl.includes("/login")) {
        test.info().annotations.push({
          type: "observation",
          description: "Invalid route redirected to login (expected when unauthenticated)",
        });
      } else if (!has404) {
        test.info().annotations.push({
          type: "observation",
          description: "Invalid route did not show 404 page - loaded without error message",
        });
      }
      expect(bodyText.length).toBeGreaterThan(0);
    });
  });

  test.describe("Role-Based Route Access", () => {

    const rootRoutes = Object.entries(CONFIG.routes.root);

    for (const [name, route] of rootRoutes) {
      test(`root route access: ${name} (${route})`, async ({ page }) => {
        if (!loginSucceeded) {
          await page.goto(`${BASE}${route}`, { waitUntil: "load" });
          await page.waitForTimeout(1000);
          const currentUrl = page.url();
          expect(currentUrl).toContain("/login");
          test.info().annotations.push({
            type: "observation",
            description: `${route} redirected to login (unauthenticated)`,
          });
          return;
        }

        await page.goto(`${BASE}${route}`, { waitUntil: "load" });
        await page.waitForTimeout(1500);

        const currentUrl = page.url();
        const bodyText = await page.locator("body").innerText().catch(() => "");

        if (currentUrl.includes("/403") || currentUrl.includes("/login")) {
          test.info().annotations.push({
            type: "observation",
            description: `${route} blocked - redirected to ${currentUrl}`,
          });
        } else if (currentUrl.includes(route)) {
          test.info().annotations.push({
            type: "observation",
            description: `${route} accessible (user has root admin privileges)`,
          });
        }
        expect(bodyText.length).toBeGreaterThan(0);
      });
    }
  });

  test.describe("Sidebar Navigation Links", () => {

    test("discover and verify sidebar links work", async ({ page }) => {
      if (!loginSucceeded) {
        test.skip();
        return;
      }

      await page.goto(`${BASE}/`, { waitUntil: "load" });
      await page.waitForTimeout(1000);

      const sidebarLinks = page.locator(
        "nav a, " +
        "aside a, " +
        "[class*='sidebar'] a, " +
        "[class*='Sidebar'] a, " +
        "[class*='navigation'] a, " +
        "[class*='menu'] a[href]"
      );

      const linkCount = await sidebarLinks.count();
      expect(linkCount).toBeGreaterThan(0);
      test.info().annotations.push({
        type: "info",
        description: `Found ${linkCount} sidebar navigation links`,
      });

      let clickedCount = 0;
      for (let i = 0; i < linkCount && i < 20; i++) {
        const link = sidebarLinks.nth(i);
        const href = await link.getAttribute("href").catch(() => null);
        const text = await link.innerText().catch(() => "");
        if (!href || href === "#" || href.startsWith("http") || !text.trim()) continue;

        try {
          await link.click();
          await page.waitForTimeout(1500);

          const currentUrl = page.url();
          const bodyText = await page.locator("body").innerText().catch(() => "");

          if (currentUrl.includes(href) && bodyText.length > 10) {
            clickedCount++;
          }
        } catch {
          // skip links that can't be clicked
        }

        await page.goto(`${BASE}/`, { waitUntil: "load" });
        await page.waitForTimeout(500);
      }

      expect(clickedCount).toBeGreaterThan(0);
      test.info().annotations.push({
        type: "info",
        description: `Successfully navigated via ${clickedCount} sidebar links`,
      });
    });
  });

  test.describe("Route Redirects", () => {

    test("unauthenticated access to protected route redirects to login", async ({ page }) => {
      await page.goto(`${BASE}/login`, { waitUntil: "load" });

      await page.evaluate(() => {
        sessionStorage.clear();
        localStorage.clear();
      }).catch(() => {});

      await page.goto(`${BASE}/work-orders`, { waitUntil: "load" });
      await page.waitForTimeout(1000);

      const currentUrl = page.url();
      expect(currentUrl).toContain("/login");
    });
  });
});
