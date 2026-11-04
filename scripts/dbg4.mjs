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
await page.waitForTimeout(600);
await page.getByRole('button', { name: 'Templates' }).click();
await page.getByRole('button', { name: 'Use template' }).first().click();
await page.waitForTimeout(800);
console.log('template loaded, tabs:', await page.locator('[role="tab"]').count());

// exact gotoTab from perf.mjs
await page.evaluate((n) => {
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  const t = tabs.find((el) => el.textContent.trim() === n);
  t?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}, 'MC');
const info = await page.evaluate(() => {
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  const mc = tabs.find((el) => el.textContent.trim() === 'MC');
  const r = mc.getBoundingClientRect();
  const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return { rect: { x: r.x, y: r.y, w: r.width }, hit: el?.tagName + '.' + (el?.className?.toString().slice(0, 40) ?? '') };
});
console.log(JSON.stringify(info));
try {
  await page.getByRole('tab', { name: 'MC' }).click({ timeout: 8000 });
  console.log('click OK');
} catch (e) {
  console.log('click FAILED:', e.message.split('\n').slice(0, 6).join(' | '));
}
await browser.close();
