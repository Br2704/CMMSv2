import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth";
import { CONFIG } from "./helpers/config";

test("Raise Work Order opens without React.Children.only error", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => {
    console.log("PAGE ERROR:", err.message);
    errors.push(err.message);
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      console.log("CONSOLE ERROR:", msg.text());
      errors.push(msg.text());
    } else {
      console.log("CONSOLE:", msg.text());
    }
  });

  const baseUrl = process.env.BASE_URL || "http://localhost:8081";
  const loggedIn = await loginAs(page, {
    email: "tech.test@jkfenner.com",
    password: "TamOptiX@09022026",
    plantCode: "JKF"
  });
  expect(loggedIn).toBe(true);

  await page.goto(`${baseUrl}/work-orders`, { waitUntil: "load" });
  await page.getByRole("button", { name: /Raise Work Order/i }).click();
  
  // Wait a bit to let any state changes / crash settle
  await page.waitForTimeout(2000);

  // Check if Error Boundary is displayed
  const bodyText = await page.locator("body").innerText();
  if (bodyText.includes("Something went wrong") || bodyText.includes("crashed unexpectedly")) {
    console.log("CRASH DETECTED on page!");
    errors.push("Page crashed and showed error boundary");
  }

  expect(errors.filter((e) => e.includes("React.Children.only") || e.includes("crashed"))).toEqual([]);
});

