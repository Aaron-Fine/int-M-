import { defineConfig, devices } from '@playwright/test';

/**
 * Advisory screenshot suite (PHASE2-TODO item 5, owner decision Q6). The gate
 * for image regressions is the colorized-buffer hash test
 * (tests/unit/render/colorized-golden.test.ts); these baselines are compared
 * only inside the pinned Playwright container, because font rendering and
 * anti-aliasing differ between hosts. `npx playwright test` and
 * `npm run check` never run this suite. See fixtures/README.md.
 */
const previewURL = 'http://127.0.0.1:4175';

// Baselines are only meaningful when rendered in the pinned container, so
// updating them is refused unless tools/run-visual-container.sh set this.
// CI never sets it and never updates snapshots.
const updating = process.argv.some(
  (argument) => argument === '-u' || argument.startsWith('--update-snapshots'),
);
if (updating && process.env['MI_VISUAL_CONTAINER'] !== '1') {
  throw new Error(
    'Refusing to update screenshot baselines outside the pinned container: run npm run test:visual:container -- --update-snapshots=all',
  );
}

export default defineConfig({
  testDir: './tests/visual',
  snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{arg}{ext}',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-visual' }]],
  outputDir: 'test-results/visual',
  updateSnapshots: 'none',
  expect: {
    toHaveScreenshot: { animations: 'disabled', caret: 'hide', scale: 'css' },
  },
  use: {
    baseURL: previewURL,
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    colorScheme: 'light',
    reducedMotion: 'reduce',
    trace: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: {
    command:
      'npx vite build --mode e2e --outDir dist-visual --emptyOutDir --logLevel warn && npx vite preview --outDir dist-visual --host 127.0.0.1 --port 4175 --strictPort',
    url: previewURL,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
