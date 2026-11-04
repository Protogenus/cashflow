// One-off: mobile list view + results screenshots.
import { chromium } from '@playwright/test';
import os from 'os';
import path from 'path';

const CHROME = path.join(os.homedir(), '.cache/ms-playwright/chromium-1248/chrome-linux64/chrome');
const browser = await chromium.launch({ executablePath: CHROME });

async function shot(name, width, height, actions) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)); });
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Skip' }).click();
  await page.waitForTimeout(800);
  if (actions) await actions(page);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `/tmp/${name}.png` });
  console.log(name, 'errors:', errors.length ? errors : 'none');
  await page.close();
}

await shot('m-list-plan', 375, 812);
await shot('m-list-results', 375, 812, async (page) => {
  await page.getByRole('button', { name: 'Results' }).click();
});
await shot('m-list-canvas', 375, 812, async (page) => {
  await page.getByRole('button', { name: '⤢ Canvas' }).click();
});
await browser.close();
