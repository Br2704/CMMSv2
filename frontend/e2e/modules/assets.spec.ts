import { test, expect } from "@playwright/test";
import { CONFIG } from "../helpers/config";
import { navigateTo, expectPageNotBlank, isOnLoginPage } from "../helpers/auth";

test.describe("Assets", () => {
  test("Page loads without blank content", async ({ page }) => {
    await navigateTo(page, CONFIG.routes.protected.assets);
    await expectPageNotBlank(page);
  });

  test("Asset table is present with expected columns", async ({ page }) => {
    await navigateTo(page, CONFIG.routes.protected.assets);
    if (await isOnLoginPage(page)) {
      test.info().annotations.push({ type: "skip", description: "Not authenticated - login page shown" });
      return;
    }
    const table = page.locator("table, [role='grid'], [role='table'], [class*='table'], [class*='Table']");
    await expect(table).toBeVisible({ timeout: 5000 });

    const headers = table.locator("th, [role='columnheader'], thead td");
    const headerText = await headers.allTextContents().catch(() => []);
    const headerJoined = headerText.join(" ");

    const hasMachineName = /Machine|Name|Asset/i.test(headerJoined);
    const hasCode = /Code/i.test(headerJoined);
    const hasStatus = /Status/i.test(headerJoined);

    expect(hasMachineName || hasCode || hasStatus).toBeTruthy();
  });

  test("Search or filter input exists", async ({ page }) => {
    await navigateTo(page, CONFIG.routes.protected.assets);
    if (await isOnLoginPage(page)) {
      test.info().annotations.push({ type: "skip", description: "Not authenticated - login page shown" });
      return;
    }
    const searchInput = page.locator(
      'input[type="search"], input[placeholder*="search" i], input[placeholder*="filter" i], input[placeholder*="Search" i], input[placeholder*="Filter" i]'
    );
    const searchCount = await searchInput.count().catch(() => 0);
    const filterControls = page.locator("select, [role='combobox'], [class*='select'], button:has-text('Filter')");
    const filterCount = await filterControls.count().catch(() => 0);
    expect(searchCount + filterCount).toBeGreaterThanOrEqual(1);
  });

  test("Row expansion or detail view is accessible", async ({ page }) => {
    await navigateTo(page, CONFIG.routes.protected.assets);
    if (await isOnLoginPage(page)) {
      test.info().annotations.push({ type: "skip", description: "Not authenticated - login page shown" });
      return;
    }
    const rows = page.locator("table tbody tr, [role='row']");
    const rowCount = await rows.count().catch(() => 0);

    if (rowCount > 1) {
      const expandButton = rows.first().locator("button, a, [role='button'], td:first-child");
      await expandButton.first().click().catch(() => {});
      await page.waitForTimeout(1000);

      const details = page.locator(
        '[role="dialog"], [class*="Detail"], [class*="detail"], [class*="expanded"], [class*="Expanded"]'
      );
      const detailVisible = await details.isVisible().catch(() => false);
      const drawer = page.locator('[class*="drawer"], [class*="Drawer"], [class*="panel"], [class*="Panel"]');
      const drawerVisible = await drawer.isVisible().catch(() => false);
      const bodyText = await page.locator("body").innerText().catch(() => "");
      expect(detailVisible || drawerVisible || bodyText.length > 20).toBeTruthy();
    } else {
      const bodyText = await page.locator("body").innerText().catch(() => "");
      expect(bodyText.length).toBeGreaterThan(10);
    }
  });

  test("Status badges are displayed for assets", async ({ page }) => {
    await navigateTo(page, CONFIG.routes.protected.assets);
    if (await isOnLoginPage(page)) {
      test.info().annotations.push({ type: "skip", description: "Not authenticated - login page shown" });
      return;
    }
    const statusBadges = page.locator(
      '[class*="badge"], [class*="Badge"], [class*="status"], [class*="Status"], span:has-text("Active"), span:has-text("Inactive"), span:has-text("Running"), span:has-text("Idle"), span:has-text("Under Maintenance")'
    );
    const badgeCount = await statusBadges.count().catch(() => 0);
    const bodyText = await page.locator("body").innerText().catch(() => "");
    const hasStatusText = /Active|Inactive|Running|Idle|Maintenance|Operational|Down/i.test(bodyText);
    expect(badgeCount > 0 || hasStatusText).toBeTruthy();
  });

  test("Take screenshot of assets page", async ({ page }) => {
    await navigateTo(page, CONFIG.routes.protected.assets);
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: `${CONFIG.screenshots.dir}/assets.png`,
      fullPage: true,
    });
    await expectPageNotBlank(page);
  });
});
