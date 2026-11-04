// One-off axe accessibility scan of the main views (not part of the suite).
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import os from 'os';
import path from 'path';

const CHROME = path.join(os.homedir(), '.cache/ms-playwright/chromium-1248/chrome-linux64/chrome');
const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });

async function scan(label) {
  const res = await new AxeBuilder({ page }).analyze();
  const critical = res.violations.filter((v) => v.impact === 'critical');
  const serious = res.violations.filter((v) => v.impact === 'serious');
  console.log(`${label}: ${res.violations.length} violations (${critical.length} critical, ${serious.length} serious)`);
  for (const v of [...critical, ...serious]) {
    console.log(`  [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} nodes)`);
  }
}

await scan('onboarding');
await page.getByRole('button', { name: 'Skip' }).click();
await page.waitForTimeout(400);
await scan('canvas-empty');
await page.getByRole('button', { name: 'Templates' }).click();
await page.getByRole('button', { name: 'Use template' }).first().click();
await page.waitForTimeout(300);
const rep = page.getByRole('button', { name: 'Replace' });
if (await rep.isVisible().catch(() => false)) await rep.click();
await page.waitForTimeout(800);
await scan('canvas+forecast');
await browser.close();
