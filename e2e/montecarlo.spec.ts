/**
 * e2e/montecarlo.spec.ts — run Monte Carlo with 500 runs: fan chart,
 * frequency-framed probabilities, and same-seed determinism.
 */
import { expect, test } from '@playwright/test';
import { clickTab, loadRenterTemplate, skipOnboarding } from './helpers';

test('run Monte Carlo with 500 runs and see fan chart + probabilities', async ({ page }) => {
  await skipOnboarding(page);
  await loadRenterTemplate(page);
  await clickTab(page, 'Monte Carlo');

  const panel = page.locator('[role="tabpanel"]');
  // Set 500 runs via the slider (native setter so React sees the change).
  await page.evaluate(() => {
    const slider = document.querySelector('input[type="range"][aria-label="Simulation runs"]') as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    setter.call(slider, '500');
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  });

  await panel.getByRole('button', { name: 'Run simulation' }).click();
  // Progress bar appears while the worker runs.
  await expect(panel.locator('[role="progressbar"]')).toBeVisible();
  // Headline in frequency framing, then the fan chart.
  await expect(panel.getByText(/simulated futures your balance stayed positive/)).toBeVisible({ timeout: 30000 });
  await expect(panel.locator('.recharts-wrapper').first()).toBeVisible();
  await expect(panel.getByText(/seed \d+/).first()).toBeVisible();

  // Same seed → identical headline (determinism, verified in the real worker).
  const headline = await panel.getByText(/In \d+ of 100 simulated futures/).textContent();
  await panel.getByRole('button', { name: '↻ Re-run with same seed' }).click();
  await expect(panel.getByText(/simulated futures your balance stayed positive/)).toBeVisible({ timeout: 30000 });
  await page.waitForTimeout(400);
  const headline2 = await panel.getByText(/In \d+ of 100 simulated futures/).textContent();
  expect(headline2).toBe(headline);
});
