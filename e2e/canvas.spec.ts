/**
 * e2e/canvas.spec.ts — add an expense node via the palette and watch the
 * forecast update.
 */
import { expect, test } from '@playwright/test';
import { clickTab, nodeCount, skipOnboarding } from './helpers';

test('add an expense node via the palette and see the forecast update', async ({ page }) => {
  await skipOnboarding(page);

  const panel = page.locator('[role="tabpanel"]');
  const before = await panel.getByText('Safe to spend', { exact: true }).locator('..').textContent();

  const beforeNodes = await nodeCount(page);
  // Click the palette's Expense item (click = place at viewport center).
  await page.locator('aside[aria-label="Node palette"]').getByRole('button', { name: /Expense/ }).click();
  await page.waitForTimeout(400);
  expect(await nodeCount(page)).toBe(beforeNodes + 1);

  // The new expense node is selected → its inspector is open; set $500 monthly.
  await expect(page.locator('[role="tabpanel"]')).toContainText('Edit node');
  const amountInput = page.getByLabel('Amount', { exact: true });
  await amountInput.fill('500');
  await amountInput.blur();
  await page.waitForTimeout(600);

  // Back to the forecast: safe-to-spend moved down by the new bill.
  await clickTab(page, 'Forecast');
  const after = await panel.getByText('Safe to spend', { exact: true }).locator('..').textContent();
  expect(after).not.toBe(before);
  // The new bill drags the minimum lower.
  await expect(panel.getByRole('alert').getByText('◆ Lowest point', { exact: true })).toBeVisible();
});
