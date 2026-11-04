/**
 * e2e/no-network.spec.ts — privacy gate: a full session (onboarding,
 * forecast, Monte Carlo) must make zero network requests carrying user
 * data. Any request to a non-local host fails the test.
 */
import { expect, test } from '@playwright/test';

test('no network calls with user data during a full session', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (req) => {
    const url = new URL(req.url());
    const local = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
    if (!local) external.push(req.url());
  });

  await page.goto('/');
  await expect(page.getByRole('dialog')).toContainText('See your next 90 days of money');
  await page.getByLabel('Current balance in dollars').fill('2500');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('Paycheck amount in dollars').fill('1850');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByPlaceholder('1400').fill('1400');
  await page.getByRole('button', { name: 'Build my plan' }).click();
  await expect(page.locator('[role="tabpanel"]').getByText('Safe to spend', { exact: true })).toBeVisible();

  // Exercise the worker path too (same-origin worker script is fine).
  await page.evaluate(() => {
    const tabs = [...document.querySelectorAll('[role="tab"]')];
    tabs.find((el) => el.textContent?.trim() === 'Monte Carlo')?.click();
  });
  await page.getByRole('button', { name: 'Run simulation' }).click();
  await expect(
    page.locator('[role="tabpanel"]').getByText(/simulated futures your balance stayed positive/),
  ).toBeVisible({ timeout: 30000 });

  expect(external).toEqual([]);
});
