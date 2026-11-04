// Perf: MC 5000x90d in the real worker + tab-switch survival + optimizer timing.
import { chromium } from '@playwright/test';
import os from 'os';
import path from 'path';

const CHROME = path.join(os.homedir(), '.cache/ms-playwright/chromium-1248/chrome-linux64/chrome');
const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Skip' }).click();
await page.waitForTimeout(600);
await page.getByRole('button', { name: 'Templates' }).click();
await page.getByRole('button', { name: 'Use template' }).first().click();
await page.waitForTimeout(400);
const replaceBtn = page.getByRole('button', { name: 'Replace' });
if (await replaceBtn.isVisible().catch(() => false)) await replaceBtn.click();
await page.waitForTimeout(800);

// MC tab, 5000 runs
async function gotoTab(name) {
  await page.evaluate((n) => {
    const tabs = [...document.querySelectorAll('[role="tab"]')];
    const t = tabs.find((el) => el.textContent.trim() === n);
    t?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, name);
  await page.getByRole('tab', { name }).click();
}
await gotoTab('MC');
await page.waitForTimeout(400);
await page.evaluate(() => {
  const slider = document.querySelector('input[type="range"][aria-label="Simulation runs"]');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(slider, '5000');
  slider.dispatchEvent(new Event('input', { bubbles: true }));
});
await page.waitForTimeout(300);
const t0 = Date.now();
await page.getByRole('button', { name: 'Run simulation' }).click();
// Switch away mid-run: the run must survive now.
await page.waitForTimeout(700);
const probeT0 = Date.now();
await gotoTab('Forecast');
const probeMs = Date.now() - probeT0;
const fcVisible = await page.getByText('SAFE TO SPEND').isVisible().catch(() => false);
await gotoTab('MC');
console.log(`tab switch mid-run: ${probeMs}ms, forecast rendered while worker busy: ${fcVisible}`);
await page.waitForSelector('text=/simulated futures your balance stayed positive/', { timeout: 120000 });
const mcMs = Date.now() - t0;
const headline = await page.locator('.cf-panel p, .cf-panel div').first().textContent().catch(() => '');
const full = await page.locator('[role="tabpanel"]').textContent();
const m = full?.match(/([\d.]+)s$/m) || full?.match(/in ([\d.]+)s/);
console.log(`MC 5000 runs x 90d wall: ${mcMs}ms (target < 3000ms)`);

// determinism check
const seedLine = (full?.match(/seed \d+/) || [''])[0];
await page.getByRole('button', { name: '↻ Re-run with same seed' }).click();
await page.waitForTimeout(300);
await page.waitForSelector('text=/simulated futures your balance stayed positive/', { timeout: 120000 });
await page.waitForTimeout(300);
const full2 = await page.locator('[role="tabpanel"]').textContent();
const h1 = (full?.match(/In \d+ of 100[^.]*\./) || [''])[0];
const h2 = (full2?.match(/In \d+ of 100[^.]*\./) || [''])[0];
console.log('seed:', seedLine, '| re-run identical headline:', h1 === h2 && h1 !== '');

// Optimizer timing
await gotoTab('Optimizer');
await page.waitForTimeout(500);
const o0 = Date.now();
const runOpt = page.getByRole('button', { name: 'Find best splits' });
if (await runOpt.isVisible().catch(() => false)) {
  await runOpt.click();
  await page.waitForSelector('text=/Searched all .* allocations/', { timeout: 30000 });
  const searchNote = await page.locator('text=/Searched all/').textContent();
  console.log(`Optimizer run: ${Date.now() - o0}ms (target < 3000ms) — ${searchNote?.trim()}`);
} else {
  const txt = await page.locator('[role="tabpanel"]').textContent();
  console.log('optimizer panel state:', txt?.slice(0, 160).replace(/\s+/g, ' '));
}
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
