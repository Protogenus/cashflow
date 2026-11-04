/** e2e/helpers.ts — shared Playwright helpers for the E2E suite. */
import type { Page } from '@playwright/test';

/** Click a results-panel tab (the tablist scrolls horizontally). */
export async function clickTab(page: Page, name: string) {
  await page.evaluate((n) => {
    const tabs = [...document.querySelectorAll('[role="tab"]')];
    tabs.find((el) => el.textContent?.trim() === n)?.scrollIntoView({ block: 'nearest' });
  }, name);
  await page.getByRole('tab', { name }).click();
}

/** Dismiss first-run onboarding via Skip; the starter graph stays. */
export async function skipOnboarding(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Skip' }).click();
  await page.waitForTimeout(400);
}

/** Load the first starter template, confirming the replace dialog. */
export async function loadRenterTemplate(page: Page) {
  await page.getByRole('button', { name: 'Templates' }).click();
  await page.getByRole('button', { name: 'Use template' }).first().click();
  await page.waitForTimeout(300);
  const replace = page.getByRole('button', { name: 'Replace' });
  if (await replace.isVisible().catch(() => false)) await replace.click();
  await page.waitForTimeout(500);
}

/** Number of nodes currently on the canvas. */
export async function nodeCount(page: Page): Promise<number> {
  return page.locator('.react-flow__node').count();
}
