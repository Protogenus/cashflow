/**
 * e2e/export-import.spec.ts — export JSON, wipe the canvas, import the file
 * back, and confirm the plan is restored.
 */
import { expect, test } from '@playwright/test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { clickTab, loadRenterTemplate, nodeCount, skipOnboarding } from './helpers';

test('export JSON then import it back', async ({ page }) => {
  await skipOnboarding(page);
  await loadRenterTemplate(page);
  expect(await nodeCount(page)).toBeGreaterThan(3);
  await clickTab(page, 'Settings');

  const panel = page.locator('[role="tabpanel"]');
  // Export → real downloaded file.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    panel.getByRole('button', { name: 'Export JSON' }).click(),
  ]);
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cf-')), 'export.json');
  await download.saveAs(tmp);
  const exported = JSON.parse(fs.readFileSync(tmp, 'utf8'));
  expect(exported.schemaVersion).toBe(1);
  expect(exported.scenarios.length).toBeGreaterThanOrEqual(1);
  const exportedNodes = exported.scenarios[0].graph.nodes.length;
  expect(exportedNodes).toBeGreaterThan(3);

  // Wipe the canvas via Templates → Clear canvas (confirmed).
  await page.getByRole('button', { name: 'Templates' }).click();
  await page.getByRole('button', { name: 'Clear canvas' }).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Clear canvas' }).click();
  await page.waitForTimeout(500);
  expect(await nodeCount(page)).toBe(0);
  // Dialog closed after clearing.
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Import the file back → summary → replace → graph restored.
  await clickTab(page, 'Settings');
  await panel.locator('input[type="file"]').setInputFiles(tmp);
  await expect(panel.getByText(/File looks good/)).toBeVisible();
  await panel.getByRole('button', { name: 'Replace current plan' }).click();
  await page.waitForTimeout(500);
  expect(await nodeCount(page)).toBe(exportedNodes);

  // And the forecast is live again on the restored graph.
  await clickTab(page, 'Forecast');
  await expect(page.locator('[role="tabpanel"]').getByText('Safe to spend', { exact: true })).toBeVisible();
});
