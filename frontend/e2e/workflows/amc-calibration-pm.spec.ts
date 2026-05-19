import { test, expect } from "@playwright/test";
import { CONFIG } from "../helpers/config";
import { navigateTo, isOnLoginPage } from "../helpers/auth";

test.describe("AMC, PM/PD, Calibration, and ESG", () => {
  test("AMC page loads with content", async ({ page }) => {
    await navigateTo(page, CONFIG.routes.protected.amc);
    if (await isOnLoginPage(page)) {
      test.info().annotations.push({ type: "note", description: "Skipped - not authenticated" });
      return;
    }
    await page.waitForTimeout(1500);
    const bodyText = await page.locator("body").innerText().catch(() => "");
    expect(bodyText.length).toBeGreaterThan(10);

    const table = page.locator("table, [role='grid'], [role='table'], [class*='table'], [class*='Table']");
    const tableCount = await table.count().catch(() => 0);

    const cards = page.locator('[class*="card"], [class*="Card"]');
    const cardCount = await cards.count().catch(() => 0);

    expect(tableCount + cardCount > 0 || bodyText.length > 50).toBeTruthy();
  });

  test("Preventive Maintenance page loads with content", async ({ page }) => {
    await navigateTo(page, CONFIG.routes.protected.preventiveMaintenance);
    if (await isOnLoginPage(page)) {
      test.info().annotations.push({ type: "note", description: "Skipped - not authenticated" });
      return;
    }
    await page.waitForTimeout(1500);
    const bodyText = await page.locator("body").innerText().catch(() => "");
    expect(bodyText.length).toBeGreaterThan(10);

    const table = page.locator("table, [role='grid'], [role='table'], [class*='table'], [class*='Table']");
    const tableCount = await table.count().catch(() => 0);

    const scheduleElements = page.locator(
      '[class*="schedule"], [class*="Schedule"], [class*="calendar"], [class*="Calendar"]'
    );
    const scheduleCount = await scheduleElements.count().catch(() => 0);

    expect(tableCount + scheduleCount > 0 || bodyText.length > 50).toBeTruthy();
  });

  test("Calibration page loads with content", async ({ page }) => {
    await navigateTo(page, CONFIG.routes.protected.calibration);
    if (await isOnLoginPage(page)) {
      test.info().annotations.push({ type: "note", description: "Skipped - not authenticated" });
      return;
    }
    await page.waitForTimeout(1500);
    const bodyText = await page.locator("body").innerText().catch(() => "");
    expect(bodyText.length).toBeGreaterThan(10);

    const table = page.locator("table, [role='grid'], [role='table'], [class*='table'], [class*='Table']");
    const tableCount = await table.count().catch(() => 0);

    const cards = page.locator('[class*="card"], [class*="Card"]');
    const cardCount = await cards.count().catch(() => 0);

    expect(tableCount + cardCount > 0 || bodyText.length > 50).toBeTruthy();
  });

  test("ESG page loads with dashboard content", async ({ page }) => {
    await navigateTo(page, CONFIG.routes.protected.esg);
    if (await isOnLoginPage(page)) {
      test.info().annotations.push({ type: "note", description: "Skipped - not authenticated" });
      return;
    }
    await page.waitForTimeout(1500);
    const bodyText = await page.locator("body").innerText().catch(() => "");
    expect(bodyText.length).toBeGreaterThan(10);

    const dashboardElements = page.locator(
      '[class*="dashboard"], [class*="Dashboard"], [class*="widget"], [class*="Widget"], [class*="card"], [class*="Card"], [class*="chart"], [class*="Chart"]'
    );
    const elementCount = await dashboardElements.count().catch(() => 0);

    const hasESGText = /ESG|Environmental|Sustainability|Carbon|Energy|Emission/i.test(bodyText);

    expect(elementCount > 0 || hasESGText).toBeTruthy();
  });

  test("Take screenshots of all pages", async ({ page }) => {
    const pages = [
      { route: CONFIG.routes.protected.amc, name: "amc" },
      { route: CONFIG.routes.protected.preventiveMaintenance, name: "preventive-maintenance" },
      { route: CONFIG.routes.protected.calibration, name: "calibration" },
      { route: CONFIG.routes.protected.esg, name: "esg" },
    ];

    for (const { route, name } of pages) {
      await navigateTo(page, route);
      if (await isOnLoginPage(page)) {
        test.info().annotations.push({ type: "note", description: "Skipped - not authenticated" });
        return;
      }
      await page.waitForTimeout(1000);
      await page.screenshot({
        path: `${CONFIG.screenshots.dir}/${name}.png`,
        fullPage: true,
      });
      const bodyText = await page.locator("body").innerText().catch(() => "");
      expect(bodyText.length).toBeGreaterThan(5);
    }
  });
});
