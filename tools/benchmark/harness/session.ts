/**
 * Browser session for the Phase 2 evidence runners (performance plan §8/§9).
 *
 * Release protocol: branded stable browsers, headed, on the machine running
 * the harness. Branded Chrome cannot take Playwright's pipe transport through
 * a wrapper such as `flatpak run`, so it is launched as an ordinary process
 * with a fresh profile and attached over CDP; branded Firefox is driven over
 * WebDriver BiDi (`channel: 'moz-firefox'`). Without `release`, the
 * automation-bundled Playwright engine is launched headless, which is
 * directional evidence only.
 *
 * Headed runs need an unlocked, awake session: a locked Wayland session stops
 * frame callbacks, so presentation-timed waits stall. `startSession` refuses
 * a release run on a locked session (logind LockedHint).
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { chromium, firefox, type Browser, type Page } from '@playwright/test';
import { build, preview, type PreviewServer } from 'vite';
import { assertServes, type CompareDist } from './compare.ts';

const require = createRequire(import.meta.url);

export const playwrightVersion = (require('@playwright/test/package.json') as { version: string })
  .version;

const repoRoot = path.resolve(import.meta.dirname, '../../..');
const CDP_PORT = 9335;
const PREVIEW_PORT = 4185;
const TARGET_RASTER = { width: 1024, height: 640 };
const STEP_TIMEOUT_MS = 2 * 60_000;

export const RELEASE_LABEL =
  'release protocol (plan §9): branded stable browser, headed, declared target hardware, ≥21 warm pairs, BCa paired intervals';
export const DIRECTIONAL_LABEL =
  'automation-bundled engine — directional only, not release evidence per plan §9';

export interface Session {
  readonly browser: Browser;
  /** `current` is the build under test; each compare dist is keyed by its name. */
  readonly baseUrls: Record<string, string>;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly launchedBy: string | undefined;
  /** logind LockedHint at start: 'yes', 'no' or 'unknown'. */
  readonly lockedHint: 'yes' | 'no' | 'unknown';
  readonly powerMode: string | null;
  readonly version: string;
  readonly userAgent: string;
  close(): Promise<void>;
}

interface LaunchedBrowser {
  readonly browser: Browser;
  readonly close: () => Promise<void>;
  readonly launchedBy: string | undefined;
}

const launchBrandedChrome = async (
  executablePath: string | undefined,
  cdpPort: number,
): Promise<LaunchedBrowser> => {
  const command = (executablePath ?? 'flatpak run com.google.Chrome').split(/\s+/);
  const profileRoot = command.includes('com.google.Chrome')
    ? path.join(os.homedir(), '.var/app/com.google.Chrome')
    : os.tmpdir();
  mkdirSync(profileRoot, { recursive: true });
  const profileDir = mkdtempSync(path.join(profileRoot, 'int-m-evidence-'));
  const child = spawn(
    command[0] ?? 'flatpak',
    [
      ...command.slice(1),
      `--remote-debugging-port=${cdpPort}`,
      `--user-data-dir=${profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  let connected: Browser | undefined;
  for (let attempt = 0; attempt < 120 && connected === undefined; attempt += 1) {
    try {
      connected = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`);
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  if (connected === undefined) {
    child.kill();
    throw new Error(`branded Chrome did not expose CDP: ${command.join(' ')}`);
  }
  const browser = connected;
  const exited = new Promise((resolve) => child.once('exit', resolve));
  const close = async (): Promise<void> => {
    const session = await browser.newBrowserCDPSession();
    await session.send('Browser.close').catch(() => undefined);
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 10_000))]);
    rmSync(profileDir, { recursive: true, force: true });
  };
  return { browser, close, launchedBy: `${command.join(' ')} (CDP)` };
};

const launchEvidenceBrowser = async (
  engine: 'chromium' | 'firefox',
  release: boolean,
  executablePath: string | undefined,
): Promise<LaunchedBrowser> => {
  if (release && engine === 'chromium') return launchBrandedChrome(executablePath, CDP_PORT);
  const launcher = engine === 'chromium' ? chromium : firefox;
  const launched = await launcher.launch({
    headless: !release,
    ...(release
      ? { channel: 'moz-firefox', executablePath: executablePath ?? '/usr/bin/firefox' }
      : {}),
    ...(!release && executablePath !== undefined ? { executablePath } : {}),
  });
  return {
    browser: launched,
    close: () => launched.close(),
    launchedBy: release ? `${executablePath ?? '/usr/bin/firefox'} (WebDriver BiDi)` : undefined,
  };
};

/** Human-readable automation label recorded in each environment capture. */
export const automationLabel = (
  engine: 'chromium' | 'firefox',
  release: boolean,
  launchedBy: string | undefined,
): string =>
  release
    ? `Playwright ${playwrightVersion} driving branded stable ${engine === 'chromium' ? 'Google Chrome' : 'Firefox'}, headed: ${launchedBy}`
    : `Playwright ${playwrightVersion} automation-bundled ${engine}, headless`;

const readSysfs = (file: string): string | null => {
  try {
    return readFileSync(file, 'utf8').trim();
  } catch {
    return null;
  }
};

/** Power state from sysfs (Linux): AC adapter flag and ACPI platform profile. */
export const readPowerMode = (): string | null => {
  const ac = readSysfs('/sys/class/power_supply/AC/online');
  const profile = readSysfs('/sys/firmware/acpi/platform_profile');
  if (ac === null && profile === null) return null;
  return `${ac === '1' ? 'AC' : ac === '0' ? 'battery' : 'power source unknown'}, platform profile ${profile ?? 'unknown'}`;
};

