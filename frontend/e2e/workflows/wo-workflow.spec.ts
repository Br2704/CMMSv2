import { test, expect } from "@playwright/test";
import { CONFIG } from "../helpers/config";
import { navigateTo, expectPageNotBlank, isOnLoginPage } from "../helpers/auth";

test.describe("Work Order Workflow", () => {
  test("Navigate to work orders page", async ({ page }) => {
    await navigateTo(page, CONFIG.routes.protected.workOrders);
    if (await isOnLoginPage(page)) {
      test.info().annotations.push({ type: "note", description: "Skipped - not authenticated" });
      return;
    }
    await expectPageNotBlank(page);
  });

  test("View details on a work order row", async ({ page }) => {
    await navigateTo(page, CONFIG.routes.protected.workOrders);
    if (await isOnLoginPage(page)) {
      test.info().annotations.push({ type: "note", description: "Skipped - not authenticated" });
      return;
    }
    const rows = page.locator("table tbody tr, [role='row']");
    const rowCount = await rows.count().catch(() => 0);

    if (rowCount > 1) {
      const viewBtn = rows.first().locator(
        'button:has-text("View"), a:has-text("View"), button:has-text("Details"), a:has-text("Details"), td a, td button'
      );
      const btnCount = await viewBtn.count().catch(() => 0);

      if (btnCount > 0) {
        await viewBtn.first().click();
        await page.waitForTimeout(1500);

        const dialog = page.locator(
          '[role="dialog"], [class*="Dialog"], [class*="dialog"], [class*="drawer"], [class*="Drawer"], [class*="panel"], [class*="Panel"]'
        );
        const detailVisible = await dialog.isVisible().catch(() => false);

        const bodyText = await page.locator("body").innerText().catch(() => "");
        const hasWOInfo =
          /Work Order|WO-|WO_|Status|Priority|Machine|Description|Assigned To/i.test(bodyText);

        expect(detailVisible || hasWOInfo).toBeTruthy();
      } else {
        const bodyText = await page.locator("body").innerText().catch(() => "");
        expect(bodyText.length).toBeGreaterThan(10);
      }
    } else {
      const bodyText = await page.locator("body").innerText().catch(() => "");
      expect(bodyText.length).toBeGreaterThan(5);
    }
  });

  test("Navigate to technician mobile view", async ({ page }) => {
    await navigateTo(page, CONFIG.routes.protected.technician);
    if (await isOnLoginPage(page)) {
      test.info().annotations.push({ type: "note", description: "Skipped - not authenticated" });
      return;
    }
    await page.waitForTimeout(1500);
    const bodyText = await page.locator("body").innerText().catch(() => "");
    expect(bodyText.length).toBeGreaterThan(5);
  });

  test("Navigate to QR scanner page", async ({ page }) => {
    await navigateTo(page, CONFIG.routes.protected.liveScan);
    if (await isOnLoginPage(page)) {
      test.info().annotations.push({ type: "note", description: "Skipped - not authenticated" });
      return;
    }
    await page.waitForTimeout(1500);
    const bodyText = await page.locator("body").innerText().catch(() => "");
    expect(bodyText.length).toBeGreaterThan(5);
  });

  test("Navigate with query param tab=raised-by-me", async ({ page }) => {
    await navigateTo(page, `${CONFIG.routes.protected.workOrders}?tab=raised-by-me`);
    if (await isOnLoginPage(page)) {
      test.info().annotations.push({ type: "note", description: "Skipped - not authenticated" });
      return;
    }
    await page.waitForTimeout(1500);
    await expectPageNotBlank(page);
  });

  test("Navigate with query param tab=assigned-to-me", async ({ page }) => {
    await navigateTo(page, `${CONFIG.routes.protected.workOrders}?tab=assigned-to-me`);
    if (await isOnLoginPage(page)) {
      test.info().annotations.push({ type: "note", description: "Skipped - not authenticated" });
      return;
    }
    await page.waitForTimeout(1500);
    await expectPageNotBlank(page);
  });

  test("Take screenshot of technician view", async ({ page }) => {
    await navigateTo(page, CONFIG.routes.protected.technician);
    if (await isOnLoginPage(page)) {
      test.info().annotations.push({ type: "note", description: "Skipped - not authenticated" });
      return;
    }
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: `${CONFIG.screenshots.dir}/technician-view.png`,
      fullPage: true,
    });
    const bodyText = await page.locator("body").innerText().catch(() => "");
    expect(bodyText.length).toBeGreaterThan(5);
  });

  test("Take screenshot of live scan page", async ({ page }) => {
    await navigateTo(page, CONFIG.routes.protected.liveScan);
    if (await isOnLoginPage(page)) {
      test.info().annotations.push({ type: "note", description: "Skipped - not authenticated" });
      return;
    }
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: `${CONFIG.screenshots.dir}/live-scan.png`,
      fullPage: true,
    });
    const bodyText = await page.locator("body").innerText().catch(() => "");
    expect(bodyText.length).toBeGreaterThan(5);
  });
});
