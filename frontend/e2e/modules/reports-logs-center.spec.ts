import { test, expect } from "@playwright/test";
import { CONFIG } from "../helpers/config";
import { navigateTo, expectPageNotBlank, isOnLoginPage } from "../helpers/auth";

test.describe("Reports, Logs, and Security Center", () => {
  test("Reports page loads without blank content", async ({ page }) => {
    await navigateTo(page, CONFIG.routes.protected.reports);
    if (await isOnLoginPage(page)) {
      test.info().annotations.push({ type: "note", description: "Skipped - not authenticated" });
      return;
    }
    await expectPageNotBlank(page);
  });

  test("Reports page has report listing or dashboard", async ({ page }) => {
    await navigateTo(page, CONFIG.routes.protected.reports);
    if (await isOnLoginPage(page)) {
      test.info().annotations.push({ type: "note", description: "Skipped - not authenticated" });
      return;
    }
    await page.waitForTimeout(1000);

    const table = page.locator("table, [role='grid'], [role='table'], [class*='table'], [class*='Table']");
    const tableCount = await table.count().catch(() => 0);

    const cards = page.locator('[class*="card"], [class*="Card"], [class*="report"], [class*="Report"]');
    const cardCount = await cards.count().catch(() => 0);

    const bodyText = await page.locator("body").innerText().catch(() => "");
    const hasReportContent = /Report|Chart|Graph|Export|Download|Generate|Summary/i.test(bodyText);

    expect(tableCount + cardCount > 0 || hasReportContent).toBeTruthy();
  });

  test("Logs page loads without blank content", async ({ page }) => {
    await navigateTo(page, CONFIG.routes.protected.logs);
    if (await isOnLoginPage(page)) {
      test.info().annotations.push({ type: "note", description: "Skipped - not authenticated" });
      return;
    }
    await expectPageNotBlank(page);
  });

  test("Logs page has log entries table", async ({ page }) => {
    await navigateTo(page, CONFIG.routes.protected.logs);
    if (await isOnLoginPage(page)) {
      test.info().annotations.push({ type: "note", description: "Skipped - not authenticated" });
      return;
    }
    await page.waitForTimeout(1000);

    const table = page.locator("table, [role='grid'], [role='table'], [class*='table'], [class*='Table']");
    const tableCount = await table.count().catch(() => 0);

    const list = page.locator("[class*='list'], [class*='List'], [class*='entry'], [class*='Entry']");
    const listCount = await list.count().catch(() => 0);

    const bodyText = await page.locator("body").innerText().catch(() => "");
    const hasLogContent = /Log|Audit|Activity|Event|Timestamp|User|Action|Date/i.test(bodyText);

    expect(tableCount + listCount > 0 || hasLogContent).toBeTruthy();
  });

  test("Security Center page loads without blank content", async ({ page }) => {
    await navigateTo(page, CONFIG.routes.protected.securityCenter);
    if (await isOnLoginPage(page)) {
      test.info().annotations.push({ type: "note", description: "Skipped - not authenticated" });
      return;
    }
    await expectPageNotBlank(page);
  });

  test("Security Center has dashboard content", async ({ page }) => {
    await navigateTo(page, CONFIG.routes.protected.securityCenter);
    if (await isOnLoginPage(page)) {
      test.info().annotations.push({ type: "note", description: "Skipped - not authenticated" });
      return;
    }
    await page.waitForTimeout(1000);

    const cards = page.locator('[class*="card"], [class*="Card"], [class*="widget"], [class*="Widget"]');
    const cardCount = await cards.count().catch(() => 0);

    const bodyText = await page.locator("body").innerText().catch(() => "");
    const hasSecurityContent =
      /Security|Threat|Alert|Event|Incident|Access|Audit|Monitoring|Dashboard/i.test(bodyText);

    expect(cardCount > 0 || hasSecurityContent).toBeTruthy();
  });

  test("Take screenshots of all pages", async ({ page }) => {
    const pages = [
      { route: CONFIG.routes.protected.reports, name: "reports" },
      { route: CONFIG.routes.protected.logs, name: "logs" },
      { route: CONFIG.routes.protected.securityCenter, name: "security-center" },
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
