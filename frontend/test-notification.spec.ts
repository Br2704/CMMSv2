import { test, expect } from '@playwright/test';

test('click notification button', async ({ page }) => {
  await page.goto('http://localhost:8081/login');
  await page.fill('input[name="email"]', 'admin@jkfenner.com');
  await page.fill('input[name="password"]', 'JKFenner@123');
  await page.click('button[type="submit"]');
  await page.waitForURL('http://localhost:8081/dashboard');
  
  // Log console errors to debug React.Children.only crash
  page.on('pageerror', (err) => {
    console.error(`PAGE ERROR: ${err.message}`);
    console.error(`STACK: ${err.stack}`);
  });
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.error(`CONSOLE ERROR: ${msg.text()}`);
    }
  });

  // click notification
  await page.click('button:has(.lucide-bell)');
  
  // wait 1 second
  await page.waitForTimeout(1000);
  
  // check if route error boundary is visible
  const errorText = await page.textContent('body');
  console.log("BODY TEXT AFTER CLICK:", errorText);
});
