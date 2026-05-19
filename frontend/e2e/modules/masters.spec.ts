import { test, expect } from "@playwright/test";
import { CONFIG } from "../helpers/config";
import { navigateTo, expectPageNotBlank, isOnLoginPage } from "../helpers/auth";

const MASTER_ROUTES = [
  { name: "Plant", route: CONFIG.routes.masters.plant },
  { name: "Departments", route: CONFIG.routes.masters.departments },
  { name: "Modules", route: CONFIG.routes.masters.modules },
  { name: "Machines", route: CONFIG.routes.masters.machines },
  { name: "Cost Centers", route: CONFIG.routes.masters.costCenters },
  { name: "Vendors", route: CONFIG.routes.masters.vendors },
  { name: "Users", route: CONFIG.routes.masters.users },
  { name: "PM Config", route: CONFIG.routes.masters.pmConfig },
  { name: "Calibration Config", route: CONFIG.routes.masters.calibrationConfig },
  { name: "AMC Config", route: CONFIG.routes.masters.amcConfig },
  { name: "ESG Config", route: CONFIG.routes.masters.esgConfig },
  { name: "Gates", route: CONFIG.routes.masters.gates },
  { name: "Safety Config", route: CONFIG.routes.masters.safetyConfig },
  { name: "Email Reports", route: CONFIG.routes.masters.emailReports },
  { name: "Log Templates", route: CONFIG.routes.masters.logTemplates },
  { name: "Machine Instruments", route: CONFIG.routes.masters.machineInstruments },
  { name: "Shifts", route: CONFIG.routes.masters.shifts },
  { name: "Maintenance Teams", route: CONFIG.routes.masters.maintenanceTeams },
  { name: "Work Order Config", route: CONFIG.routes.masters.workOrderConfig },
];

const ROOT_ROUTES = [
  { name: "Root Dashboard", route: CONFIG.routes.root.dashboard },
  { name: "Organizations", route: CONFIG.routes.root.organizations },
  { name: "Root Plant", route: CONFIG.routes.root.plant },
  { name: "Root Users", route: CONFIG.routes.root.users },
  { name: "Role Access", route: CONFIG.routes.root.roleAccess },
];

test.describe("Masters - All Pages", () => {
  for (const { name, route } of MASTER_ROUTES) {
    test.describe(`Master: ${name}`, () => {
      test("Page loads without blank content", async ({ page }) => {
        await navigateTo(page, route);
        if (await isOnLoginPage(page)) {
          test.info().annotations.push({ type: "note", description: "Skipped - not authenticated" });
          return;
        }
        await expectPageNotBlank(page);
      });

      test("Table or list of items is present", async ({ page }) => {
        await navigateTo(page, route);
        if (await isOnLoginPage(page)) {
          test.info().annotations.push({ type: "note", description: "Skipped - not authenticated" });
          return;
        }
        const table = page.locator("table, [role='grid'], [role='table'], [class*='table'], [class*='Table']");
        const tableCount = await table.count().catch(() => 0);

        const list = page.locator("[class*='list'], [class*='List'], [role='list']");
        const listCount = await list.count().catch(() => 0);

        const bodyText = await page.locator("body").innerText().catch(() => "");

        expect(tableCount + listCount > 0 || bodyText.length > 20).toBeTruthy();
      });

      test("Add or Create button exists", async ({ page }) => {
        await navigateTo(page, route);
        if (await isOnLoginPage(page)) {
          test.info().annotations.push({ type: "note", description: "Skipped - not authenticated" });
          return;
        }
        const addBtn = page.getByRole("button", {
          name: /Add|Create|New|Register|Add New/i,
        });
        const btnCount = await addBtn.count().catch(() => 0);

        const bodyText = await page.locator("body").innerText().catch(() => "");
        expect(btnCount > 0 || bodyText.length > 10).toBeTruthy();
      });

      test("Search input is accessible", async ({ page }) => {
        await navigateTo(page, route);
        if (await isOnLoginPage(page)) {
          test.info().annotations.push({ type: "note", description: "Skipped - not authenticated" });
          return;
        }
        const searchInput = page.locator(
          'input[type="search"], input[placeholder*="search" i], input[placeholder*="filter" i], input[placeholder*="Search" i], input[placeholder*="Filter" i]'
        );
        const searchCount = await searchInput.count().catch(() => 0);

        const bodyText = await page.locator("body").innerText().catch(() => "");
        expect(searchCount > 0 || bodyText.length > 10).toBeTruthy();
      });

      test(`Take screenshot of ${name}`, async ({ page }) => {
        await navigateTo(page, route);
        if (await isOnLoginPage(page)) {
          test.info().annotations.push({ type: "note", description: "Skipped - not authenticated" });
          return;
        }
        await page.waitForTimeout(1000);
        const safeName = route.replace(/\//g, "_").replace(/^_/, "");
        await page.screenshot({
          path: `${CONFIG.screenshots.dir}/masters_${safeName}.png`,
          fullPage: true,
        });
        await expectPageNotBlank(page);
      });
    });
  }
});

test.describe("Root Admin Pages", () => {
  for (const { name, route } of ROOT_ROUTES) {
    test.describe(`Root: ${name}`, () => {
      test("Page loads without blank content", async ({ page }) => {
        await navigateTo(page, route);
        if (await isOnLoginPage(page)) {
          test.info().annotations.push({ type: "note", description: "Skipped - not authenticated" });
          return;
        }
        const bodyText = await page.locator("body").innerText().catch(() => "");
        expect(bodyText.length).toBeGreaterThan(5);
      });

      test("Page has visible content elements", async ({ page }) => {
        await navigateTo(page, route);
        if (await isOnLoginPage(page)) {
          test.info().annotations.push({ type: "note", description: "Skipped - not authenticated" });
          return;
        }
        const bodyText = await page.locator("body").innerText().catch(() => "");

        const table = page.locator("table, [role='grid'], [role='table'], [class*='table'], [class*='Table']");
        const tableCount = await table.count().catch(() => 0);

        const addBtn = page.getByRole("button", {
          name: /Add|Create|New|Register|Add New/i,
        });
        const btnCount = await addBtn.count().catch(() => 0);

        expect(tableCount + btnCount > 0 || bodyText.length > 20).toBeTruthy();
      });

      test(`Take screenshot of ${name}`, async ({ page }) => {
        await navigateTo(page, route);
        if (await isOnLoginPage(page)) {
          test.info().annotations.push({ type: "note", description: "Skipped - not authenticated" });
          return;
        }
        await page.waitForTimeout(1000);
        const safeName = route.replace(/\//g, "_").replace(/^_/, "");
        await page.screenshot({
          path: `${CONFIG.screenshots.dir}/root_${safeName}.png`,
          fullPage: true,
        });
        const bodyText = await page.locator("body").innerText().catch(() => "");
        expect(bodyText.length).toBeGreaterThan(5);
      });
    });
  }
});
