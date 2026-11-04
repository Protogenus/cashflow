/**
 * e2e/mobile.spec.ts — small-screen behavior: the plan renders as a node
 * list (not the cramped canvas), nodes expand to the same editor, and the
 * results section works with no horizontal overflow.
 */
import { expect, test } from '@playwright/test';
import { clickTab } from './helpers';

test.use({ viewport: { width: 375, height: 812 } });

test('mobile list view: browse, expand, and edit a node', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Skip' }).click();
  await page.waitForTimeout(500);

  // Plan section shows the node list grouped by type; canvas is not rendered.
  await expect(page.getByRole('button', { name: '☰ List' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: 'Money in' })).toBeVisible();
  await expect(page.locator('.react-flow')).toHaveCount(0);

  // Expand a node card → the same editor fields appear inline.
  await page.getByRole('button', { name: /Expense: Rent/ }).click();
  await expect(page.getByLabel('Amount', { exact: true })).toBeVisible();

  // Add a node from the list-view add bar.
  await page.getByLabel('Node type to add').selectOption('goal');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.waitForTimeout(400);
  await expect(page.getByText('GOALS & DEBTS')).toBeVisible();

  // Results section: forecast renders, tablist scrolls, no page-level h-scroll.
  await page.getByRole('button', { name: 'Results' }).click();
  await clickTab(page, 'Forecast');
  await expect(page.locator('[role="tabpanel"]').getByText('Safe to spend', { exact: true })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBe(0);

  // The manual canvas toggle still works on small screens.
  await page.getByRole('button', { name: 'Plan' }).click();
  await page.getByRole('button', { name: '⤢ Canvas' }).click();
  await expect(page.locator('.react-flow')).toBeVisible();
});
