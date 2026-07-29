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
