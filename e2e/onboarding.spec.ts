/**
 * e2e/onboarding.spec.ts — first-run flow: the guided 3-step onboarding
 * builds a real graph and the forecast appears.
 */
import { expect, test } from '@playwright/test';

test('onboarding builds a graph and the forecast appears', async ({ page }) => {
  await page.goto('/');
  // Welcome step is visible.
  await expect(page.getByRole('dialog')).toContainText('See your next 90 days of money');

  // Step 1: balance.
  await page.getByLabel('Current balance in dollars').fill('2500');
  await page.getByRole('button', { name: 'Next' }).click();

  // Step 2: paycheck.
  await page.getByLabel('Paycheck amount in dollars').fill('1850');
  await page.getByRole('button', { name: 'Next' }).click();

  // Step 3: biggest bill.
  await page.getByPlaceholder('1400').fill('1400');
  await page.getByRole('button', { name: 'Build my plan' }).click();

  // Onboarding is gone; the canvas has the built graph (balance + paycheck + bill).
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.react-flow__node')).toHaveCount(3);

  // The forecast tab shows a real forecast for the built graph.
  const panel = page.locator('[role="tabpanel"]');
  await expect(panel.getByText('Safe to spend', { exact: true })).toBeVisible();
  await expect(panel.getByRole('alert').getByText('◆ Lowest point', { exact: true })).toBeVisible();
  await expect(panel.locator('svg.recharts-wrapper, .recharts-wrapper').first()).toBeVisible();
});
