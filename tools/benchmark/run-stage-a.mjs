#!/usr/bin/env node
/**
 * Stage A browser evidence runner (performance plan §8/§9/§10).
 *
 * Produces the release-comparable paired evidence for the legacy-scan
 * reference vs a candidate classifier mode (`--candidate`, default
 * checkpoint) in the production bundle, and the baseline record for
 * the absolute latency budgets (plan §9 program-level success):
 *
 * - builds the production bundle once (`vite build`) and serves it via
 *   `vite preview` — never the dev server;
 * - drives the real application UI for every case in the frozen corpus
 *   (tools/benchmark/corpus.v1.json, shipping-1024x640 raster, the case's
 *   profile) × mode (legacy-scan, candidate) × paired repetitions with
 *   alternating baseline/candidate order;
 * - cold/warm separation: the first repetition per case runs each arm in a
 *   fresh browser context (cold); the remaining repetitions re-navigate one
 *   persistent page (warm). Cancellation, cache, and replay interactions are
 *   out of scope for this first pass and documented as such;
 * - records EVERY sample raw (the full opt-in render-trace snapshot plus the
 *   stable-frame requestToPresentMs wall metric and a SHA-256 hash of the
 *   stable canvas, row-major RGBA) — no absolute timestamps in the records;
 * - writes the evidence directory per evidence/phase-2/README.md and emits
 *   manifest.sha256 last via tools/benchmark/manifest.mjs.
 *
 * Labels are honest: an automation-bundled engine (Playwright Chromium or
 * Firefox, headless) is directional evidence, not the release protocol of
 * plan §9 (stable branded Chrome/Firefox, headed, declared target hardware).
 * `--release` runs that protocol on the machine it is launched on: branded
 * stable browsers, headed, at least 22 repetitions (rep 0 is cold, so ≥21
 * warm pairs), with 95% BCa paired intervals per case.
 *
 * Usage:
 *   node tools/benchmark/run-stage-a.mjs [--engine chromium|firefox]
 *       [--reps 9] [--out-dir <evidence/phase-2/<date>-<commit>>]
 *       [--candidate checkpoint|triggered-scan] [--baseline-mirror-off]
 *       [--executable <browser binary>] (a cached build other than the one the
 *       installed Playwright expects; recorded in the environment capture)
 *       [--release] (branded stable, headed; --executable is then the branded
 *       browser: Firefox is driven over WebDriver BiDi, default /usr/bin/firefox;
 *       Chrome is a launch command connected over CDP, default
 *       `flatpak run com.google.Chrome`)
 *
 * --baseline-mirror-off renders the legacy-scan arm with
 * `conjugateMirror=0`, i.e. the production default before conjugate
 * mirroring became default-on, so the pair compares the old default against
 * the new one. Mirrored output is designed to be bit-identical, so the
 * semantic hash comparison is unaffected.
 */
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { build, preview } from 'vite';
import { bcaInterval } from './bca.ts';

const require = createRequire(import.meta.url);
const { chromium, firefox } = require('@playwright/test');

const repoRoot = path.resolve(import.meta.dirname, '../..');
const PREVIEW_PORT = 4179;
const CDP_PORT = 9333;
const BOOTSTRAP_REPS = 10_000;
const BOOTSTRAP_SEED = 20_261_011;
const SHIPPING_RASTER_ID = 'shipping-1024x640';
const TARGET_RASTER = { width: 1024, height: 640 };
const NAVIGATION_TIMEOUT_MS = 10 * 60_000;

const log = (message) => {
  process.stderr.write(`[stage-a] ${message}\n`);
};

const args = process.argv.slice(2);
const readOption = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};
const engine = readOption('--engine') ?? 'chromium';
if (engine !== 'chromium' && engine !== 'firefox') {
  process.stderr.write(`unknown engine: ${engine} (use chromium or firefox)\n`);
  process.exit(2);
}
const CANDIDATE = readOption('--candidate') ?? 'checkpoint';
if (CANDIDATE !== 'checkpoint' && CANDIDATE !== 'triggered-scan') {
  process.stderr.write(`unknown candidate: ${CANDIDATE} (use checkpoint or triggered-scan)\n`);
  process.exit(2);
}
const MODES = ['legacy-scan', CANDIDATE];
const BASELINE_MIRROR_OFF = args.includes('--baseline-mirror-off');
const RELEASE = args.includes('--release');
const reps = Number(readOption('--reps') ?? (RELEASE ? 22 : 9));
if (!Number.isInteger(reps) || reps < 2) {
  process.stderr.write('--reps must be an integer >= 2\n');
  process.exit(2);
}
if (RELEASE && reps < 22) {
  process.stderr.write(
    '--release needs --reps >= 22 (rep 0 is cold; plan §9 asks for >= 21 pairs)\n',
  );
  process.exit(2);
}

