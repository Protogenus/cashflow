// Visual QA: screenshot every main screen in light/dark x desktop/mobile.
// Output: docs/screenshots/<screen>-<theme>-<viewport>.png
import { chromium } from '@playwright/test';
import os from 'os';
import path from 'path';
import fs from 'fs';

const CHROME = path.join(os.homedir(), '.cache/ms-playwright/chromium-1248/chrome-linux64/chrome');
const OUT = '/home/hatch/workspace/cashflow-planner/docs/screenshots';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME });
const allErrors = [];

async function clickTab(page, name) {
  await page.evaluate((n) => {
    const tabs = [...document.querySelectorAll('[role="tab"]')];
    tabs.find((el) => el.textContent?.trim() === n)?.scrollIntoView({ block: 'nearest' });
  }, name);
  await page.getByRole('tab', { name }).click();
  await page.waitForTimeout(500);
}

async function setupDesktop(page, theme) {
  if (theme === 'dark') await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  // onboarding shot first (fresh)
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/onboarding-${theme}-desktop.png` });
  await page.getByRole('button', { name: 'Skip' }).click();
  await page.waitForTimeout(400);
  // load renter template
  await page.getByRole('button', { name: 'Templates' }).click();
  await page.getByRole('button', { name: 'Use template' }).first().click();
  await page.waitForTimeout(300);
  const rep = page.getByRole('button', { name: 'Replace' });
  if (await rep.isVisible().catch(() => false)) await rep.click();
  await page.waitForTimeout(900);
}

async function desktopSuite(theme) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => allErrors.push(`${theme}-desktop pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) allErrors.push(`${theme}-desktop console: ${m.text().slice(0, 120)}`); });
  await setupDesktop(page, theme);

  await page.screenshot({ path: `${OUT}/canvas-${theme}-desktop.png` });
  await clickTab(page, 'Forecast');
  await page.screenshot({ path: `${OUT}/forecast-${theme}-desktop.png` });
  await clickTab(page, 'Alerts');
  await page.screenshot({ path: `${OUT}/alerts-${theme}-desktop.png` });
  await clickTab(page, 'Scenarios');
  await page.screenshot({ path: `${OUT}/scenarios-${theme}-desktop.png` });

  await clickTab(page, 'Optimizer');
  await page.getByRole('button', { name: 'Find best splits' }).click();
  await page.waitForSelector('text=/Searched all/', { timeout: 30000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/optimizer-${theme}-desktop.png` });

  await clickTab(page, 'MC');
  await page.evaluate(() => {
    const slider = document.querySelector('input[type="range"][aria-label="Simulation runs"]');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(slider, '500');
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.getByRole('button', { name: 'Run simulation' }).click();
  await page.waitForSelector('text=/simulated futures your balance stayed positive/', { timeout: 60000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/montecarlo-${theme}-desktop.png` });

  await clickTab(page, 'Tradeoff');
  await page.evaluate(() => {
    const slider = document.querySelector('input[type="range"][aria-label="Monte Carlo runs per candidate"]')
      || [...document.querySelectorAll('input[type="range"]')].find((s) => s.getAttribute('aria-label')?.includes('candidate'));
    if (slider) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(slider, '500');
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  const runTrade = page.getByRole('button', { name: 'Stress-test candidates' });
  if (await runTrade.isVisible().catch(() => false)) {
    await runTrade.click();
    await page.waitForSelector('text=/Goal score|overdraft/i', { timeout: 120000 }).catch(() => {});
    await page.waitForTimeout(600);
  }
  await page.screenshot({ path: `${OUT}/tradeoff-${theme}-desktop.png` });

  await clickTab(page, 'Settings');
  await page.screenshot({ path: `${OUT}/settings-${theme}-desktop.png` });
  await page.close();
  console.log(`desktop ${theme} done`);
}

async function mobileSuite(theme) {
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  if (theme === 'dark') await page.emulateMedia({ colorScheme: 'dark' });
  page.on('pageerror', (e) => allErrors.push(`${theme}-mobile pageerror: ${e.message}`));
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/onboarding-${theme}-mobile.png` });
  await page.getByRole('button', { name: 'Skip' }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/list-${theme}-mobile.png` });
  await page.getByRole('button', { name: 'Results' }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/forecast-${theme}-mobile.png` });
  await page.close();
  console.log(`mobile ${theme} done`);
}

await desktopSuite('light');
await desktopSuite('dark');
await mobileSuite('light');
await mobileSuite('dark');
await browser.close();
console.log('ERRORS:', allErrors.length ? allErrors : 'none');
