// Debug MC run state.
import { chromium } from '@playwright/test';
import os from 'os';
import path from 'path';

const CHROME = path.join(os.homedir(), '.cache/ms-playwright/chromium-1248/chrome-linux64/chrome');
const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const logs = [];
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) logs.push('console: ' + m.text().slice(0, 140)); });
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Skip' }).click();
await page.waitForTimeout(600);
await page.getByRole('button', { name: 'Templates' }).click();
await page.getByRole('button', { name: 'Use template' }).first().click();
const replaceVisible = await page.getByRole('button', { name: 'Replace' }).isVisible().catch(() => false);
console.log('replace visible:', replaceVisible);
if (replaceVisible) await page.getByRole('button', { name: 'Replace' }).click();
await page.waitForTimeout(800);
await page.screenshot({ path: '/tmp/dbg-tpl.png' });
await page.getByRole('tab', { name: 'MC' }).click();
await page.waitForTimeout(600);
const runBtn = page.getByRole('button', { name: 'Run simulation' });
console.log('run btn visible:', await runBtn.isVisible(), 'disabled:', await runBtn.isDisabled());
await page.screenshot({ path: '/tmp/dbg-mc.png' });
if (!await runBtn.isDisabled()) {
  await runBtn.click();
  await page.waitForTimeout(4000);
  const prog = await page.locator('[role="progressbar"]').count();
  console.log('progress bars:', prog);
  const bodyText = await page.locator('[role="tabpanel"]').textContent();
  console.log('panel excerpt:', bodyText?.slice(0, 300).replace(/\s+/g, ' '));
  await page.screenshot({ path: '/tmp/dbg-mc-run.png' });
}
console.log('logs:', logs.length ? logs : 'none');
await browser.close();
