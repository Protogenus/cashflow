// One-off: check React Flow node keyboard focusability + Enter behavior.
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
await page.waitForTimeout(800);

// Focus the canvas region, then Tab through and report what gets focus.
await page.locator('.react-flow').click();
const focused = [];
for (let i = 0; i < 8; i++) {
  await page.keyboard.press('Tab');
  await page.waitForTimeout(150);
  const info = await page.evaluate(() => {
    const el = document.activeElement;
    return {
      tag: el?.tagName,
      cls: (el?.className?.baseVal ?? el?.className ?? '').toString().slice(0, 80),
      label: el?.getAttribute?.('aria-label')?.slice(0, 60) ?? null,
      text: (el?.textContent ?? '').slice(0, 40).replace(/\s+/g, ' '),
    };
  });
  focused.push(info);
}
console.log(JSON.stringify(focused, null, 1));

// Find a node element, focus it, press Enter, check selection/inspector.
const nodeCount = await page.locator('.react-flow__node').count();
console.log('rf nodes in DOM:', nodeCount);
const tabbables = await page.evaluate(() => {
  const els = [...document.querySelectorAll('.react-flow__node')];
  return els.slice(0, 3).map((el) => ({ tabIndex: el.tabIndex, role: el.getAttribute('role') }));
});
console.log('node tabIndex/role:', JSON.stringify(tabbables));
await browser.close();
