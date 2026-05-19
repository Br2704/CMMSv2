import { chromium, type FullConfig } from "@playwright/test";
import { CONFIG } from "../helpers/config";
import { loginAs } from "../helpers/auth";

async function globalSetup(config: FullConfig) {
  const { baseURL } = config.projects[0].use;
  const storageDir = config.projects[0].outputDir;

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: CONFIG.viewports.desktop,
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();

  const roles = [
    { key: "admin", creds: CONFIG.credentials.admin, role: "admin" },
    { key: "security", creds: CONFIG.credentials.security, role: "security" },
    { key: "vendor", creds: CONFIG.credentials.vendor, role: "vendor" },
    { key: "visitor", creds: CONFIG.credentials.visitor, role: "visitor" },
    { key: "technician", creds: CONFIG.credentials.technician, role: "technician" },
    { key: "superAdmin", creds: CONFIG.credentials.superAdmin, role: "superAdmin" },
    { key: "rootAdmin", creds: CONFIG.credentials.rootAdmin, role: "rootAdmin" },
  ];

  for (const { key, creds } of roles) {
    try {
      const loggedIn = await loginAs(page, creds);
      if (loggedIn) {
        const storageFile = `e2e/.auth/${key}.json`;
        await page.context().storageState({ path: storageFile });
        console.log(`  ✓ Auth storage saved: ${key} (${creds.email})`);
        await page.goto(CONFIG.baseUrl + "/login", { waitUntil: "load" });
        await page.evaluate(() => {
          sessionStorage.clear();
          localStorage.clear();
        });
        await page.waitForTimeout(500);
      } else {
        console.warn(`  ✗ Login failed for ${key} (${creds.email})`);
      }
    } catch (err) {
      console.warn(`  ✗ Error logging in as ${key}: ${err}`);
    }
  }

  await browser.close();
}

export default globalSetup;
