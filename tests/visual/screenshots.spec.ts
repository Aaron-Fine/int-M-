import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/**
 * Advisory browser screenshots (PHASE2-TODO item 5, owner decision Q6):
 * three views, one per semantic view, and two UI states, in Chromium and
 * Firefox. Baselines live in tests/visual/__screenshots__/<engine>/ and are
 * written and compared only in the pinned Playwright container
 * (npm run test:visual:container). A difference is a prompt to look, not a
 * build failure: the colorized-buffer hashes
 * (tests/unit/render/colorized-golden.test.ts) are the gate.
 */

const VOLATILE = path.join(import.meta.dirname, 'volatile.css');
const RASTER_ONLY = path.join(import.meta.dirname, 'raster-only.css');

/** Opens `url`, closes the first-use guide and waits for the stable frame. */
const openSettled = async (page: Page, url: string): Promise<void> => {
  await page.goto(url);
  await page.getByRole('button', { name: 'Explore', exact: true }).click();
  await expect(page.locator('#explorer')).toHaveAttribute('data-render-stage', 'stable', {
    timeout: 60_000,
  });
};

const RASTER_VIEWS = [
  { name: 'default-stability', path: '/' },
  {
    name: 'period-four-126x-period',
    path: '/?v=1&c=-0.158902249,-1.034028&s=0.019841269841269841269&view=period&q=detailed',
  },
  {
    name: 'feigenbaum-2500x-multiplier',
    path: '/?v=1&c=-1.401155189092,0&s=0.001&view=multiplier',
  },
] as const;

for (const view of RASTER_VIEWS) {
  test(`raster: ${view.name}`, async ({ page }) => {
    await openSettled(page, view.path);
    await expect(page.locator('.explorer__stack')).toHaveScreenshot(`${view.name}.png`, {
      stylePath: [VOLATILE, RASTER_ONLY],
    });
  });
}

test('UI state: catalog overlay on the default view', async ({ page }) => {
  await openSettled(page, '/');
  await expect(page.getByRole('button', { name: 'Inspect Main cardioid, period 1' })).toBeVisible();
  await expect(page.locator('#explorer')).toHaveScreenshot('catalog-overlay.png', {
    stylePath: VOLATILE,
  });
});

test('UI state: a selected catalog marker and its evidence', async ({ page }) => {
  await openSettled(page, '/');
  const rabbit = page.getByRole('button', { name: 'Inspect Douady rabbit, period 3' });
  await rabbit.focus();
  await rabbit.press('Enter');
  const evidence = page.getByRole('region', { name: 'Point evidence' });
  await expect(evidence.locator('.inspector__classification')).toHaveText('Attracting cycle', {
    timeout: 10_000,
  });
  await expect(page.locator('#explorer')).toHaveScreenshot('selected-marker.png', {
    stylePath: VOLATILE,
  });
  await expect(evidence).toHaveScreenshot('selected-marker-evidence.png', { stylePath: VOLATILE });
});
