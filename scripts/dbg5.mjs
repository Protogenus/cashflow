import { chromium } from '@playwright/test';
import os from 'os';
import path from 'path';

const CHROME = path.join(os.homedir(), '.cache/ms-playwright/chromium-1248/chrome-linux64/chrome');
const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const logs = [];
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Skip' }).click();
await page.waitForTimeout(600);
await page.getByRole('button', { name: 'Templates' }).click();
await page.getByRole('button', { name: 'Use template' }).first().click();
await page.waitForTimeout(400);
const rep = page.getByRole('button', { name: 'Replace' });
if (await rep.isVisible().catch(() => false)) await rep.click();
await page.waitForTimeout(800);
await page.evaluate(() => {
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  tabs.find((el) => el.textContent.trim() === 'Optimizer')?.click();
});
await page.waitForTimeout(600);
const btn = page.getByRole('button', { name: 'Find best splits' });
console.log('btn visible:', await btn.isVisible(), 'disabled:', await btn.isDisabled());
await page.screenshot({ path: '/tmp/dbg-opt.png' });
if (!await btn.isDisabled()) {
  const t0 = Date.now();
  await btn.click();
  await page.waitForTimeout(5000);
  console.log('after 5s, elapsed:', Date.now() - t0);
  const txt = await page.locator('[role="tabpanel"]').textContent();
  console.log('panel:', txt?.slice(0, 400).replace(/\s+/g, ' '));
  await page.screenshot({ path: '/tmp/dbg-opt2.png' });
}
console.log('logs:', logs.length ? logs : 'none');
await browser.close();
