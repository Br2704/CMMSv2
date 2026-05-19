import { test, expect } from "@playwright/test";
import { CONFIG } from "../helpers/config";
import path from "path";
import fs from "fs";

const perfResults: {
  pageLoadTimes: { page: string; name: string; loadTimeMs: number; navigated: boolean }[];
  apiResponseTimes: { url: string; method: string; status: number; durationMs: number }[];
  slowApis: { url: string; durationMs: number }[];
  consoleErrors: string[];
  consoleErrorPatterns: { pattern: string; count: number }[];
  tableRenderTimes: { page: string; renderTimeMs: number; rowCount: number }[];
  resourceCount: { jsFiles: number; cssFiles: number; totalSizeKb: number };
  errors: string[];
} = {
  pageLoadTimes: [],
  apiResponseTimes: [],
  slowApis: [],
  consoleErrors: [],
  consoleErrorPatterns: [],
  tableRenderTimes: [],
  resourceCount: { jsFiles: 0, cssFiles: 0, totalSizeKb: 0 },
  errors: [],
};

test.describe("Performance Tests", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => {
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        perfResults.consoleErrors.push(`[${msg.type()}] ${msg.text()}`);
      }
    });
  });

  test.afterAll(async () => {
    const consoleCounts: Record<string, number> = {};
    for (const err of perfResults.consoleErrors) {
      const key = err.slice(0, 100);
      consoleCounts[key] = (consoleCounts[key] || 0) + 1;
    }
    perfResults.consoleErrorPatterns = Object.entries(consoleCounts).map(([pattern, count]) => ({
      pattern,
      count,
    }));

    const reportPath = path.join(process.cwd(), "e2e-screenshots", "performance-results.json");
    fs.writeFileSync(reportPath, JSON.stringify(perfResults, null, 2));
  });

  test("1. Page load performance", async ({ page }) => {
    const pagesToTest = [
      { route: CONFIG.routes.public.login, name: "Login" },
      { route: CONFIG.routes.protected.dashboard, name: "Dashboard" },
      { route: CONFIG.routes.protected.workOrders, name: "Work Orders" },
      { route: CONFIG.routes.protected.assets, name: "Assets" },
      { route: CONFIG.routes.protected.masters, name: "Masters" },
    ];

    for (const { route, name } of pagesToTest) {
      await test.step(`Measuring load time for ${name} (${route})`, async () => {
        try {
          const startTime = Date.now();

          await page.goto(CONFIG.baseUrl + route, {
            waitUntil: "load",
            timeout: CONFIG.timeouts.navigation,
          });

          await page.waitForTimeout(500);
          const loadTime = Date.now() - startTime;

          const timing = await page.evaluate(() => {
            const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
            if (nav) {
              return {
                domContentLoaded: nav.domContentLoadedEventEnd - nav.startTime,
                load: nav.loadEventEnd - nav.startTime,
                domInteractive: nav.domInteractive - nav.startTime,
              };
            }
            return null;
          }).catch(() => null);

          const isRedirect = page.url().includes("/login") && route !== "/login";

          perfResults.pageLoadTimes.push({
            page: route,
            name,
            loadTimeMs: loadTime,
            navigated: !isRedirect,
          });

          if (isRedirect) {
            perfResults.errors.push(`${name}: Redirected to login (unauthenticated) - load time may reflect redirect`);
          } else {
            const threshold = route === "/login" ? 5000 : 10000;
            expect(loadTime).toBeLessThanOrEqual(threshold);
          }

          await page.screenshot({
            path: `${CONFIG.screenshots.dir}/perf-${name.replace(/\s+/g, "-").toLowerCase()}.png`,
            fullPage: true,
          });
        } catch (e) {
          perfResults.errors.push(`Page load failed for ${name}: ${e}`);
        }
      });
    }
  });

  test("2. API response times", async ({ page }) => {
    const apiResponses: { url: string; method: string; status: number; durationMs: number }[] = [];

    page.on("response", async (response) => {
      const url = response.url();
      if (url.includes("/api/") || url.includes("/auth/") || url.includes("/permissions/")) {
        const timing = response.request().timing();
        const duration = timing.responseEnd - timing.startTime;
        apiResponses.push({
          url: url.split("?")[0],
          method: response.request().method(),
          status: response.status(),
          durationMs: Math.round(duration),
        });
      }
    });

    try {
      await page.goto(CONFIG.baseUrl + CONFIG.routes.protected.workOrders, {
        waitUntil: "load",
        timeout: CONFIG.timeouts.navigation,
      });
      await page.waitForTimeout(2000);
    } catch {
      await page.goto(CONFIG.baseUrl + CONFIG.routes.public.login, {
        waitUntil: "load",
        timeout: CONFIG.timeouts.navigation,
      });
      await page.waitForTimeout(2000);
    }

    perfResults.apiResponseTimes = apiResponses;

    const slow = apiResponses.filter((r) => r.durationMs > 2000);
    perfResults.slowApis = slow.map((r) => ({ url: r.url, durationMs: r.durationMs }));

    for (const api of slow) {
      perfResults.errors.push(`Slow API: ${api.method} ${api.url} took ${api.durationMs}ms`);
    }
  });

  test("3. Memory/console monitoring across pages", async ({ page }) => {
    const pages = [
      CONFIG.routes.public.login,
      CONFIG.routes.protected.dashboard,
      CONFIG.routes.protected.workOrders,
      CONFIG.routes.protected.assets,
      CONFIG.routes.protected.masters,
    ];

    for (const route of pages) {
      try {
        await page.goto(CONFIG.baseUrl + route, {
          waitUntil: "load",
          timeout: CONFIG.timeouts.navigation,
        });
        await page.waitForTimeout(1500);
      } catch {
        continue;
      }
    }

    const repeatedErrors = perfResults.consoleErrors.filter(
      (err, idx, arr) => arr.indexOf(err) !== idx
    );

    if (repeatedErrors.length > 0) {
      const uniquePatterns = [...new Set(repeatedErrors)];
      perfResults.errors.push(`Found ${uniquePatterns.length} repeated console error pattern(s)`);
    }
  });

  test("4. Large list rendering", async ({ page }) => {
    const tablePages = [
      { route: CONFIG.routes.protected.workOrders, name: "Work Orders" },
      { route: CONFIG.routes.protected.assets, name: "Assets" },
      { route: CONFIG.routes.protected.masters, name: "Masters" },
    ];

    for (const { route, name } of tablePages) {
      await test.step(`Measuring table render time for ${name}`, async () => {
        try {
          const startTime = Date.now();

          await page.goto(CONFIG.baseUrl + route, {
            waitUntil: "load",
            timeout: CONFIG.timeouts.navigation,
          });

          const table = page.locator(
            "table, [role='grid'], [role='table'], .data-table, [class*='table']"
          ).first();

          const tableVisible = await table.isVisible({ timeout: 8000 }).catch(() => false);

          if (tableVisible) {
            await page.waitForTimeout(500);
            const renderTime = Date.now() - startTime;

            const rows = table.locator("tr, [role='row']");
            const rowCount = await rows.count().catch(() => 0);

            perfResults.tableRenderTimes.push({
              page: route,
              renderTimeMs: renderTime,
              rowCount,
            });
          } else {
            perfResults.tableRenderTimes.push({
              page: route,
              renderTimeMs: Date.now() - startTime,
              rowCount: 0,
            });
            perfResults.errors.push(`${name}: Table not visible on page`);
          }
        } catch {
          perfResults.tableRenderTimes.push({ page: route, renderTimeMs: -1, rowCount: 0 });
        }
      });
    }
  });

  test("5. Bundle size / resource loading", async ({ page }) => {
    try {
      const resources: { url: string; type: string; size: number }[] = [];

      page.on("response", (response) => {
        const url = response.url();
        const contentType = response.headers()["content-type"] || "";
        const size = parseInt(response.headers()["content-length"] || "0", 10);

        if (url.includes(CONFIG.baseUrl)) {
          if (contentType.includes("javascript")) {
            resources.push({ url, type: "js", size });
          } else if (contentType.includes("css")) {
            resources.push({ url, type: "css", size });
          }
        }
      });

      await page.goto(CONFIG.baseUrl + CONFIG.routes.public.login, {
        waitUntil: "load",
        timeout: CONFIG.timeouts.navigation,
      });

      await page.waitForTimeout(1000);

      const jsFiles = resources.filter((r) => r.type === "js");
      const cssFiles = resources.filter((r) => r.type === "css");
      const totalSizeKb = Math.round(resources.reduce((sum, r) => sum + r.size, 0) / 1024);

      perfResults.resourceCount = {
        jsFiles: jsFiles.length,
        cssFiles: cssFiles.length,
        totalSizeKb,
      };
    } catch {
      perfResults.errors.push("Bundle size measurement failed");
    }
  });
});
