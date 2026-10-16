import { defineConfig, devices } from '@playwright/test';

const devServer = Boolean(process.env['PLAYWRIGHT_DEV_SERVER']);
const previewURL = 'http://127.0.0.1:4174';
const devURL = 'http://127.0.0.1:5173';
const pilotSpec = /numerical-verifier-pilot\.spec\.ts/;

const engines = [
  { name: 'chromium', device: devices['Desktop Chrome'] },
  { name: 'firefox', device: devices['Desktop Firefox'] },
] as const;

// Dev mode runs every spec against the dev server. The default run serves the
// production preview build for the suite and the dev server only for the
// numerical verifier pilot, which needs the /poc research module.
const projects = devServer
  ? engines.map(({ name, device }) => ({
      name,
      use: { ...device, baseURL: devURL },
    }))
  : [
      ...engines.map(({ name, device }) => ({
        name,
        testIgnore: pilotSpec,
        use: { ...device, baseURL: previewURL },
      })),
      ...engines.map(({ name, device }) => ({
        name: `pilot-${name}`,
        testMatch: pilotSpec,
        use: { ...device, baseURL: devURL },
      })),
    ];

const previewServer = {
  command:
    'npx vite build --mode e2e --outDir dist-e2e --emptyOutDir --logLevel warn && npx vite preview --outDir dist-e2e --host 127.0.0.1 --port 4174 --strictPort',
  url: previewURL,
  reuseExistingServer: !process.env['CI'],
  timeout: 180_000,
};

const devServerConfig = {
  command: 'npm run dev',
  url: devURL,
  reuseExistingServer: !process.env['CI'],
  timeout: 180_000,
};

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 2 : 0,
  ...(process.env['CI'] ? { workers: 2 } : {}),
  reporter: process.env['CI']
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects,
  webServer: devServer ? [devServerConfig] : [previewServer, devServerConfig],
});
