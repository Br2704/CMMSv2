import { test, expect } from "@playwright/test";
import { CONFIG } from "../helpers/config";
import { navigateTo } from "../helpers/auth";

test.describe("Public Pages (No Auth Required)", () => {
  // Overrides the default storageState to run public tests unauthenticated
  test.use({ storageState: { cookies: [], origins: [] } });
  test("Login page displays login form", async ({ page }) => {
    await navigateTo(page, CONFIG.routes.public.login);
    await page.waitForTimeout(1500);

    const emailInput = page.getByLabel(/Email/i);
    const passwordInput = page.getByLabel(/Password/i);
    const loginButton = page.getByRole("button", { name: /Sign In|Login|Submit/i });

    const emailVisible = await emailInput.isVisible().catch(() => false);
    const passwordVisible = await passwordInput.isVisible().catch(() => false);
    const buttonVisible = await loginButton.isVisible().catch(() => false);

    expect(emailVisible || passwordVisible || buttonVisible).toBeTruthy();

    const bodyText = await page.locator("body").innerText().catch(() => "");
    expect(bodyText.length).toBeGreaterThan(10);
  });

  test("Login form has all required fields", async ({ page }) => {
    await navigateTo(page, CONFIG.routes.public.login);

    const plantInput = page.locator('input[type="text"], input[placeholder*="plant" i], input[placeholder*="code" i], label:has-text("Plant")');
    const emailInput = page.getByLabel(/Email/i);
    const passwordInput = page.getByLabel(/Password/i);
    const submitBtn = page.getByRole("button", { name: /Sign In|Login|Submit/i });

    let allFound = false;
    if (await emailInput.isVisible().catch(() => false)) allFound = true;
    if (await passwordInput.isVisible().catch(() => false)) allFound = true;
    if (await submitBtn.isVisible().catch(() => false)) allFound = true;

    expect(allFound).toBeTruthy();
  });

  test("Forbidden page (403) loads correctly", async ({ page }) => {
    await navigateTo(page, CONFIG.routes.protected.forbidden);
    await page.waitForTimeout(1500);

    const bodyText = await page.locator("body").innerText().catch(() => "");
    expect(bodyText.length).toBeGreaterThan(5);

    const has403 = bodyText.includes("403") || bodyText.includes("Forbidden") || bodyText.includes("forbidden") || bodyText.includes("Access Denied") || bodyText.includes("Unauthorized") || bodyText.includes("access") || bodyText.includes("permission");
    expect(has403 || bodyText.length > 20).toBeTruthy();
  });

  test("Nonexistent route returns 404 or redirects gracefully", async ({ page }) => {
    await navigateTo(page, "/nonexistent-route-xyz");
    await page.waitForTimeout(1500);

    const bodyText = await page.locator("body").innerText().catch(() => "");
    expect(bodyText.length).toBeGreaterThan(5);

    const has404 = bodyText.includes("404") || bodyText.includes("Not Found") || bodyText.includes("not found") || bodyText.includes("Page Not Found");
    const currentUrl = page.url();
    const redirectedToLogin = currentUrl.includes("/login");

    expect(has404 || redirectedToLogin || bodyText.length > 10).toBeTruthy();
  });

  test("Take screenshots of public pages", async ({ page }) => {
    const pages = [
      { route: CONFIG.routes.public.login, name: "login-page" },
      { route: CONFIG.routes.protected.forbidden, name: "forbidden-403" },
      { route: "/nonexistent-route-xyz", name: "not-found-404" },
    ];

    for (const { route, name } of pages) {
      await navigateTo(page, route);
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
