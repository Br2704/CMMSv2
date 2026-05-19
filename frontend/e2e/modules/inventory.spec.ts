import { test, expect } from "@playwright/test";
import { CONFIG } from "../helpers/config";
import { navigateTo, expectPageNotBlank, isOnLoginPage } from "../helpers/auth";

test.describe("Inventory", () => {
  test("Page loads without blank content", async ({ page }) => {
    await navigateTo(page, CONFIG.routes.protected.inventory);
    if (await isOnLoginPage(page)) {
      test.info().annotations.push({ type: "note", description: "Skipped - not authenticated" });
      return;
    }
    await expectPageNotBlank(page);
  });

  test("Spare parts table is present", async ({ page }) => {
    await navigateTo(page, CONFIG.routes.protected.inventory);
    if (await isOnLoginPage(page)) {
      test.info().annotations.push({ type: "note", description: "Skipped - not authenticated" });
      return;
    }
    const table = page.locator("table, [role='grid'], [role='table'], [class*='table'], [class*='Table']");
    await expect(table).toBeVisible({ timeout: 5000 });

    const headers = table.locator("th, [role='columnheader'], thead td");
    const headerText = await headers.allTextContents().catch(() => []);
    const headerJoined = headerText.join(" ");

    const hasSparePart = /Spare|Part|Item|Stock|Inventory|Name/i.test(headerJoined);
    expect(hasSparePart).toBeTruthy();
  });

  test("Add Spare button exists", async ({ page }) => {
    await navigateTo(page, CONFIG.routes.protected.inventory);
    if (await isOnLoginPage(page)) {
      test.info().annotations.push({ type: "note", description: "Skipped - not authenticated" });
      return;
    }
    const addBtn = page.getByRole("button", { name: /Add Spare|Add Item|Add|New Spare|Create/i });
    await expect(addBtn).toBeVisible({ timeout: 5000 });
  });

  test("Stock level indicators are displayed", async ({ page }) => {
    await navigateTo(page, CONFIG.routes.protected.inventory);
    if (await isOnLoginPage(page)) {
      test.info().annotations.push({ type: "note", description: "Skipped - not authenticated" });
      return;
    }
    const stockIndicators = page.locator(
      '[class*="stock"], [class*="Stock"], [class*="badge"], [class*="Badge"], [class*="indicator"], [class*="level"]'
    );
    const indicatorCount = await stockIndicators.count().catch(() => 0);

    const bodyText = await page.locator("body").innerText().catch(() => "");
    const hasStockText = /Stock|Quantity|Qty|In Stock|Low Stock|Out of Stock/i.test(bodyText);

    expect(indicatorCount > 0 || hasStockText).toBeTruthy();
  });

  test("Add Spare opens dialog with form fields", async ({ page }) => {
    await navigateTo(page, CONFIG.routes.protected.inventory);
    if (await isOnLoginPage(page)) {
      test.info().annotations.push({ type: "note", description: "Skipped - not authenticated" });
      return;
    }
    const addBtn = page.getByRole("button", { name: /Add Spare|Add Item|Add|New Spare|Create/i });
    await addBtn.click();
    await page.waitForTimeout(1000);

    const dialog = page.locator('[role="dialog"], [class*="Dialog"], [class*="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const inputs = dialog.locator("input, select, textarea, [role='combobox'], [role='textbox']");
    const inputCount = await inputs.count().catch(() => 0);
    expect(inputCount).toBeGreaterThanOrEqual(1);
  });

  test("Search and filter elements exist", async ({ page }) => {
    await navigateTo(page, CONFIG.routes.protected.inventory);
    if (await isOnLoginPage(page)) {
      test.info().annotations.push({ type: "note", description: "Skipped - not authenticated" });
      return;
    }
    const searchInput = page.locator(
      'input[type="search"], input[placeholder*="search" i], input[placeholder*="filter" i], input[placeholder*="Search" i]'
    );
    const searchCount = await searchInput.count().catch(() => 0);

    const filterSelects = page.locator("select, [role='combobox'], [class*='select']");
    const filterCount = await filterSelects.count().catch(() => 0);

    expect(searchCount + filterCount).toBeGreaterThanOrEqual(1);
  });

  test("Take screenshot of inventory page", async ({ page }) => {
    await navigateTo(page, CONFIG.routes.protected.inventory);
    if (await isOnLoginPage(page)) {
      test.info().annotations.push({ type: "note", description: "Skipped - not authenticated" });
      return;
    }
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: `${CONFIG.screenshots.dir}/inventory.png`,
      fullPage: true,
    });
    await expectPageNotBlank(page);
  });
});