const corpusPath = path.join(repoRoot, 'tools/benchmark/corpus.v1.json');
const corpus = JSON.parse(readFileSync(corpusPath, 'utf8'));
const corpusSha256 = createHash('sha256').update(readFileSync(corpusPath)).digest('hex');
const shippingRaster = corpus.rasters.find((raster) => raster.id === SHIPPING_RASTER_ID);
if (shippingRaster === undefined) {
  process.stderr.write(`corpus is missing the ${SHIPPING_RASTER_ID} raster\n`);
  process.exit(2);
}

// Case filter for smoke/development runs; the normative Stage A pass runs the
// full frozen corpus (the default).
const caseFilter = readOption('--cases');
const selectedCases =
  caseFilter === undefined
    ? corpus.cases
    : corpus.cases.filter((caseInfo) => caseFilter.split(',').includes(caseInfo.id));
if (selectedCases.length === 0) {
  process.stderr.write(`--cases matched nothing: ${caseFilter}\n`);
  process.exit(2);
}

const shortCommit = (() => {
  const result = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  return result.status === 0 ? result.stdout.trim() : 'unknown';
})();
const runDate = new Date().toISOString().slice(0, 10);
const defaultOutDir = path.join(repoRoot, 'evidence/phase-2', `${runDate}-${shortCommit}`);
const outDir = path.resolve(readOption('--out-dir') ?? defaultOutDir);
mkdirSync(outDir, { recursive: true });

