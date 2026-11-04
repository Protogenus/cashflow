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
await page.waitForTimeout(5000);
const info = await page.evaluate(() => {
  const mm = document.querySelector('.react-flow__minimap svg');
  if (!mm) return { found: false };
  const nodes = [...mm.querySelectorAll('.react-flow__minimap-node')];
  return {
    found: true,
    svgW: mm.getAttribute('width'), svgH: mm.getAttribute('height'),
    viewBox: mm.getAttribute('viewBox'),
    nodeCount: nodes.length,
    firstNode: nodes[0]?.outerHTML.slice(0, 200),
    svgChildren: mm.innerHTML.length,
    svgSample: mm.innerHTML.slice(0, 300),
  };
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
