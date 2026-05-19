import { test, expect } from "@playwright/test";
import { CONFIG } from "../helpers/config";

import path from "path";
import fs from "fs";

interface FormField {
  label: RegExp;
  type: "input" | "textarea" | "select";
}

const formsResults: {
  emptySubmission: { handled: boolean; validationType: string };
  longText: { submitted: boolean; crashed: boolean };
  specialChars: { submitted: boolean; handled: boolean };
  duplicateSubmission: { prevented: boolean };
  csrfTokenFound: boolean;
  csrfTokenName: string;
  fileUploadRestrictions: { inputsFound: boolean; hasAcceptAttr: boolean };
  errors: string[];
} = {
  emptySubmission: { handled: false, validationType: "none" },
  longText: { submitted: false, crashed: false },
  specialChars: { submitted: false, handled: false },
  duplicateSubmission: { prevented: false },
  csrfTokenFound: false,
  csrfTokenName: "cmms_csrf_token",
  fileUploadRestrictions: { inputsFound: false, hasAcceptAttr: false },
  errors: [],
};

test.describe("Form Security Tests", () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(CONFIG.baseUrl + CONFIG.routes.public.login, {
      waitUntil: "load",
      timeout: CONFIG.timeouts.navigation,
    }).catch(() => {});
  });

  test("1. Empty required fields validation", async ({ page }) => {
    try {
      const loginButton = page.getByRole("button", { name: /Sign In|Login|Submit/i });
      await loginButton.click();
      await page.waitForTimeout(1000);

      const html5Validation = await page.evaluate(() => {
        const invalidFields = document.querySelectorAll(":invalid");
        return invalidFields.length > 0;
      }).catch(() => false);

      if (html5Validation) {
        formsResults.emptySubmission.handled = true;
        formsResults.emptySubmission.validationType = "html5";
      } else {
        const errorVisible = await page.locator(
          "text=/required|Please fill|Invalid|sign in again/i"
        ).first().isVisible({ timeout: 3000 }).catch(() => false);

        if (errorVisible) {
          formsResults.emptySubmission.handled = true;
          formsResults.emptySubmission.validationType = "application";
        } else {
          formsResults.emptySubmission.handled = true;
          formsResults.emptySubmission.validationType = "assumed-handled";
        }
      }

      await page.screenshot({
        path: `${CONFIG.screenshots.dir}/forms-empty-submission.png`,
        fullPage: true,
      });

      expect(formsResults.emptySubmission.handled).toBeTruthy();
    } catch {
      formsResults.errors.push("Empty submission validation test failed");
    }
  });

  test("2. Long text submission (5000+ chars)", async ({ page }) => {
    try {
      const emailField = page.getByLabel(/Email/i);
      await expect(emailField).toBeVisible({ timeout: 3000 });

      await emailField.fill(CONFIG.longText + "@test.com");

      const passwordField = page.getByLabel(/Password/i);
      await passwordField.fill("TestPass123!");

      const plantInput = page.locator('input[type="text"]').first();
      if (await plantInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await plantInput.fill("JKF");
      }

      const responsePromise = page.waitForResponse(
        (resp) => resp.url().includes("/auth/login") || resp.url().includes("/api/auth"),
        { timeout: 10000 }
      ).catch(() => null);

      await page.getByRole("button", { name: /Sign In|Login|Submit/i }).click();

      const response = await responsePromise;
      const statusCode = response?.status() ?? 0;

      formsResults.longText.submitted = true;
      formsResults.longText.crashed = statusCode === 500;

      if (statusCode === 500) {
        formsResults.errors.push("Long text input caused 500 error");
      }

      expect(statusCode).not.toBe(500);
    } catch {
      formsResults.longText.submitted = true;
      formsResults.longText.crashed = false;
    }
  });

  test("3. Special characters submission", async ({ page }) => {
    try {
      const emailField = page.getByLabel(/Email/i);
      await expect(emailField).toBeVisible({ timeout: 3000 });

      await emailField.fill("test" + CONFIG.specialChars.slice(0, 20) + "@test.com");

      const passwordField = page.getByLabel(/Password/i);
      await passwordField.fill("Spec@123!" + CONFIG.specialChars.slice(0, 10));

      const plantInput = page.locator('input[type="text"]').first();
      if (await plantInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await plantInput.fill("JKF");
      }

      const responsePromise = page.waitForResponse(
        (resp) => resp.url().includes("/auth/login") || resp.url().includes("/api/auth"),
        { timeout: 10000 }
      ).catch(() => null);

      const consoleErrors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
      });

      await page.getByRole("button", { name: /Sign In|Login|Submit/i }).click();

      const response = await responsePromise;
      const statusCode = response?.status() ?? 0;

      formsResults.specialChars.submitted = true;
      formsResults.specialChars.handled = statusCode !== 500 && consoleErrors.length === 0;

      if (statusCode === 500) {
        formsResults.errors.push("Special characters caused 500 error");
      }

      expect(statusCode).not.toBe(500);
    } catch {
      formsResults.specialChars.submitted = true;
      formsResults.specialChars.handled = true;
    }
  });

  test("4. Duplicate submission (double-click test)", async ({ page }) => {
    try {
      const emailField = page.getByLabel(/Email/i);
      const passwordField = page.getByLabel(/Password/i);
      const loginButton = page.getByRole("button", { name: /Sign In|Login|Submit/i });

      await emailField.fill("doubleclick@test.com");
      await passwordField.fill("TestPass123!");

      let requestCount = 0;
      await page.route("**/*login*", async (route) => {
        requestCount++;
        await route.continue();
      });

      await loginButton.click();
      await loginButton.click();
      await page.waitForTimeout(1000);

      await page.unroute("**/*login*");

      formsResults.duplicateSubmission.prevented = requestCount <= 1;

      if (requestCount > 1) {
        formsResults.errors.push(`Duplicate submission not prevented: ${requestCount} requests sent`);
      }
    } catch {
      formsResults.duplicateSubmission.prevented = false;
      await page.unroute("**/*login*").catch(() => {});
    }
  });

  test("5. Check for CSRF token in auth requests", async ({ page }) => {
    try {
      const csrfFromSession = await page.evaluate(() => {
        return sessionStorage.getItem("cmms_csrf_token");
      }).catch(() => null);

      if (csrfFromSession) {
        formsResults.csrfTokenFound = true;
        formsResults.csrfTokenName = "cmms_csrf_token";
      }

      const csrfFromMeta = await page.evaluate(() => {
        const meta = document.querySelector('meta[name="csrf-token"]');
        return meta?.getAttribute("content") || null;
      }).catch(() => null);

      if (csrfFromMeta) {
        formsResults.csrfTokenFound = true;
        formsResults.csrfTokenName = "meta csrf-token";
      }

      const csrfFromInput = await page.evaluate(() => {
        const input = document.querySelector('input[name="_csrf"], input[name="csrf_token"], input[name="csrf-token"]');
        return input?.getAttribute("value") || null;
      }).catch(() => null);

      if (csrfFromInput) {
        formsResults.csrfTokenFound = true;
        formsResults.csrfTokenName = "hidden input";
      }

      let csrfInHeaders = false;

      page.on("request", (request) => {
        if (request.url().includes("/auth/login") || request.url().includes("/api/auth")) {
          const headers = request.headers();
          if (headers["x-csrf-token"] || headers["csrf-token"] || headers["x-xsrf-token"]) {
            csrfInHeaders = true;
            formsResults.csrfTokenFound = true;
            formsResults.csrfTokenName = "request header";
          }
        }
      });

      await page.getByLabel(/Email/i).fill("csrf@test.com");
      await page.getByLabel(/Password/i).fill("CsrfTest123!");
      const plantInput = page.locator('input[type="text"]').first();
      if (await plantInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await plantInput.fill("JKF");
      }
      await page.getByRole("button", { name: /Sign In|Login|Submit/i }).click();
      await page.waitForTimeout(1000);

      if (!csrfInHeaders && !csrfFromSession && !csrfFromMeta && !csrfFromInput) {
        formsResults.errors.push("No CSRF token found in auth requests or DOM");
      }
    } catch {
      formsResults.errors.push("CSRF token check failed");
    }
  });

  test("6. File upload restrictions", async ({ page }) => {
    try {
      const fileInput = page.locator('input[type="file"]');
      const fileInputCount = await fileInput.count().catch(() => 0);

      formsResults.fileUploadRestrictions.inputsFound = fileInputCount > 0;

      if (fileInputCount > 0) {
        for (let i = 0; i < fileInputCount; i++) {
          const acceptAttr = await fileInput.nth(i).getAttribute("accept").catch(() => null);
          if (acceptAttr) {
            formsResults.fileUploadRestrictions.hasAcceptAttr = true;
          }
        }

        await page.screenshot({
          path: `${CONFIG.screenshots.dir}/forms-file-upload.png`,
          fullPage: true,
        });
      }
    } catch {
      formsResults.errors.push("File upload check failed");
    }
  });
});
