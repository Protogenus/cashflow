// Quick one-off screenshot helper (not the E2E suite).
import { chromium } from '@playwright/test';
import os from 'os';
import path from 'path';

const CHROME = path.join(os.homedir(), '.cache/ms-playwright/chromium-1248/chrome-linux64/chrome');

export async function launch() {
  return chromium.launch({ executablePath: CHROME });
}

const shots = [
  { name: 'baseline-desktop', width: 1440, height: 900, theme: 'light' },
  { name: 'baseline-mobile', width: 375, height: 812, theme: 'light' },
];

const browser = await launch();
for (const s of shots) {
  const page = await browser.newPage({ viewport: { width: s.width, height: s.height } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
  // Dismiss onboarding by picking nothing — just close it via skip for baseline shots
  await page.getByRole('button', { name: 'Skip' }).click().catch(() => {});
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `/tmp/${s.name}.png` });
  console.log(s.name, 'errors:', errors.length ? errors : 'none');
  await page.close();
}
await browser.close();
