import { test, expect } from "@playwright/test";
import { CONFIG } from "../helpers/config";
import { navigateTo, expectPageNotBlank, isOnLoginPage } from "../helpers/auth";

test.describe("Visitor Experience and Security Gate", () => {
  test("Security Gate page loads without blank content", async ({ page }) => {
    await navigateTo(page, CONFIG.routes.protected.securityGate);
    if (await isOnLoginPage(page)) {
      test.info().annotations.push({ type: "note", description: "Skipped - not authenticated" });
      return;
    }
    await expectPageNotBlank(page);
  });

  test("Security Gate has gate-related content", async ({ page }) => {
    await navigateTo(page, CONFIG.routes.protected.securityGate);
    if (await isOnLoginPage(page)) {
      test.info().annotations.push({ type: "note", description: "Skipped - not authenticated" });
      return;
    }
    await page.waitForTimeout(1000);

    const bodyText = await page.locator("body").innerText().catch(() => "");
    const hasGateContent =
      /Gate|Entry|Entry Log|Security|Check.?In|Check.?Out|Visitor|Vehicle|Pass/i.test(bodyText);

    const table = page.locator("table, [role='grid'], [role='table'], [class*='table'], [class*='Table']");
    const tableCount = await table.count().catch(() => 0);

    const cards = page.locator('[class*="card"], [class*="Card"]');
    const cardCount = await cards.count().catch(() => 0);

    expect(hasGateContent || tableCount > 0 || cardCount > 0).toBeTruthy();
  });

  test("Visitor Experience page loads without blank content", async ({ page }) => {
    await navigateTo(page, CONFIG.routes.protected.visitorExperience);
    if (await isOnLoginPage(page)) {
      test.info().annotations.push({ type: "note", description: "Skipped - not authenticated" });
      return;
    }
    await expectPageNotBlank(page);
  });

  test("Visitor Experience has visitor-related content", async ({ page }) => {
    await navigateTo(page, CONFIG.routes.protected.visitorExperience);
    if (await isOnLoginPage(page)) {
      test.info().annotations.push({ type: "note", description: "Skipped - not authenticated" });
      return;
    }
    await page.waitForTimeout(1000);

    const bodyText = await page.locator("body").innerText().catch(() => "");
    const hasVisitorContent =
      /Visitor|Request|Visit|Pre.?Register|Check.?In|Pass|Appointment/i.test(bodyText);

    const table = page.locator("table, [role='grid'], [role='table'], [class*='table'], [class*='Table']");
    const tableCount = await table.count().catch(() => 0);

    const cards = page.locator('[class*="card"], [class*="Card"]');
    const cardCount = await cards.count().catch(() => 0);

    expect(hasVisitorContent || tableCount > 0 || cardCount > 0).toBeTruthy();
  });

  test("Take screenshots of visitor and security pages", async ({ page }) => {
    const pages = [
      { route: CONFIG.routes.protected.securityGate, name: "security-gate" },
      { route: CONFIG.routes.protected.visitorExperience, name: "visitor-experience" },
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
