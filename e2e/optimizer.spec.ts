/**
 * e2e/optimizer.spec.ts — run the optimizer on the renter template and
 * apply the top candidate.
 */
import { expect, test } from '@playwright/test';
import { clickTab, loadRenterTemplate, skipOnboarding } from './helpers';

test('run optimizer and apply a candidate', async ({ page }) => {
  await skipOnboarding(page);
  await loadRenterTemplate(page);
  await clickTab(page, 'Optimizer');

  const panel = page.locator('[role="tabpanel"]');
  await panel.getByRole('button', { name: 'Find best splits' }).click();
  // Engine reports what it searched; candidates render with Apply buttons.
  await expect(panel.getByText(/Searched all \d+ allocations/)).toBeVisible();
  const applyButtons = panel.getByRole('button', { name: 'Apply' });
  await expect(applyButtons.first()).toBeVisible();

  // Apply candidate #1 → toast confirms, and it is undoable.
  await applyButtons.first().click();
  await expect(page.getByRole('alert').first()).toContainText('Applied candidate #1');
});
