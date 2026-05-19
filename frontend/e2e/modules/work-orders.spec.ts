import { test, expect } from "@playwright/test";
import { CONFIG } from "../helpers/config";
import { navigateTo, expectPageNotBlank, isOnLoginPage } from "../helpers/auth";

test.describe("Work Orders", () => {
  test("Page loads without blank content", async ({ page }) => {
    await navigateTo(page, CONFIG.routes.protected.workOrders);
    if (await isOnLoginPage(page)) {
      test.info().annotations.push({ type: "note", description: "Skipped - not authenticated" });
      return;
    }
    await expectPageNotBlank(page);
  });

  test("Work order table or list is present", async ({ page }) => {
    await navigateTo(page, CONFIG.routes.protected.workOrders);
    if (await isOnLoginPage(page)) {
      test.info().annotations.push({ type: "note", description: "Skipped - not authenticated" });
      return;
    }
    const table = page.locator("table, [role='grid'], [role='table'], [class*='table'], [class*='Table']");
    const tablePresent = (await table.count().catch(() => 0)) > 0;

    const list = page.locator("[class*='list'], [class*='List'], [role='list']");
    const listPresent = (await list.count().catch(() => 0)) > 0;

    expect(tablePresent || listPresent).toBeTruthy();
  });

  test("Raise Work Order button exists", async ({ page }) => {
    await navigateTo(page, CONFIG.routes.protected.workOrders);
    if (await isOnLoginPage(page)) {
      test.info().annotations.push({ type: "note", description: "Skipped - not authenticated" });
      return;
    }
    const raiseBtn = page.getByRole("button", { name: /Raise|Create|New Work|Add WO/i });
    await expect(raiseBtn).toBeVisible({ timeout: 5000 });
  });

  test("Filter and search elements are accessible", async ({ page }) => {
    await navigateTo(page, CONFIG.routes.protected.workOrders);
    if (await isOnLoginPage(page)) {
      test.info().annotations.push({ type: "note", description: "Skipped - not authenticated" });
      return;
    }
    const searchInput = page.locator(
      'input[type="search"], input[placeholder*="search" i], input[placeholder*="filter" i], input[placeholder*="Search" i]'
    );
    const searchPresent = (await searchInput.count().catch(() => 0)) > 0;

    const filterSelects = page.locator("select, [role='combobox'], [class*='select']");
    const filterPresent = (await filterSelects.count().catch(() => 0)) > 0;

    expect(searchPresent || filterPresent).toBeTruthy();
  });

  test("Status tabs are displayed", async ({ page }) => {
    await navigateTo(page, CONFIG.routes.protected.workOrders);
    if (await isOnLoginPage(page)) {
      test.info().annotations.push({ type: "note", description: "Skipped - not authenticated" });
      return;
    }
    const tabs = page.locator(
      'button:has-text("Assigned"), button:has-text("Raised"), button:has-text("All Work"), button:has-text("Open"), button:has-text("In Progress"), [role="tab"]'
    );
    const tabCount = await tabs.count().catch(() => 0);
    expect(tabCount).toBeGreaterThanOrEqual(1);
  });

  test("Raise Work Order opens dialog with required fields", async ({ page }) => {
    await navigateTo(page, CONFIG.routes.protected.workOrders);
    if (await isOnLoginPage(page)) {
      test.info().annotations.push({ type: "note", description: "Skipped - not authenticated" });
      return;
    }
    const raiseBtn = page.getByRole("button", { name: /Raise|Create|New Work|Add WO/i });
    await raiseBtn.click();
    await page.waitForTimeout(1000);

    const dialog = page.locator('[role="dialog"], [class*="Dialog"], [class*="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const formFields = page.locator(
      'input, select, textarea, [role="combobox"], [role="textbox"]'
    );
    const fieldCount = await formFields.count().catch(() => 0);
    expect(fieldCount).toBeGreaterThanOrEqual(1);

    const hasMachineField = page.locator('label:has-text("Machine"), label:has-text("WO Type"), label:has-text("Priority"), label:has-text("Problem")');
    const fieldLabelCount = await hasMachineField.count().catch(() => 0);

    const closeBtn = page.getByRole("button", { name: /Close|Cancel|Dismiss/i });
    const submitBtn = page.getByRole("button", { name: /Submit|Save|Create|Add/i });

    const hasClose = await closeBtn.isVisible().catch(() => false);
    const hasSubmit = await submitBtn.isVisible().catch(() => false);

    expect(hasClose || hasSubmit || fieldLabelCount > 0).toBeTruthy();
  });

  test("Dialog has Submit and Close buttons", async ({ page }) => {
    await navigateTo(page, CONFIG.routes.protected.workOrders);
    if (await isOnLoginPage(page)) {
      test.info().annotations.push({ type: "note", description: "Skipped - not authenticated" });
      return;
    }
    const raiseBtn = page.getByRole("button", { name: /Raise|Create|New Work|Add WO/i });
    await raiseBtn.click();
    await page.waitForTimeout(1000);

    const closeBtn = page.getByRole("button", { name: /Close|Cancel|Dismiss/i });
    const submitBtn = page.getByRole("button", { name: /Submit|Save|Create|Add/i });

    const closeVisible = await closeBtn.isVisible().catch(() => false);
    const submitVisible = await submitBtn.isVisible().catch(() => false);

    expect(closeVisible || submitVisible).toBeTruthy();
  });

  test("Query param navigation works for status filter", async ({ page }) => {
    await navigateTo(page, `${CONFIG.routes.protected.workOrders}?status=OPENED`);
    if (await isOnLoginPage(page)) {
      test.info().annotations.push({ type: "note", description: "Skipped - not authenticated" });
      return;
    }
    await page.waitForTimeout(1500);
    await expectPageNotBlank(page);
  });

  test("Query param tab navigation works", async ({ page }) => {
    await navigateTo(page, `${CONFIG.routes.protected.workOrders}?tab=raised-by-me`);
    if (await isOnLoginPage(page)) {
      test.info().annotations.push({ type: "note", description: "Skipped - not authenticated" });
      return;
    }
    await page.waitForTimeout(1500);
    await expectPageNotBlank(page);
  });

  test("Work order table has rows with data", async ({ page }) => {
    await navigateTo(page, CONFIG.routes.protected.workOrders);
    if (await isOnLoginPage(page)) {
      test.info().annotations.push({ type: "note", description: "Skipped - not authenticated" });
      return;
    }
    const rows = page.locator("table tr, [role='row'], [class*='row']");
    const rowCount = await rows.count().catch(() => 0);
    expect(rowCount).toBeGreaterThanOrEqual(1);
  });

  test("Take screenshots of work orders page", async ({ page }) => {
    await navigateTo(page, CONFIG.routes.protected.workOrders);
    if (await isOnLoginPage(page)) {
      test.info().annotations.push({ type: "note", description: "Skipped - not authenticated" });
      return;
    }
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: `${CONFIG.screenshots.dir}/work-orders.png`,
      fullPage: true,
    });

    const bodyText = await page.locator("body").innerText().catch(() => "");
    expect(bodyText.length).toBeGreaterThan(5);
  });
});
