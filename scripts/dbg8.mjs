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
await page.waitForTimeout(400);
await page.evaluate(() => {
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  tabs.find((el) => el.textContent?.trim() === 'Scenarios')?.click();
});
await page.waitForTimeout(600);
const info = await page.evaluate(() => {
  const spans = [...document.querySelectorAll('span.truncate')];
  return spans.map((s) => ({
    text: s.textContent?.slice(0, 30),
    w: s.getBoundingClientRect().width,
    scrollW: s.scrollWidth,
    parentW: s.parentElement?.getBoundingClientRect().width,
  }));
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
