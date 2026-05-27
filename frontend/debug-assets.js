const { chromium } = require("@playwright/test");

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on("console", (msg) => {
    console.log(`[CONSOLE] [${msg.type()}] ${msg.text()}`);
  });

  page.on("pageerror", (err) => {
    console.error(`[PAGE ERROR] ${err.stack || err.message}`);
  });

  try {
    console.log("Navigating to login page...");
    await page.goto("http://localhost:8081/login", { waitUntil: "load" });
    await page.waitForTimeout(1000);

    console.log("Filling login credentials...");
    await page.getByLabel(/Email/i).fill("mduadmin@jkfenner.com");
    await page.getByLabel(/Password/i).fill("Admin@123!@#");

    console.log("Submitting login form...");
    await page.getByRole("button", { name: /Sign In|Login/i }).click();

    console.log("Waiting for redirection...");
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(500);
      if (!page.url().includes("/login")) {
        break;
      }
    }
    console.log(`Current URL after login: ${page.url()}`);

    console.log("Navigating to /assets...");
    await page.goto("http://localhost:8081/assets", { waitUntil: "load" });
    await page.waitForTimeout(3000);
    console.log(`Final URL: ${page.url()}`);

    const content = await page.locator("body").innerText();
    console.log(`Body text length: ${content.length}`);
    console.log(`Body text snippet: ${content.slice(0, 200)}`);
  } catch (error) {
    console.error("Test crashed:", error);
  } finally {
    await browser.close();
  }
}

run();
