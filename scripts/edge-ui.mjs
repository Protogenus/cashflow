// One-off: UI edge cases — empty graph forecast panel, negative balance display.
import { chromium } from '@playwright/test';
import os from 'os';
import path from 'path';

const CHROME = path.join(os.homedir(), '.cache/ms-playwright/chromium-1248/chrome-linux64/chrome');
const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push('console: ' + m.text().slice(0, 120)); });
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Skip' }).click();
await page.waitForTimeout(600);

// Empty graph: Templates -> Clear canvas (confirm) -> check forecast panel message
await page.getByRole('button', { name: 'Templates' }).click();
await page.getByRole('button', { name: 'Clear canvas' }).click();
await page.waitForTimeout(300);
await page.getByRole('button', { name: 'Clear canvas' }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/edge-empty.png' });
const emptyText = await page.locator('[role="tabpanel"]').textContent();
console.log('EMPTY GRAPH panel shows:', JSON.stringify(emptyText?.slice(0, 200)));

// Rebuild minimal: skip onboarding template via evaluating? Use TemplatePicker renter template
await page.getByRole('button', { name: 'Templates' }).click();
await page.getByRole('button', { name: 'Use template' }).first().click();
await page.waitForTimeout(800);
await page.screenshot({ path: '/tmp/edge-template.png' });
const fcText = await page.locator('[role="tabpanel"]').textContent();
console.log('TEMPLATE forecast has safe-to-spend:', fcText?.includes('Safe to spend') || fcText?.includes('SAFE TO SPEND'));
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
