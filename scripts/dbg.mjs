// Debug: template picker buttons.
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
await page.waitForTimeout(600);
const btns = await page.locator('[role="dialog"] button').allTextContents();
console.log('dialog buttons:', JSON.stringify(btns.map((b) => b.trim().slice(0, 30))));
await page.screenshot({ path: '/tmp/dbg-picker.png' });
await browser.close();
