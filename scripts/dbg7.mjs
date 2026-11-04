import { chromium } from '@playwright/test';
import os from 'os';
import path from 'path';

const CHROME = path.join(os.homedir(), '.cache/ms-playwright/chromium-1248/chrome-linux64/chrome');
const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
await page.goto('http://127.0.0.1:5173/');
await page.getByRole('button', { name: 'Skip' }).click();
await page.waitForTimeout(800);
const btns = await page.locator('[aria-label="Plan nodes as a list"] button').all();
console.log('list buttons:', btns.length);
for (const b of btns.slice(0, 8)) {
  console.log(' -', JSON.stringify((await b.getAttribute('aria-label'))?.slice(0, 60)));
}
await page.screenshot({ path: '/tmp/dbg-mob.png' });
await browser.close();
