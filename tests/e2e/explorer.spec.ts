import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const wcagTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const expectNoAccessibilityViolations = async (page: Page): Promise<void> => {
  const results = await new AxeBuilder({ page }).withTags(wcagTags).analyze();
  expect(
    results.violations,
    results.violations
      .map(
        (violation) =>
          `${violation.id}: ${violation.help} (${violation.nodes
            .map((node) => node.target.join(' '))
            .join(', ')})`,
      )
      .join('\n'),
  ).toEqual([]);
};

const failRenderer = async (page: Page, count = 1): Promise<void> => {
  await page.evaluate((failureCount) => {
    const testGlobal = globalThis as typeof globalThis & {
      __MI_PHASE1_TEST__?: { failRenderer(): void };
    };
    const testApi = testGlobal.__MI_PHASE1_TEST__;
    if (!testApi) throw new Error('Phase 1 test seam is unavailable');
    for (let index = 0; index < failureCount; index += 1) {
      testApi.failRenderer();
    }
  }, count);
};

test.describe('Mandelbrot Interiority explorer', () => {
  test('starts with a useful, explained semantic view', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Mandelbrot Interiority' })).toBeVisible();
    await expect(page.getByLabel('Interior view')).toHaveValue('stability');
    await expect(page.getByText('How quickly the orbit settles')).toBeVisible();

    const catalog = page.getByRole('button', { name: /Catalog/ });
    await expect(catalog).toHaveAttribute('aria-pressed', 'true');
    await expect(catalog).toContainText('Shown');

    await expect(page.getByRole('heading', { name: 'Semantic legend' })).toBeVisible();
    await expect(page.getByText('Unresolved', { exact: true })).toBeVisible();
    await expect(page.getByText('No claim at current quality')).toBeVisible();

    await expect(page.getByRole('heading', { name: 'Start with structure' })).toBeVisible();
    await page.getByRole('button', { name: 'Explore' }).click();
    await expect(page.getByRole('heading', { name: 'Start with structure' })).not.toBeVisible();

    await expect(page.getByRole('status', { name: 'Render status' })).toBeVisible();
    await expect(page.getByLabel('Interactive Mandelbrot set')).toBeVisible();
  });

  test('supports keyboard navigation, reset, and an explicit zoom bound', async ({ page }) => {
    await page.goto('/');
    const canvas = page.getByLabel('Interactive Mandelbrot set');
    const reset = page.getByRole('button', { name: /Reset/ });

    await expect(reset).toBeDisabled();
    await canvas.focus();
    await canvas.press('+');
    await expect(reset).toBeEnabled();

    await canvas.press('0');
    await expect(reset).toBeDisabled();

    await canvas.press('-');
    await canvas.press('-');
    await expect(page.getByText('Already showing the complete Mandelbrot set.')).toBeVisible();

    await canvas.press('0');
    for (let step = 0; step < 31; step += 1) {
      await canvas.press('+');
    }
    await expect(page.getByLabel('Magnification')).toHaveText('6.00e6×');
    await expect(page.getByRole('button', { name: 'Zoom in' })).toBeDisabled();
    await expect(
      page.getByText(
        'Reached the current reliable zoom limit for this renderer and numerical budget.',
      ),
    ).toBeVisible();
  });

  test('catalog markers are keyboard-selectable and populate evidence', async ({ page }) => {
    await page.goto('/');

    const mainCardioid = page.getByRole('button', {
      name: 'Inspect Main cardioid, period 1',
    });
    await expect(mainCardioid).toBeVisible({ timeout: 20_000 });
    await mainCardioid.focus();
    await mainCardioid.press('Enter');

    await expect(page.getByRole('heading', { name: 'Main cardioid' })).toBeVisible();
    await expect(page.getByText('Internal address')).toBeVisible();
    await expect(page.getByText('Attracting cycle', { exact: true })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator('.facts').getByText('Stability exponent κ')).toBeVisible();

    const catalog = page.getByRole('button', { name: /Catalog/ });
    await catalog.click();
    await expect(catalog).toHaveAttribute('aria-pressed', 'false');
    await expect(mainCardioid).not.toBeVisible();
  });

  test('changes semantic views and updates their explanation', async ({ page }) => {
    await page.goto('/');

    await page.getByLabel('Interior view').selectOption('multiplier');
    await expect(
      page.getByText('The strength and angle of attraction around a detected cycle.'),
    ).toBeVisible();
    await expect(page.getByText(/Hue shows rotation/)).toBeVisible();
    await expect(page.getByText('Multiplier angle', { exact: true })).toBeVisible();

    await page.getByLabel('Interior view').selectOption('period');
    await expect(page.getByText('The detected attracting-cycle period.')).toBeVisible();
    await expect(
      page.getByText(
        'Each color category represents the exact detected attracting-cycle period p.',
      ),
    ).toBeVisible();
    await expect(page.getByText('Period 1', { exact: true })).toBeVisible();
    await expect(page.getByText('Period 3+', { exact: true })).toBeVisible();
  });

  test('zooms to a selected area and reveals labels as magnification increases', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Explore' }).click();

    const regionTool = page.getByRole('button', { name: 'Zoom area' });
    await regionTool.click();
    await expect(regionTool).toHaveAttribute('aria-pressed', 'true');

    const canvas = page.getByLabel('Interactive Mandelbrot set');
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.25);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.75, { steps: 4 });
    await expect(page.locator('.zoom-selection')).toBeVisible();
    await page.mouse.up();

    await expect(page.getByText('Zoomed to selected area.')).toBeVisible();
    await expect(page.locator('.zoom-selection')).not.toBeVisible();
    await expect
      .poll(async () =>
        Number.parseFloat((await page.getByLabel('Magnification').textContent()) ?? '0'),
      )
      .toBeGreaterThanOrEqual(1.9);
    await expect
      .poll(async () =>
        Number.parseFloat((await page.getByLabel('Magnification').textContent()) ?? '0'),
      )
      .toBeLessThanOrEqual(2.1);
    await expect(page.getByRole('button', { name: 'Reset' })).toBeEnabled();

    await page.getByRole('button', { name: 'Reset' }).click();
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await page.getByRole('button', { name: 'Zoom in' }).click();
    const periodFour = page.getByRole('button', {
      name: 'Inspect Period-4 component 2, period 4',
    });
    await expect(periodFour.locator('.catalog-marker__label')).toBeVisible();
  });

  test('previews pointer pan immediately and cleans up cancelled interaction', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Explore' }).click();
    await expect(page.getByRole('status', { name: 'Render status' })).toContainText(
      'Stable frame',
      {
        timeout: 20_000,
      },
    );

    const canvas = page.getByLabel('Interactive Mandelbrot set');
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    const initialCenter = await page.locator('.coordinates__center').textContent();
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.62, box.y + box.height * 0.58, { steps: 3 });
    await expect(canvas).toHaveCSS('transform', /matrix\(1, 0, 0, 1,/);

    await canvas.dispatchEvent('pointercancel', { pointerId: 1, isPrimary: true });
    await expect(canvas).toHaveCSS('transform', 'none');
    await expect(page.locator('.coordinates__center')).toHaveText(initialCenter ?? '');

    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5, { steps: 3 });
    await page.mouse.up();
    await expect(page.locator('.coordinates__center')).not.toHaveText(initialCenter ?? '');
    await expect(page.getByRole('status', { name: 'Render status' })).toContainText(
      'Stable frame',
      {
        timeout: 20_000,
      },
    );
    await expect(canvas).toHaveCSS('transform', 'none');
  });

  test('marks and describes arbitrary escaped, attracting, and unresolved points', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Explore' }).click();
    const canvas = page.getByLabel('Interactive Mandelbrot set');
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    const inspectAt = async (x: number, y: number, outcome: string): Promise<void> => {
      await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
      await expect(page.getByText(outcome, { exact: true })).toBeVisible({ timeout: 10_000 });
      await expect(page.locator('.selected-point-marker')).toBeVisible();
      await expect(page.locator('.facts').getByText('Parameter c', { exact: true })).toBeVisible();
      await expect(page.locator('.facts').getByText('Evidence', { exact: true })).toBeVisible();
      await expect(page.locator('.facts').getByText('Quality', { exact: true })).toBeVisible();
      await expect(page.locator('#selected-point-status')).toContainText(
        `Outcome: ${outcome.toLowerCase()}`,
      );
    };

    await inspectAt(0.6375, 0.5, 'Attracting cycle');
    await expect(
      page.locator('.facts').getByText('Detected period', { exact: true }),
    ).toBeVisible();
    await expect(
      page.locator('.facts').getByText('Multiplier magnitude', { exact: true }),
    ).toBeVisible();
    await inspectAt(0.9375, 0.5, 'Escaped');
    await expect(
      page.locator('.facts').getByText('Escape iteration', { exact: true }),
    ).toBeVisible();
    await expect(
      page.locator('.facts').getByText('Final magnitude', { exact: true }),
    ).toBeVisible();
    // This high-period real-axis neighborhood remains unresolved within the
    // Balanced profile's finite iteration and period search budget.
    await inspectAt(0.338, 0.5, 'Unresolved');
    await expect(page.getByText('No conclusive evidence at current quality')).toBeVisible();
    await expect(page.locator('.inspector__coordinate')).toContainText('c =');
    await expect(page.getByText('How to read these values')).toBeVisible();

    const marker = page.locator('.selected-point-marker');
    const markerStyle = await marker.getAttribute('style');
    await canvas.focus();
    await canvas.press('ArrowLeft');
    await expect(marker).toBeVisible();
    await expect.poll(() => marker.getAttribute('style')).not.toBe(markerStyle);
    const pannedMarkerStyle = await marker.getAttribute('style');
    await canvas.press('+');
    await expect(marker).toBeVisible();
    await expect.poll(() => marker.getAttribute('style')).not.toBe(pannedMarkerStyle);
    await page.getByLabel('Quality').selectOption('detailed');
    await expect(marker).toBeVisible();
    const periodTwo = page.getByRole('button', {
      name: 'Inspect Period-2 bulb, period 2',
    });
    await expect(periodTwo).toBeVisible({ timeout: 20_000 });
    await periodTwo.click();
    await expect(marker).toBeVisible();
    await page.getByRole('button', { name: 'Reset' }).click();
    await expect(marker).toBeHidden();
    await expect(page.locator('#selected-point-status')).toHaveText('No point selected.');
  });

  test('automatically recovers once and offers manual retry after persistent failure', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('status', { name: 'Render status' })).toContainText(
      'Stable frame',
      {
        timeout: 20_000,
      },
    );

    await failRenderer(page);
    await expect(page.getByRole('status', { name: 'Render status' })).toContainText(
      'Stable frame',
      {
        timeout: 20_000,
      },
    );
    await expect(page.getByRole('button', { name: 'Retry renderer' })).toBeHidden();

    await failRenderer(page, 2);
    await expect(page.getByRole('status', { name: 'Render status' })).toContainText(
      'Renderer could not recover. Controls remain available.',
    );
    const retry = page.getByRole('button', { name: 'Retry renderer' });
    await expect(retry).toBeVisible();
    await page.getByLabel('Interior view').selectOption('period');
    await expect(page.getByLabel('Interior view')).toHaveValue('period');

    await retry.click();
    await expect(page.getByRole('status', { name: 'Render status' })).toContainText(
      'Stable frame',
      {
        timeout: 20_000,
      },
    );
  });

  test('records presentation-path performance marks', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Explore' }).click();
    await expect(page.getByRole('status', { name: 'Render status' })).toContainText(
      'Stable frame',
      {
        timeout: 20_000,
      },
    );
    await page.waitForFunction(
      () => performance.getEntriesByName('mi:stable-presented').length > 0,
    );
    const marks = await page.evaluate(() =>
      performance
        .getEntriesByType('mark')
        .filter((entry) => entry.name.startsWith('mi:'))
        .map((entry) => ({ name: entry.name, startTime: entry.startTime })),
    );
    for (const name of [
      'mi:app-mount',
      'mi:guidance-interaction',
      'mi:render-request',
      'mi:coarse-presented',
      'mi:stable-presented',
    ]) {
      expect(
        marks.some((mark) => mark.name === name),
        `${name} was not recorded`,
      ).toBe(true);
    }
    const first = (name: string): number =>
      marks.find((mark) => mark.name === name)?.startTime ?? Number.POSITIVE_INFINITY;
    expect(first('mi:app-mount')).toBeLessThanOrEqual(first('mi:render-request'));
    expect(first('mi:guidance-interaction')).toBeLessThanOrEqual(first('mi:coarse-presented'));
    expect(first('mi:render-request')).toBeLessThanOrEqual(first('mi:coarse-presented'));
    expect(first('mi:coarse-presented')).toBeLessThanOrEqual(first('mi:stable-presented'));
  });

  test('explains evidence terms and exposes bounded quality profiles', async ({ page }) => {
    await page.goto('/');

    const help = page.getByText('How to read these values');
    await help.click();
    await expect(page.getByText('Multiplier magnitude |λ|', { exact: true })).toBeVisible();
    await expect(page.getByText(/Attraction strength per iteration/)).toBeVisible();
    await expect(page.getByText(/unresolved still means no claim/)).toBeVisible();

    const quality = page.getByLabel('Quality');
    await expect(quality).toHaveValue('balanced');
    await quality.selectOption('detailed');
    await expect(page.getByText(/Detailed quality selected · 1024 iterations/)).toBeVisible();
    await expect(page.getByText(/Checks longer and higher-period cycles/)).toBeVisible();
  });

  test('has no automated WCAG A or AA violations in primary states', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByLabel('Interactive Mandelbrot set')).toBeVisible();
    await expectNoAccessibilityViolations(page);

    await page.getByRole('button', { name: 'Explore' }).click();
    const mainCardioid = page.getByRole('button', {
      name: 'Inspect Main cardioid, period 1',
    });
    await expect(mainCardioid).toBeVisible({ timeout: 20_000 });
    await mainCardioid.click();
    await expect(page.getByRole('heading', { name: 'Main cardioid' })).toBeVisible();
    await expectNoAccessibilityViolations(page);
  });
});
