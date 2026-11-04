// One-off: test Enter on a focused RF node → does it select / open inspector?
import { chromium } from '@playwright/test';
import os from 'os';
import path from 'path';

const CHROME = path.join(os.homedir(), '.cache/ms-playwright/chromium-1248/chrome-linux64/chrome');
const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Skip' }).click();
await page.waitForTimeout(800);

await page.locator('.react-flow').click();
// Tab to first node
await page.keyboard.press('Tab');
await page.waitForTimeout(200);
let focused = await page.evaluate(() => document.activeElement?.className?.toString().slice(0, 60));
console.log('focused after Tab:', focused);
// Press Enter
await page.keyboard.press('Enter');
await page.waitForTimeout(400);
const state = await page.evaluate(() => ({
  inspectorVisible: !!document.querySelector('[role="tabpanel"]')?.textContent?.includes('Edit node'),
  tabLabel: document.querySelector('[role="tab"][aria-selected="true"]')?.textContent,
  activeEl: document.activeElement?.className?.toString().slice(0, 60),
}));
console.log(JSON.stringify(state, null, 1));
await browser.close();
