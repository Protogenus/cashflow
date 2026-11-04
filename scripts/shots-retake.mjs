// Retake: tradeoff (completed run) + scenarios, light theme desktop.
import { chromium } from '@playwright/test';
import os from 'os';
import path from 'path';

const CHROME = path.join(os.homedir(), '.cache/ms-playwright/chromium-1248/chrome-linux64/chrome');
const OUT = '/home/hatch/workspace/cashflow-planner/docs/screenshots';
const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
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
await page.waitForTimeout(800);

async function clickTab(name) {
  await page.evaluate((n) => {
    const tabs = [...document.querySelectorAll('[role="tab"]')];
    tabs.find((el) => el.textContent?.trim() === n)?.scrollIntoView({ block: 'nearest' });
  }, name);
  await page.getByRole('tab', { name }).click();
  await page.waitForTimeout(500);
}

await clickTab('Scenarios');
await page.screenshot({ path: `${OUT}/scenarios-light-desktop.png` });

await clickTab('Optimizer');
await page.getByRole('button', { name: 'Find best splits' }).click();
await page.waitForSelector('text=/Searched all/', { timeout: 30000 });
await clickTab('Tradeoff');
await page.evaluate(() => {
  const slider = document.querySelector('input[type="range"][aria-label="Monte Carlo runs per candidate"]');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(slider, '500');
  slider.dispatchEvent(new Event('input', { bubbles: true }));
});
await page.getByRole('button', { name: 'Stress-test candidates' }).click();
// wait for the table: progress clears and rows appear
await page.waitForSelector('table', { timeout: 180000 });
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/tradeoff-light-desktop.png` });
console.log('done, errors:', errs.length ? errs : 'none');
await browser.close();