// ---------------------------------------------------------------------------
// Small stats helpers (aggregates are derived views; every sample is stored).
// ---------------------------------------------------------------------------
const median = (values) => {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const mad = (values) => {
  const center = median(values);
  if (center === undefined) return undefined;
  return median(values.map((value) => Math.abs(value - center)));
};
const formatMs = (value) => (value === undefined ? '—' : `${value.toFixed(1)} ms`);

// ---------------------------------------------------------------------------
// In-page capture. Browser globals are reached through globalThis because this
// module also runs in Node; Playwright serializes the functions into the page.
// Hash byte order (documented): row-major RGBA from getImageData — bytes walk
// rows from the top-left pixel, four bytes (R, G, B, A) per pixel.
// ---------------------------------------------------------------------------
const hasCompletedComputedStableTrace = () => {
  const hook = globalThis.__miRenderTrace;
  return (
    !!hook &&
    hook
      .snapshot()
      .some(
        (trace) =>
          trace.outcome === 'completed' &&
          trace.frames.some((frame) => frame.stage === 'stable' && frame.source === 'computed'),
      )
  );
};

const capturePageState = async () => {
  const hook = globalThis.__miRenderTrace;
  if (!hook) throw new Error('window.__miRenderTrace missing — did ?perf=1 apply?');
  const traces = hook.snapshot();
  const canvas = globalThis.document.querySelector('canvas.explorer__canvas');
  if (!(canvas instanceof globalThis.HTMLCanvasElement)) {
    throw new Error('render canvas not found');
  }
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('2D context unavailable for hashing');
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  let algorithm;
  let hash;
  if (globalThis.crypto && globalThis.crypto.subtle) {
    algorithm = 'sha-256';
    const digest = await globalThis.crypto.subtle.digest('SHA-256', image.data);
    hash = [...new globalThis.Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  } else {
    algorithm = 'fnv-1a-32';
    let state = 0x811c9dc5;
    for (const byte of image.data) {
      state ^= byte;
      state = Math.imul(state, 0x01000193);
    }
    hash = (state >>> 0).toString(16).padStart(8, '0');
  }
  return {
    traces,
    semanticHash: { algorithm, hash, width: canvas.width, height: canvas.height },
    viewport: hook.viewport(),
    devicePixelRatio: globalThis.devicePixelRatio,
  };
};

// ---------------------------------------------------------------------------
// Build once, serve, calibrate the viewport to the shipping raster.
// ---------------------------------------------------------------------------
log(`engine=${engine} reps=${reps}`);
log('building production bundle (vite build)…');
const buildStarted = Date.now();
await build({
  root: repoRoot,
  configFile: path.join(repoRoot, 'vite.config.ts'),
  logLevel: 'warn',
});
log(`build finished in ${Math.round((Date.now() - buildStarted) / 1000)}s`);

const server = await preview({
  root: repoRoot,
  configFile: path.join(repoRoot, 'vite.config.ts'),
  preview: { host: '127.0.0.1', port: PREVIEW_PORT, strictPort: true },
});
const baseUrl = `http://127.0.0.1:${PREVIEW_PORT}`;
log(`vite preview serving dist/ at ${baseUrl}`);

const launcher = engine === 'chromium' ? chromium : firefox;
const playwrightVersion = require('@playwright/test/package.json').version;
const executablePath = readOption('--executable');

// Branded Chrome cannot take Playwright's pipe transport through a wrapper such
// as `flatpak run`, so it is launched as an ordinary process with a fresh
// profile and attached over CDP; branded Firefox is driven over WebDriver BiDi.
const launchBrandedChrome = async () => {
  const command = (executablePath ?? 'flatpak run com.google.Chrome').split(/\s+/);
  const profileRoot = command.includes('com.google.Chrome')
    ? path.join(os.homedir(), '.var/app/com.google.Chrome')
    : os.tmpdir();
  mkdirSync(profileRoot, { recursive: true });
  const profileDir = mkdtempSync(path.join(profileRoot, 'int-m-stage-a-'));
  const child = spawn(
    command[0],
    [
      ...command.slice(1),
      `--remote-debugging-port=${CDP_PORT}`,
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
      connected = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`);
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  if (connected === undefined)
    throw new Error(`branded Chrome did not expose CDP: ${command.join(' ')}`);
  const exited = new Promise((resolve) => child.once('exit', resolve));
  const close = async () => {
    const session = await connected.newBrowserCDPSession();
    await session.send('Browser.close').catch(() => undefined);
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 10_000))]);
    rmSync(profileDir, { recursive: true, force: true });
  };
  return { browser: connected, close, launchedBy: `${command.join(' ')} (CDP)` };
};

const launchBrowser = async () => {
  if (RELEASE && engine === 'chromium') return launchBrandedChrome();
  const launched = await launcher.launch({
    headless: !RELEASE,
    ...(RELEASE
      ? { channel: 'moz-firefox', executablePath: executablePath ?? '/usr/bin/firefox' }
      : {}),
    ...(!RELEASE && executablePath !== undefined ? { executablePath } : {}),
  });
  return {
    browser: launched,
    close: () => launched.close(),
    launchedBy: RELEASE ? `${executablePath ?? '/usr/bin/firefox'} (WebDriver BiDi)` : undefined,
  };
};

const { browser, close: closeBrowser, launchedBy } = await launchBrowser();
log(
  `${engine} ${browser.version()} launched ` +
    (RELEASE ? `(branded, headed: ${launchedBy})` : '(headless, automation-bundled)'),
);

const newContext = () => browser.newContext({ viewport: viewportSize, deviceScaleFactor: 1 });

const stableTraceOf = (traces) => {
  const computedStable = traces.filter(
    (trace) =>
      trace.outcome === 'completed' &&
      trace.frames.some((frame) => frame.stage === 'stable' && frame.source === 'computed'),
  );
  const trace = computedStable[computedStable.length - 1];
  if (trace === undefined) throw new Error('no completed computed stable trace found');
  const stableFrame = trace.frames.find(
    (frame) => frame.stage === 'stable' && frame.source === 'computed',
  );
  if (stableFrame === undefined) throw new Error('stable computed frame missing');
  return { trace, stableFrame, computedStableCount: computedStable.length };
};

const waitForStableComputedTrace = (page) =>
  page.waitForFunction(hasCompletedComputedStableTrace, undefined, {
    timeout: NAVIGATION_TIMEOUT_MS,
    polling: 200,
  });
const measureStackRect = (page) =>
  page.evaluate(() => {
    const stack = globalThis.document.querySelector('.explorer__stack');
    if (!stack) throw new Error('.explorer__stack not found');
    const rect = stack.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });

const calibrateViewport = async () => {
  const context = await browser.newContext({
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/?perf=1`);
  await waitForStableComputedTrace(page);
  let size = { width: 1600, height: 900 };
  let rect = await measureStackRect(page);
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
    rect = await measureStackRect(page);
  }
  await context.close();
  if (
    Math.round(rect.width) !== TARGET_RASTER.width ||
    Math.round(rect.height) !== TARGET_RASTER.height
  ) {
    throw new Error(
      `viewport calibration failed: canvas stack is ${rect.width}x${rect.height}, ` +
        `need a ${TARGET_RASTER.width}x${TARGET_RASTER.height} raster`,
    );
  }
  return size;
};

const viewportSize = await calibrateViewport();
log(
  `calibrated viewport ${viewportSize.width}x${viewportSize.height} → ` +
    `${TARGET_RASTER.width}x${TARGET_RASTER.height} raster`,
);

const measureOnce = async (page, spec) => {
  await page.goto(spec.url, { timeout: NAVIGATION_TIMEOUT_MS });
  await waitForStableComputedTrace(page);
  const state = await page.evaluate(capturePageState);
  const { trace, stableFrame, computedStableCount } = stableTraceOf(state.traces);
  if (trace.width !== TARGET_RASTER.width || trace.height !== TARGET_RASTER.height) {
    throw new Error(
      `${spec.caseId}: raster is ${trace.width}x${trace.height}, expected ` +
        `${TARGET_RASTER.width}x${TARGET_RASTER.height}`,
    );
  }
  if (state.semanticHash.width !== trace.width || state.semanticHash.height !== trace.height) {
    throw new Error(`${spec.caseId}: canvas raster does not match the traced raster`);
  }
  const expectedView = {
    center: { re: Number(spec.view.center.re), im: Number(spec.view.center.im) },
    spanY: Number(spec.view.spanY),
  };
  if (
    state.viewport.center.re !== expectedView.center.re ||
    state.viewport.center.im !== expectedView.center.im ||
    state.viewport.spanY !== expectedView.spanY
  ) {
    throw new Error(
      `${spec.caseId}: the application viewport ${JSON.stringify(state.viewport)} does not ` +
        `match the corpus view ${JSON.stringify(expectedView)} — ?view= was not applied`,
    );
  }
  const coarseFrame = trace.frames.find((frame) => frame.stage === 'coarse');
  return {
    engine,
    caseId: spec.caseId,
    caseClass: spec.caseClass,
    designation: spec.designation,
    profile: spec.profile,
    mode: spec.mode,
    repetition: spec.repetition,
    armOrder: spec.armOrder.join('|'),
    climate: spec.climate,
    view: spec.view,
    raster: { width: trace.width, height: trace.height },
    requestToPresentMs: stableFrame.requestToPresentMs,
    coarseRequestToPresentMs: coarseFrame === undefined ? null : coarseFrame.requestToPresentMs,
    workerCount: trace.workerCount,
    backend: trace.backend,
    viewKeyHash: trace.viewKeyHash,
    computedStableTraceCount: computedStableCount,
    semanticHash: state.semanticHash,
    devicePixelRatio: state.devicePixelRatio,
    traces: state.traces,
  };
};

const runCase = async (caseInfo) => {
  const profileId = caseInfo.profile.toLowerCase();
  const urlFor = (mode) =>
    `${baseUrl}/?perf=1&classifierMode=${mode}${mode === 'legacy-scan' && BASELINE_MIRROR_OFF ? '&conjugateMirror=0' : ''}&view=${caseInfo.center.re},${caseInfo.center.im},${caseInfo.spanY}&quality=${profileId}`;
  const samples = [];
  for (let repetition = 0; repetition < reps; repetition += 1) {
    const armOrder = repetition % 2 === 0 ? [...MODES] : [...MODES].reverse();
    const cold = repetition === 0;
    let warmContext;
    let warmPage;
    if (!cold) {
      warmContext = await newContext();
      warmPage = await warmContext.newPage();
    }
    try {
      for (const mode of armOrder) {
        const contextHandle = cold ? await newContext() : warmContext;
        const page = cold ? await contextHandle.newPage() : warmPage;
        try {
          const sample = await measureOnce(page, {
            url: urlFor(mode),
            caseId: caseInfo.id,
            caseClass: caseInfo.class,
            designation: caseInfo.designation,
            profile: caseInfo.profile,
            mode,
            repetition,
            armOrder,
            climate: cold ? 'cold' : 'warm',
            view: { center: caseInfo.center, spanY: caseInfo.spanY },
          });
          samples.push(sample);
          log(
            `${caseInfo.id} rep ${repetition} ${mode} (${sample.climate}): ` +
              `${sample.requestToPresentMs.toFixed(0)} ms`,
          );
        } finally {
          if (cold) await contextHandle.close();
        }
      }
    } finally {
      if (warmContext !== undefined) await warmContext.close();
    }
  }
  return samples;
};

log(`running ${selectedCases.length} cases × ${MODES.length} modes × ${reps} paired repetitions…`);
const allSamples = [];
for (const caseInfo of selectedCases) {
  allSamples.push(...(await runCase(caseInfo)));
}
log(`collected ${allSamples.length} samples`);

// ---------------------------------------------------------------------------
// Evidence packaging (evidence/phase-2/README.md contract). A second engine
// run into the same directory merges into the existing artifacts and the
// manifest is re-emitted last.
// ---------------------------------------------------------------------------
const userAgent = await (async () => {
  const context = await newContext();
  const page = await context.newPage();
  const value = await page.evaluate(() => globalThis.navigator.userAgent);
  await context.close();
  return value;
})();

const environmentPath = path.join(outDir, 'environment.json');
const existingEnvironment = existsSync(environmentPath)
  ? JSON.parse(readFileSync(environmentPath, 'utf8'))
  : undefined;
spawnSync(
  'node',
  [
    path.join(repoRoot, 'tools/benchmark/capture-environment.mjs'),
    '--out',
    environmentPath,
    '--note',
    `Stage A paired classifier-mode run (${engine}); production bundle via vite build + vite preview.`,
  ],
  { cwd: repoRoot, stdio: 'inherit' },
);
const environment = JSON.parse(readFileSync(environmentPath, 'utf8'));
// Power state from sysfs (Linux): AC adapter online flag and the ACPI platform
// profile; null where the machine does not expose them.
const readSysfs = (file) => {
  try {
    return readFileSync(file, 'utf8').trim();
  } catch {
    return null;
  }
};
const powerMode = (() => {
  const ac = readSysfs('/sys/class/power_supply/AC/online');
  const profile = readSysfs('/sys/firmware/acpi/platform_profile');
  if (ac === null && profile === null) return null;
  return `${ac === '1' ? 'AC' : ac === '0' ? 'battery' : 'power source unknown'}, platform profile ${profile ?? 'unknown'}`;
})();
const engineFacts = {
  build: browser.version(),
  engine: userAgent,
  headed: RELEASE,
  powerMode: RELEASE ? powerMode : null,
  devicePixelRatio: 1,
  viewport: viewportSize,
  automation: RELEASE
    ? `Playwright ${playwrightVersion} driving branded stable ${engine === 'chromium' ? 'Google Chrome' : 'Firefox'}, headed: ${launchedBy}`
    : `Playwright ${playwrightVersion} automation-bundled ${engine}, headless`,
  label: RELEASE
    ? 'release protocol (plan §9): branded stable browser, headed, declared target hardware, ≥21 warm pairs, BCa paired intervals'
    : 'automation-bundled headless engine — directional only, not release evidence per plan §9',
  workerCount: [...new Set(allSamples.map((sample) => sample.workerCount))].sort((a, b) => a - b),
  backend: 'cpu',
  samples: allSamples.length,
};
if (engine === 'chromium') {
  environment.browser = { ...engineFacts, notes: 'primary Stage A record' };
}
environment.browsers = { ...(existingEnvironment?.browsers ?? {}), [engine]: engineFacts };
environment.render = { workerCount: engineFacts.workerCount[0] ?? null, backend: 'cpu' };
environment.protocol = {
  buildMode: 'vite build (production bundle) served by vite preview; dev server never used',
  repetitions: reps,
  pairing:
    'per repetition both arms run adjacently; baseline/candidate order alternates per repetition',
  coldWarm:
    'repetition 0 runs each arm in a fresh browser context (cold; the browser process is shared and per-context HTTP cache is empty); repetitions 1+ re-navigate one persistent page (warm)',
  outOfScope:
    'cancellation interactions, cache/replay/recolor distributions, and catalog shard states are out of scope for this first Stage A pass',
  raster: SHIPPING_RASTER_ID,
  wallMetric: 'requestToPresentMs of the computed stable frame (plan §8 fresh delivery timing)',
  hashByteOrder:
    'SHA-256 over row-major RGBA bytes from getImageData(0, 0, width, height) of canvas.explorer__canvas',
  engineLabels: RELEASE
    ? 'chromium = branded stable Google Chrome, firefox = branded stable Firefox, both headed with DevTools closed, on the declared target hardware (the machine running this harness)'
    : 'chromium/firefox here are Playwright automation builds; branded stable browsers on declared target hardware remain the release protocol',
  powerMode: RELEASE
    ? `${powerMode ?? 'not exposed by sysfs'} (read from /sys at the end of the run)`
    : 'unknown in the headless automation environment; recorded as null',
  deviceScaleFactor:
    'every context is created with deviceScaleFactor 1 so the canvas raster is exactly the shipping 1024x640 raster',
  pairedIntervals: `95% BCa bootstrap on warm pairs, ${BOOTSTRAP_REPS} resamples, seed ${BOOTSTRAP_SEED} (tools/benchmark/bca.ts): median log-ratio ln(legacy/candidate) for the speed ratio, median candidate−legacy difference for the regression cap`,
};
environment.notes.push(`Browser facts filled by tools/benchmark/run-stage-a.mjs (${engine} run).`);
writeFileSync(environmentPath, `${JSON.stringify(environment, null, 2)}\n`);

const rawPath = path.join(outDir, 'raw-observations.json');
const existingRaw = existsSync(rawPath) ? JSON.parse(readFileSync(rawPath, 'utf8')) : undefined;
const samplesByEngine = { ...(existingRaw?.samplesByEngine ?? {}), [engine]: allSamples };
const rawObservations = {
  schemaVersion: 1,
  description:
    'Every Stage A sample, raw and timestamp-free. Aggregates in summary.md are derived views only.',
  corpus: {
    file: 'tools/benchmark/corpus.v1.json',
    schemaVersion: corpus.schemaVersion,
    sha256: corpusSha256,
  },
  raster: shippingRaster,
  repetitions: reps,
  bootstrap: { resamples: BOOTSTRAP_REPS, seed: BOOTSTRAP_SEED, alpha: 0.05, method: 'BCa' },
  samplesByEngine,
};
writeFileSync(rawPath, `${JSON.stringify(rawObservations, null, 2)}\n`);

// Semantic comparison: per case × rep hash equality between the two modes.
// A mismatch is a finding to enumerate, never a silent failure (checkpoint
// detections are oracle-certified additions, PR 4 evidence; the watched-lag
// triggered scan is expected to match legacy exactly).
const compare = (engineSamples) => {
  const cases = [];
  for (const caseInfo of selectedCases) {
    const caseSamples = engineSamples.filter((sample) => sample.caseId === caseInfo.id);
    const repsData = [];
    for (let repetition = 0; repetition < reps; repetition += 1) {
      const legacy = caseSamples.find(
        (sample) => sample.mode === 'legacy-scan' && sample.repetition === repetition,
      );
      const candidate = caseSamples.find(
        (sample) => sample.mode === CANDIDATE && sample.repetition === repetition,
      );
      if (legacy === undefined || candidate === undefined) continue;
      repsData.push({
        repetition,
        climate: legacy.climate,
        legacyHash: legacy.semanticHash.hash,
        candidateHash: candidate.semanticHash.hash,
        equal: legacy.semanticHash.hash === candidate.semanticHash.hash,
      });
    }
    const mismatchReps = repsData.filter((rep) => !rep.equal).map((rep) => rep.repetition);
    cases.push({
      caseId: caseInfo.id,
      hashAlgorithm:
        caseSamples[0] === undefined ? undefined : caseSamples[0].semanticHash.algorithm,
      matches: repsData.length - mismatchReps.length,
      mismatches: mismatchReps.length,
      mismatchRepetitions: mismatchReps,
      reps: repsData,
    });
  }
  return cases;
};

const comparisonPath = path.join(outDir, 'semantic-comparison.json');
const existingComparison = existsSync(comparisonPath)
  ? JSON.parse(readFileSync(comparisonPath, 'utf8'))
  : undefined;
const comparisonsByEngine = {
  ...(existingComparison?.comparisonsByEngine ?? {}),
  [engine]: compare(allSamples),
};
const semanticComparison = {
  schemaVersion: 1,
  method: {
    algorithm: allSamples[0] === undefined ? undefined : allSamples[0].semanticHash.algorithm,
    byteOrder:
      'row-major RGBA, 4 bytes per pixel, read via getImageData(0, 0, width, height) from canvas.explorer__canvas after the computed stable frame is presented',
    scope:
      'palette-inclusive proxy: the ring exposes no per-pixel period histogram, so the hash covers the final RGBA raster (status palette, period palette, smooth values) rather than discrete per-pixel fields',
    expectation:
      CANDIDATE === 'checkpoint'
        ? 'identical hashes expected on most cases; the checkpoint schedule may detect additional oracle-certified attracting pixels (PR 4 evidence), so mismatches are enumerated findings, not failures'
        : 'identical hashes expected on every case: the watched-lag triggered scan is bit-identical to the legacy scan on the corpus (Node parity); any mismatch is a finding',
  },
  candidateMode: CANDIDATE,
  baselineMirrorOff: BASELINE_MIRROR_OFF,
  comparisonsByEngine,
};
writeFileSync(comparisonPath, `${JSON.stringify(semanticComparison, null, 2)}\n`);

// Summary: warm paired medians per case, MAD, and the median part of the
// max(5%, 20 ms) cap. The BCa paired interval is not computed at this rep count.
const summarizeEngine = (engineSamples) =>
  selectedCases.map((caseInfo) => {
    const warm = engineSamples.filter(
      (sample) => sample.caseId === caseInfo.id && sample.climate === 'warm',
    );
    const cold = engineSamples.filter(
      (sample) => sample.caseId === caseInfo.id && sample.climate === 'cold',
    );
    const valuesFor = (mode) =>
      warm.filter((sample) => sample.mode === mode).map((sample) => sample.requestToPresentMs);
    const legacyWarm = valuesFor('legacy-scan');
    const candidateWarm = valuesFor(CANDIDATE);
    const legacyMedian = median(legacyWarm);
    const candidateMedian = median(candidateWarm);
    const delta =
      legacyMedian === undefined || candidateMedian === undefined
        ? undefined
        : candidateMedian - legacyMedian;
    // Pairs are matched by repetition (both arms ran adjacently).
    const pairs = [];
    for (const legacy of warm.filter((sample) => sample.mode === 'legacy-scan')) {
      const candidate = warm.find(
        (sample) => sample.mode === CANDIDATE && sample.repetition === legacy.repetition,
      );
      if (candidate !== undefined) {
        pairs.push({ legacy: legacy.requestToPresentMs, candidate: candidate.requestToPresentMs });
      }
    }
    const intervalOf = (values) =>
      values.length < 2
        ? undefined
        : bcaInterval({ values, resamples: BOOTSTRAP_REPS, seed: BOOTSTRAP_SEED });
    const speedInterval = intervalOf(pairs.map((pair) => Math.log(pair.legacy / pair.candidate)));
    const differenceInterval = intervalOf(pairs.map((pair) => pair.candidate - pair.legacy));
    // Plan §9 cap: the paired median difference exceeds max(5%, 20 ms) AND its
    // paired interval excludes zero. Without an interval only the median part applies.
    const pairedDelta = differenceInterval === undefined ? delta : differenceInterval.estimate;
    const flag =
      pairedDelta === undefined || legacyMedian === undefined
        ? undefined
        : pairedDelta > Math.max(0.05 * legacyMedian, 20) &&
          (differenceInterval === undefined || differenceInterval.interval[0] > 0);
    const coldFor = (mode) =>
      median(
        cold.filter((sample) => sample.mode === mode).map((sample) => sample.requestToPresentMs),
      );
    return {
      caseId: caseInfo.id,
      designation: caseInfo.designation,
      legacyMedianMs: legacyMedian,
      legacyMadMs: mad(legacyWarm),
      candidateMedianMs: candidateMedian,
      candidateMadMs: mad(candidateWarm),
      deltaMs: delta,
      regressionFlag: flag,
      coldMedianLegacyMs: coldFor('legacy-scan'),
      coldMedianCandidateMs: coldFor(CANDIDATE),
      warmRepsPerMode: legacyWarm.length,
      pairs: pairs.length,
      speedup:
        speedInterval === undefined
          ? undefined
          : {
              estimate: Math.exp(speedInterval.estimate),
              low: Math.exp(speedInterval.interval[0]),
              high: Math.exp(speedInterval.interval[1]),
              degenerate: speedInterval.degenerate,
            },
      differenceInterval:
        differenceInterval === undefined
          ? undefined
          : {
              estimate: differenceInterval.estimate,
              low: differenceInterval.interval[0],
              high: differenceInterval.interval[1],
              degenerate: differenceInterval.degenerate,
            },
    };
  });

const summaryLines = [];
summaryLines.push(`# Stage A browser evidence — ${runDate} @ ${shortCommit}`);
summaryLines.push('');
summaryLines.push(
  `Paired legacy-scan${BASELINE_MIRROR_OFF ? ' (conjugate mirroring off)' : ''} vs ${CANDIDATE} classifier evidence from the production bundle ` +
    '(`vite build` + `vite preview`), driven through the real application UI by ' +
    '`tools/benchmark/run-stage-a.mjs`. Medians below are **warm** samples ' +
    `(${reps - 1} pairs per case; cold rep 0 is stored raw in raw-observations.json and excluded). ` +
    'Wall metric: stable-frame `requestToPresentMs` (plan §8).',
);
summaryLines.push('');
const formatRatio = (value) => `${value.toFixed(2)}×`;
const formatInterval = (interval, format) =>
  interval === undefined
    ? '—'
    : `${format(interval.estimate)} [${format(interval.low)}, ${format(interval.high)}]` +
      (interval.degenerate ? ' (degenerate)' : '');
for (const engineKey of Object.keys(samplesByEngine).sort()) {
  const engineSamples = samplesByEngine[engineKey];
  const facts = environment.browsers[engineKey];
  summaryLines.push(`**Label (${engineKey}):** ${facts.automation} — ${facts.label}.`);
  summaryLines.push('');
  summaryLines.push(`## Headline ${engineKey} (paired warm medians, ms)`);
  summaryLines.push('');
  summaryLines.push(
    `| Case | Designation | Pairs | legacy-scan median (MAD) | ${CANDIDATE} median (MAD) | Speed ratio legacy/candidate [95% BCa] | Δ candidate−legacy [95% BCa] | Regression flag |`,
  );
  summaryLines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const row of summarizeEngine(engineSamples)) {
    summaryLines.push(
      `| ${row.caseId} | ${row.designation} | ${row.pairs} | ${formatMs(row.legacyMedianMs)} (${formatMs(row.legacyMadMs)}) | ${formatMs(row.candidateMedianMs)} (${formatMs(row.candidateMadMs)}) | ${formatInterval(row.speedup, formatRatio)} | ${formatInterval(row.differenceInterval, formatMs)} | ${row.regressionFlag === undefined ? '—' : row.regressionFlag ? '**flagged**' : 'no'} |`,
    );
  }
  summaryLines.push('');
}
summaryLines.push(
  'Speed ratio: exp of the median paired log-ratio ln(legacy/candidate), >1 means the candidate is faster. ' +
    `Intervals: 95% BCa bootstrap over the warm pairs (${BOOTSTRAP_REPS} resamples, seed ${BOOTSTRAP_SEED}, ` +
    '`tools/benchmark/bca.ts`). Regression flag (plan §9): the paired median difference exceeds ' +
    'max(5% of the legacy median, 20 ms) and its BCa interval excludes zero.' +
    (RELEASE ? '' : ' At screening rep counts the intervals are directional.'),
);
summaryLines.push('');
summaryLines.push('## Semantic comparison (stable-frame RGBA hash)');
summaryLines.push('');
summaryLines.push(
  `Hash: ${semanticComparison.method.algorithm} over row-major RGBA bytes (documented byte order). ` +
    'This is a palette-inclusive proxy — the ring exposes no per-pixel period histogram. ' +
    'Mismatches are enumerated findings. ' +
    semanticComparison.method.expectation,
);
summaryLines.push('');
for (const engineKey of Object.keys(comparisonsByEngine).sort()) {
  const entries = comparisonsByEngine[engineKey];
  summaryLines.push(`### Engine ${engineKey}`);
  summaryLines.push('');
  summaryLines.push('| Case | matches | mismatches | mismatch repetitions |');
  summaryLines.push('| --- | --- | --- | --- |');
  for (const entry of entries) {
    summaryLines.push(
      `| ${entry.caseId} | ${entry.matches} | ${entry.mismatches} | ${entry.mismatchRepetitions.join(', ') || '—'} |`,
    );
  }
  const mismatchingCases = entries.filter((entry) => entry.mismatches > 0);
  summaryLines.push('');
  summaryLines.push(
    mismatchingCases.length === 0
      ? 'Every case × repetition hash matched between the two modes.'
      : `Mismatching cases: ${mismatchingCases.map((entry) => entry.caseId).join(', ')}. ` +
          (CANDIDATE === 'checkpoint'
            ? 'Each is an interior/boundary-heavy view — the expected signature of the checkpoint schedule proposing ' +
              'additional oracle-certified candidates (PR 4 evidence). '
            : 'The triggered scan is expected to match legacy exactly; each mismatch needs investigation. ') +
          'The hash inequality is enumerated as a finding per case and repetition above.',
  );
  summaryLines.push('');
}
summaryLines.push('## Scope and honesty notes');
summaryLines.push('');
for (const note of [
  'Cold/warm: repetition 0 is cold (fresh browser context per arm; the browser process is shared, so process-level code caches are not cold). Repetitions 1+ re-navigate one persistent page (warm).',
  'Cancellation interactions, cache/replay/recolor distributions, and catalog shard states are out of scope for this first pass.',
  'requestToPresentMs ends at the next presentation opportunity after image upload; it is not proof of physical paint (plan §8).',
  'Detected-period histograms are not exposed by the ring; the RGBA hash is a palette-inclusive proxy for semantic comparison.',
  RELEASE
    ? `${reps} repetitions per case (${reps - 1} warm pairs) in branded stable browsers, headed, on the declared target hardware: the plan §9 release protocol. Easy (screening) cases ran at the release count too. Contexts use deviceScaleFactor 1 so the raster is exactly the shipping 1024x640 raster; no p95 is quoted (fewer than 40 observations per case and arm).`
    : '9 paired repetitions = screening protocol (plan §9); release-gate cases need 21+ reps, BCa paired intervals, branded stable browsers, and declared target hardware.',
]) {
  summaryLines.push(`- ${note}`);
}
summaryLines.push('');
writeFileSync(path.join(outDir, 'summary.md'), `${summaryLines.join('\n')}\n`);

log('emitting manifest.sha256 (last, per the evidence contract)…');
const manifest = spawnSync('node', [path.join(repoRoot, 'tools/benchmark/manifest.mjs'), outDir], {
  cwd: repoRoot,
  stdio: 'inherit',
});
if (manifest.status !== 0) {
  process.exit(manifest.status ?? 1);
}
log(`evidence directory: ${path.relative(repoRoot, outDir)}`);

await closeBrowser();
await server.close();
process.exit(0);
