/**
 * Shared browser launch for the Phase 2 evidence runners (performance plan §9).
 *
 * Release protocol: branded stable browsers, headed, on the machine running
 * the harness. Branded Chrome cannot take Playwright's pipe transport through
 * a wrapper such as `flatpak run`, so it is launched as an ordinary process
 * with a fresh profile and attached over CDP; branded Firefox is driven over
 * WebDriver BiDi (`channel: 'moz-firefox'`). Without `release`, the
 * automation-bundled Playwright engine is launched headless (or headed under
 * the caller's display), which is directional evidence only.
 *
 * Headed runs need an unlocked, awake session: a locked Wayland session stops
 * frame callbacks, so presentation-timed waits stall. Wrap long headed runs
 * in the session's screensaver inhibitor (KDE: `kde-inhibit --screenSaver`);
 * `sessionLocked` lets a runner refuse to start on a locked session.
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const require = createRequire(import.meta.url);
const { chromium, firefox } = require('@playwright/test');

export const playwrightVersion = require('@playwright/test/package.json').version;

const launchBrandedChrome = async ({ executablePath, cdpPort }) => {
  const command = (executablePath ?? 'flatpak run com.google.Chrome').split(/\s+/);
  const profileRoot = command.includes('com.google.Chrome')
    ? path.join(os.homedir(), '.var/app/com.google.Chrome')
    : os.tmpdir();
  mkdirSync(profileRoot, { recursive: true });
  const profileDir = mkdtempSync(path.join(profileRoot, 'int-m-evidence-'));
  const child = spawn(
    command[0],
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
  let connected;
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
  const exited = new Promise((resolve) => child.once('exit', resolve));
  const close = async () => {
    const session = await connected.newBrowserCDPSession();
    await session.send('Browser.close').catch(() => undefined);
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 10_000))]);
    rmSync(profileDir, { recursive: true, force: true });
  };
  return { browser: connected, close, launchedBy: `${command.join(' ')} (CDP)` };
};

/**
 * @param {{ engine: 'chromium' | 'firefox', release: boolean, headed?: boolean,
 *   executablePath?: string, cdpPort?: number }} options
 */
export const launchEvidenceBrowser = async ({
  engine,
  release,
  headed = false,
  executablePath,
  cdpPort = 9333,
}) => {
  if (release && engine === 'chromium') return launchBrandedChrome({ executablePath, cdpPort });
  const launcher = engine === 'chromium' ? chromium : firefox;
  const launched = await launcher.launch({
    headless: !(release || headed),
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
export const automationLabel = ({ engine, release, headed = false, launchedBy }) =>
  release
    ? `Playwright ${playwrightVersion} driving branded stable ${engine === 'chromium' ? 'Google Chrome' : 'Firefox'}, headed: ${launchedBy}`
    : `Playwright ${playwrightVersion} automation-bundled ${engine}, ${headed ? 'headed' : 'headless'}`;

export const RELEASE_LABEL =
  'release protocol (plan §9): branded stable browser, headed, declared target hardware, ≥21 warm pairs, BCa paired intervals';
export const DIRECTIONAL_LABEL =
  'automation-bundled engine — directional only, not release evidence per plan §9';

const readSysfs = (file) => {
  try {
    return readFileSync(file, 'utf8').trim();
  } catch {
    return null;
  }
};

/** Power state from sysfs (Linux): AC adapter flag and ACPI platform profile. */
export const readPowerMode = () => {
  const ac = readSysfs('/sys/class/power_supply/AC/online');
  const profile = readSysfs('/sys/firmware/acpi/platform_profile');
  if (ac === null && profile === null) return null;
  return `${ac === '1' ? 'AC' : ac === '0' ? 'battery' : 'power source unknown'}, platform profile ${profile ?? 'unknown'}`;
};

/**
 * Refuses a headed release run on a locked session (logind LockedHint), where
 * presentation-timed waits would stall. Returns null when the state is unknown.
 */
export const sessionLocked = () => {
  const sessionId = process.env['XDG_SESSION_ID'];
  const result = spawnSync(
    'loginctl',
    ['show-session', ...(sessionId === undefined ? [] : [sessionId]), '-p', 'LockedHint'],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) return null;
  return /LockedHint=yes/.test(result.stdout);
};
