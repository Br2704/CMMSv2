import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 1,
  workers: 1,
  globalSetup: "./e2e/fixtures/global-setup.ts",
  timeout: 60000,
  expect: {
    timeout: 10000,
  },
  reporter: [
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["json", { outputFile: "playwright-report/results.json" }],
    ["list"],
    [
      "./e2e/helpers/custom-reporter.ts",
      { outputFile: "e2e-test-report.md" },
    ],
  ],
  use: {
    baseURL: process.env.BASE_URL || "http://localhost:8081",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 15000,
    navigationTimeout: 30000,
    storageState: "e2e/.auth/admin.json",
    extraHTTPHeaders: {
      "X-Test-Suite": "CMMS-E2E",
    },
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1920, height: 1080 },
        launchOptions: {
          args: [
            "--disable-gpu",
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-web-security",
            "--disable-features=IsolateOrigins,site-per-process",
          ],
        },
      },
    },
  ],
});
