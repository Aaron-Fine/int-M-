import { expect, test } from '@playwright/test';

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
    await expect(page.getByText('Attracting cycle')).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText('Stability exponent κ')).toBeVisible();

    const catalog = page.getByRole('button', { name: /Catalog/ });
    await catalog.click();
    await expect(catalog).toHaveAttribute('aria-pressed', 'false');
    await expect(mainCardioid).not.toBeVisible();
  });

  test('changes semantic views and updates their explanation', async ({ page }) => {
    await page.goto('/');

    await page.getByLabel('Interior view').selectOption('period');
    await expect(page.getByText('The detected attracting-cycle period.')).toBeVisible();
    await expect(
      page.getByText('Color categories represent the exact detected attracting-cycle period.'),
    ).toBeVisible();
    await expect(page.getByText('Period 1', { exact: true })).toBeVisible();
    await expect(page.getByText('Period 3+', { exact: true })).toBeVisible();
  });
});
