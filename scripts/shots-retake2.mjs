// Retake: canvas (minimap gone), forecast (x-axis ticks), mobile list (header wrap).
import { chromium } from '@playwright/test';
import os from 'os';
import path from 'path';

const CHROME = path.join(os.homedir(), '.cache/ms-playwright/chromium-1248/chrome-linux64/chrome');
const OUT = '/home/hatch/workspace/cashflow-planner/docs/screenshots';
const errs = [];

async function desktop() {
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Skip' }).click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Templates' }).click();
  await page.getByRole('button', { name: 'Use template' }).first().click();
  await page.waitForTimeout(300);
  const rep = page.getByRole('button', { name: 'Replace' });
  if (await rep.isVisible().catch(() => false)) await rep.click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${OUT}/canvas-light-desktop.png` });
  await page.screenshot({ path: `${OUT}/forecast-light-desktop.png` });
  await browser.close();
}

async function mobile() {
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Skip' }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/list-light-mobile.png` });
  await page.getByRole('button', { name: 'Results' }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/forecast-light-mobile.png` });
  await browser.close();
}

await desktop();
await mobile();
console.log('done, errors:', errs.length ? errs : 'none');
