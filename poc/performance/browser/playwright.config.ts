import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const browserDir = import.meta.dirname;
const port = 4178;

// Playwright driver for the browser PoC harness (plan §5 decision block,
// §9 protocol). Headless Chromium only; serves the production app bundle
// (vite build + vite preview) plus the microbench page built from fixtures/.
export default defineConfig({
  testDir: path.join(browserDir, 'tests'),
  // Measurements are sequential and long; parallelism would fight for CPU and
  // invalidate the very wall-clock samples this harness records.
  fullyParallel: false,
  workers: 1,
  timeout: 600_000,
  forbidOnly: Boolean(process.env['CI']),
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    headless: true,
    trace: 'off',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
  webServer: {
    command: `node ${JSON.stringify(path.join(browserDir, 'scripts/build-and-preview.mjs'))}`,
    url: `http://127.0.0.1:${port}/poc-bench/index.html`,
    // Default: build + serve fresh for every run (deterministic evidence).
    // Set MI_POC_REUSE=1 to reuse a manually started preview server while
    // iterating on measurements.
    reuseExistingServer: Boolean(process.env['MI_POC_REUSE']),
    timeout: 300_000,
  },
});