/**
 * Whether the session is locked (logind LockedHint). Returns null when the
 * state is unknown.
 */
export const sessionLocked = (): boolean | null => {
  const sessionId = process.env['XDG_SESSION_ID'];
  const result = spawnSync(
    'loginctl',
    ['show-session', ...(sessionId === undefined ? [] : [sessionId]), '-p', 'LockedHint'],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) return null;
  return result.stdout.includes('LockedHint=yes');
};

/** Waits for the explorer's stable render stage (an attribute set by the app). */
const waitForStable = async (page: Page): Promise<void> => {
  await page.waitForFunction(
    () =>
      globalThis.document.querySelector('#explorer')?.getAttribute('data-render-stage') ===
      'stable',
    undefined,
    { timeout: STEP_TIMEOUT_MS, polling: 5 },
  );
};

/**
 * Finds the viewport at which the app's stack measures exactly the shipping
 * 1024x640 raster, starting from 1600x900 and correcting up to five times.
 */
const calibrateViewport = async (
  browser: Browser,
  baseUrl: string,
): Promise<{ width: number; height: number }> => {
  let size = { width: 1600, height: 900 };
  const context = await browser.newContext({ viewport: size, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/?perf=1`);
  await waitForStable(page);
  const measure = (): Promise<{ width: number; height: number }> =>
    page.evaluate(() => {
      const element = globalThis.document.querySelector('.explorer__stack');
      if (element === null) throw new Error('explorer stack missing');
      const rect = element.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });
  let rect = await measure();
  for (
    let attempt = 0;
    attempt < 5 &&
    !(
      Math.round(rect.width) === TARGET_RASTER.width &&
      Math.round(rect.height) === TARGET_RASTER.height
    );
    attempt += 1
  ) {
    size = {
      width: Math.max(320, Math.round(size.width + TARGET_RASTER.width - rect.width)),
      height: Math.max(320, Math.round(size.height + TARGET_RASTER.height - rect.height)),
    };
    await page.setViewportSize(size);
    await page.waitForTimeout(250);
    rect = await measure();
  }
  await context.close();
  if (
    Math.round(rect.width) !== TARGET_RASTER.width ||
    Math.round(rect.height) !== TARGET_RASTER.height
  ) {
    throw new Error(`viewport calibration failed: ${rect.width}x${rect.height}`);
  }
  return size;
};

const readUserAgent = async (browser: Browser): Promise<string> => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const value = await page.evaluate(() => globalThis.navigator.userAgent);
  await context.close();
  return value;
};

/**
 * Builds the production bundle, serves the build under test (and each compare
 * dist) with `vite preview`, launches the browser, and calibrates the
 * viewport. `close()` closes the browser and every preview server.
 */
export const startSession = async (options: {
  engine: 'chromium' | 'firefox';
  release: boolean;
  compareDists: readonly { name: string; dir: string }[];
  executablePath?: string;
}): Promise<Session> => {
  const lockedHint = sessionLocked();
  if (options.release && lockedHint === true) {
    throw new Error(
      'the session is locked: headed release runs stall without frame callbacks; unlock it first',
    );
  }
  await build({
    root: repoRoot,
    configFile: path.join(repoRoot, 'vite.config.ts'),
    logLevel: 'warn',
  });
  const servers: PreviewServer[] = [];
  let launch: LaunchedBrowser | undefined;
  try {
    const baseUrls: Record<string, string> = {};
    const serve = async (root: string, port: number, target?: CompareDist): Promise<string> => {
      // A compare dist is served from its own directory: without the explicit
      // outDir, preview would serve the parent config's `dist`, the current build.
      const server = await preview({
        root,
        configFile: path.join(root, 'vite.config.ts'),
        ...(target === undefined ? {} : { build: { outDir: target.dir } }),
        preview: { host: '127.0.0.1', port, strictPort: true },
      });
      servers.push(server);
      if (target !== undefined) assertServes(target.name, server.config, target.dir);
      return `http://127.0.0.1:${port}`;
    };
    const currentUrl = await serve(repoRoot, PREVIEW_PORT);
    baseUrls['current'] = currentUrl;
    for (const [index, compare] of options.compareDists.entries()) {
      baseUrls[compare.name] = await serve(
        path.dirname(compare.dir),
        PREVIEW_PORT + 1 + index,
        compare,
      );
    }

    const launched = await launchEvidenceBrowser(
      options.engine,
      options.release,
      options.executablePath,
    );
    launch = launched;
    const viewport = await calibrateViewport(launched.browser, currentUrl);
    const userAgent = await readUserAgent(launched.browser);
    return {
      browser: launched.browser,
      baseUrls,
      viewport,
      launchedBy: launched.launchedBy,
      lockedHint: lockedHint === null ? 'unknown' : lockedHint ? 'yes' : 'no',
      powerMode: readPowerMode(),
      version: launched.browser.version(),
      userAgent,
      close: async () => {
        try {
          await launched.close();
        } finally {
          await Promise.all(servers.map((server) => server.close()));
        }
      },
    };
  } catch (error) {
    await launch?.close().catch(() => undefined);
    await Promise.all(servers.map((server) => server.close().catch(() => undefined)));
    throw error;
  }
};
