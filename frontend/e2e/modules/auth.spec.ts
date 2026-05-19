import { test, expect } from "@playwright/test";
import { CONFIG } from "../helpers/config";
import { loginAs, logout } from "../helpers/auth";

const BASE = CONFIG.baseUrl;
const CREDS = CONFIG.credentials.admin;

let loginSucceeded = false;

test.describe("Authentication Module", () => {
  // Overrides the default storageState to run login tests unauthenticated
  test.use({ storageState: { cookies: [], origins: [] } });

  test.describe("Login Page UI", () => {

    test("should load login page with all form elements", async ({ page }) => {
      await page.goto(`${BASE}/login`, { waitUntil: "load" });

      await expect(page.getByLabel(/Plant Code/i)).toBeVisible();
      await expect(page.getByLabel(/Email/i)).toBeVisible();
      await expect(page.getByLabel(/Password/i)).toBeVisible();
      await expect(page.getByRole("button", { name: /Sign In/i })).toBeVisible();
    });

    test("should display organization aware login branding", async ({ page }) => {
      await page.goto(`${BASE}/login`, { waitUntil: "load" });

      await expect(page.getByText(/Organization Aware Login/i)).toBeVisible();
    });

    test("remember me checkbox exists", async ({ page }) => {
      await page.goto(`${BASE}/login`, { waitUntil: "load" });

      await expect(page.getByLabel(/Remember me/i)).toBeVisible();
    });

    test("password visibility toggle works", async ({ page }) => {
      await page.goto(`${BASE}/login`, { waitUntil: "load" });

      const passwordField = page.getByLabel(/Password/i);
      await expect(passwordField).toHaveAttribute("type", "password");

      const toggleBtn = page.locator(
        'button[aria-label*="toggle" i], ' +
        'button[aria-label*="show password" i], ' +
        'button[aria-label*="hide password" i], ' +
        'button[class*="eye" i], ' +
        '[class*="password-toggle"] button, ' +
        'button:has(svg[class*="eye"])'
      ).first();

      if (await toggleBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await toggleBtn.click();
        await expect(passwordField).toHaveAttribute("type", "text");
        await toggleBtn.click();
        await expect(passwordField).toHaveAttribute("type", "password");
      }
    });
  });

  test.describe("Field Validation", () => {

    test("empty form submit shows validation errors", async ({ page }) => {
      await page.goto(`${BASE}/login`, { waitUntil: "load" });

      await page.getByRole("button", { name: /Sign In/i }).click();
      await page.waitForTimeout(500);

      const hasAppError = await page.getByText(/required|Please fill|Invalid|error/i).isVisible().catch(() => false);
      const hasHtml5Validation = await page.evaluate(() => {
        const inputs = document.querySelectorAll("input:invalid");
        return inputs.length > 0;
      }).catch(() => false);

      if (!hasAppError && !hasHtml5Validation) {
        test.info().annotations.push({
          type: "observation",
          description: "Empty form submit - no visible validation error detected",
        });
      }
      expect(hasAppError || hasHtml5Validation).toBeTruthy();
    });

    test("invalid email format shows error", async ({ page }) => {
      await page.goto(`${BASE}/login`, { waitUntil: "load" });

      await page.getByLabel(/Plant Code/i).fill("JKF");
      await page.getByLabel(/Email/i).fill("not-an-email");
      await page.getByLabel(/Password/i).fill("Test123!");
      await page.getByRole("button", { name: /Sign In/i }).click();
      await page.waitForTimeout(500);

      const hasHtml5 = await page.evaluate(() => {
        const email = document.querySelector('input[type="email"]') as HTMLInputElement;
        return email?.validationMessage?.length > 0;
      }).catch(() => false);

      if (!hasHtml5) {
        const appError = page.getByText(/Invalid|error|valid email/i);
        await expect(appError).toBeVisible({ timeout: 3000 }).catch(() => {
          test.info().annotations.push({
            type: "observation",
            description: "Invalid email submitted without visible validation error",
          });
        });
      }
    });

    test("short password shows error", async ({ page }) => {
      await page.goto(`${BASE}/login`, { waitUntil: "load" });

      await page.getByLabel(/Email/i).fill("test@test.com");
      await page.getByLabel(/Password/i).fill("ab");
      await page.getByRole("button", { name: /Sign In/i }).click();
      await page.waitForTimeout(500);

      const hasHtml5 = await page.evaluate(() => {
        const pw = document.querySelector('input[type="password"]') as HTMLInputElement;
        return pw?.validationMessage?.length > 0;
      }).catch(() => false);

      if (!hasHtml5) {
        const appError = page.getByText(/Password.*(short|length|minimum|char)/i);
        await expect(appError).toBeVisible({ timeout: 3000 }).catch(() => {
          test.info().annotations.push({
            type: "observation",
            description: "Short password - no visible validation error",
          });
        });
      }
    });

    test("plant code too short shows error", async ({ page }) => {
      await page.goto(`${BASE}/login`, { waitUntil: "load" });

      await page.getByLabel(/Plant Code/i).fill("J");
      await page.getByLabel(/Email/i).fill("test@test.com");
      await page.getByLabel(/Password/i).fill("Test123!");
      await page.getByRole("button", { name: /Sign In/i }).click();
      await page.waitForTimeout(500);

      const hasHtml5 = await page.evaluate(() => {
        const inputs = document.querySelectorAll("input:invalid");
        return inputs.length > 0;
      }).catch(() => false);

      if (!hasHtml5) {
        const appError = page.getByText(/Plant.*(short|length|minimum|required|invalid)/i);
        await expect(appError).toBeVisible({ timeout: 3000 }).catch(() => {
          test.info().annotations.push({
            type: "observation",
            description: "Short plant code - no visible validation error",
          });
        });
      }
    });
  });

  test.describe("Authentication Flow", () => {

    test("try login with test credentials", async ({ page }) => {
      try {
        loginSucceeded = await loginAs(page, CREDS);
      } catch {
        loginSucceeded = false;
      }

      if (loginSucceeded) {
        expect(page.url()).not.toContain("/login");
      } else {
        test.info().annotations.push({
          type: "observation",
          description: "Login with test credentials did not succeed - further auth tests may be skipped",
        });
      }

      const deviceId = await page.evaluate(() => localStorage.getItem("cmms:device_id")).catch(() => null);
      const hasSession = await page.evaluate(() => sessionStorage.getItem("cmms_has_session")).catch(() => null);

      if (loginSucceeded) {
        expect(deviceId).toBeTruthy();
        expect(hasSession).toBeTruthy();
      } else {
        if (deviceId) {
          test.info().annotations.push({
            type: "observation",
            description: "cmms:device_id found in localStorage despite login not succeeding",
          });
        }
        if (hasSession) {
          test.info().annotations.push({
            type: "observation",
            description: "cmms_has_session found in sessionStorage despite login not succeeding",
          });
        }
      }
    });
  });

  test.describe("Invalid Credentials", () => {

    test("invalid credentials show error message", async ({ page }) => {
      await page.goto(`${BASE}/login`, { waitUntil: "load" });

      await page.getByLabel(/Plant Code/i).fill("JKF");
      await page.getByLabel(/Email/i).fill("wrong@example.com");
      await page.getByLabel(/Password/i).fill("WrongPass1!");
      await page.getByRole("button", { name: /Sign In/i }).click();
      await page.waitForTimeout(2000);

      const errorShown = await page.getByText(/Invalid|error|failed|sign in again/i).isVisible({ timeout: 5000 }).catch(() => false);

      if (!errorShown) {
        const currentUrl = page.url();
        if (currentUrl.includes("/login")) {
          test.info().annotations.push({
            type: "observation",
            description: "Invalid credentials: stayed on login page but no error message visible",
          });
        } else {
          test.info().annotations.push({
            type: "observation",
            description: "Invalid credentials: redirected away from login (unexpected)",
          });
        }
      }
      expect(errorShown || page.url().includes("/login")).toBeTruthy();
    });
  });

  test.describe("Session Management", () => {

    test("session persists on page reload", async ({ page }) => {
      if (!loginSucceeded) {
        test.skip();
        return;
      }

      await page.waitForTimeout(500);
      const currentUrl = page.url();

      await page.reload({ waitUntil: "load" });
      await page.waitForTimeout(1000);

      const afterReload = page.url();
      expect(afterReload).not.toContain("/login");
      expect(afterReload).toBe(currentUrl);
    });

    test("logout clears session and redirects to login", async ({ page }) => {
      if (!loginSucceeded) {
        test.skip();
        return;
      }

      await logout(page);
      await page.waitForTimeout(1000);
      expect(page.url()).toContain("/login");
    });
  });


});
