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
const info = await page.evaluate(() => {
  const list = document.querySelector('[role="tablist"]');
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  const mc = tabs.find((el) => el.textContent.trim() === 'MC');
  const r = mc.getBoundingClientRect();
  const lr = list.getBoundingClientRect();
  return {
    listScrollWidth: list.scrollWidth, listClientWidth: list.clientWidth,
    mcLeft: r.left, mcRight: r.right, listLeft: lr.left, listRight: lr.right,
    mcVisible: r.left >= lr.left && r.right <= lr.right,
    overflowX: getComputedStyle(list).overflowX,
  };
});
console.log(JSON.stringify(info, null, 1));
// try force click
try {
  await page.getByRole('tab', { name: 'MC' }).click({ timeout: 5000 });
  console.log('normal click OK');
} catch (e) {
  console.log('normal click failed, trying evaluate click');
  await page.evaluate(() => {
    const tabs = [...document.querySelectorAll('[role="tab"]')];
    tabs.find((el) => el.textContent.trim() === 'MC')?.click();
  });
  console.log('evaluate click done');
}
await page.waitForTimeout(500);
const sel = await page.evaluate(() => document.querySelector('[role="tab"][aria-selected="true"]')?.textContent);
console.log('selected tab now:', sel);
await browser.close();
