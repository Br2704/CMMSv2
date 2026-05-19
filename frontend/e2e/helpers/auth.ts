import { type Page, type BrowserContext, expect } from "@playwright/test";
import { CONFIG } from "./config";

export interface AuthSession {
  email: string;
  password: string;
  plantCode: string;
}

export async function isOnLoginPage(page: Page): Promise<boolean> {
  try {
    const url = page.url();
    return url.includes("/login");
  } catch {
    return true;
  }
}

export async function loginAs(
  page: Page,
  credentials: AuthSession = CONFIG.credentials.admin
): Promise<boolean> {
  try {
    // Navigate fresh so all state is clean
    await page.goto(CONFIG.baseUrl + CONFIG.routes.public.login, {
      waitUntil: "load",
      timeout: CONFIG.timeouts.navigation,
    });
    await page.waitForTimeout(1500);

    const currentUrl = page.url();
    if (!currentUrl.includes("/login")) {
      // Already logged in
      return true;
    }

    if (credentials.plantCode) {
      const plantInput = page.locator('input[type="text"]').first();
      if (await plantInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await plantInput.fill(credentials.plantCode);
      }
    }

    await page.getByLabel(/Email/i).fill(credentials.email);
    await page.getByLabel(/Password/i).fill(credentials.password);

    await page.getByRole("button", { name: /Sign In|Login|Submit/i }).click();

    // Fast-polling loop to wait for redirect to complete
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(500);
      if (!page.url().includes("/login")) {
        break;
      }
    }

    const afterUrl = page.url();
    const loggedIn = !afterUrl.includes("/login");
    if (!loggedIn) {
      const bodyText = await page.locator("body").innerText().catch(() => "No text");
      console.warn(`[E2E Login Failure] User: ${credentials.email}, Msg text: ${bodyText.replace(/\n/g, " | ")}`);
    }
    return loggedIn;
  } catch (err: any) {
    console.warn(`[E2E Login Crash] User: ${credentials.email}, Error: ${err?.message || err}`);
    return false;
  }
}

export async function logout(page: Page): Promise<void> {
  try {
    const avatarButton = page.locator('[class*="avatar"] button, [class*="Avatar"] button, button:has(img[class*="avatar"])').first();
    if (await avatarButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await avatarButton.click();
      await page.waitForTimeout(500);
    }

    const logoutButton = page.getByRole("menuitem", { name: /log.?out/i }).first()
      .or(page.getByRole("button", { name: /log.?out/i }).first())
      .or(page.locator("text=Logout").first());
    if (await logoutButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await logoutButton.click();
      await page.waitForTimeout(2000);
    }
  } catch {
    await page.goto(CONFIG.baseUrl + CONFIG.routes.public.login, { waitUntil: "load" });
    await page.waitForTimeout(1000);
  }
}

export async function clearSession(page: Page): Promise<void> {
  try {
    await page.evaluate(() => {
      sessionStorage.clear();
      localStorage.clear();
    });
  } catch {
  }
}

export async function isLoggedIn(page: Page): Promise<boolean> {
  try {
    const currentUrl = page.url();
    return !currentUrl.includes("/login");
  } catch {
    return false;
  }
}

export async function navigateTo(
  page: Page,
  route: string,
  options?: { expectedStatus?: number; timeout?: number }
): Promise<string> {
  try {
    await page.goto(CONFIG.baseUrl + route, {
      waitUntil: "load",
      timeout: options?.timeout || CONFIG.timeouts.navigation,
    });
    await page.waitForTimeout(1500);
  } catch {
    await page.goto(CONFIG.baseUrl + CONFIG.routes.public.login, {
      waitUntil: "load",
      timeout: 10000,
    }).catch(() => {});
  }
  return page.url();
}

export async function waitForApiResponse(
  page: Page,
  urlPattern: string | RegExp,
  timeout: number = CONFIG.timeouts.apiResponse
): Promise<{ status: number; body: any } | null> {
  try {
    const response = await page.waitForResponse(
      (resp) => {
        const matchesUrl = typeof urlPattern === "string"
          ? resp.url().includes(urlPattern)
          : urlPattern.test(resp.url());
        return matchesUrl && resp.request().method() === "GET";
      },
      { timeout }
    );
    const body = await response.json().catch(() => null);
    return { status: response.status(), body };
  } catch {
    return null;
  }
}

export async function expectPageNotBlank(page: Page): Promise<void> {
  const bodyText = await page.locator("body").innerText().catch(() => "");
  expect(bodyText.length).toBeGreaterThan(5);
}

export async function expectNoConsoleErrors(page: Page, collected: string[] = []): Promise<void> {
  expect(collected.filter((m) => m.includes("401") || m.includes("500"))).toHaveLength(0);
}

export async function tryExpectVisible(
  page: Page,
  locator: string,
  timeout: number = 3000
): Promise<boolean> {
  try {
    const el = page.locator(locator);
    await el.waitFor({ state: "visible", timeout });
    return true;
  } catch {
    return false;
  }
}
