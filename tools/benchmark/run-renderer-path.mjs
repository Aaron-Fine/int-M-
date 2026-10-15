#!/usr/bin/env node
/**
 * Renderer-path paired evidence runner (performance plan §5/§9).
 *
 * Stage A-pattern paired measurement for the renderer-path efficiency bundle:
 * builds the production bundle once (`vite build`), serves it via
 * `vite preview` (never the dev server), drives the real application UI for
 * every selected corpus case with two or more alternating arms, and records
 * every sample raw into the dated evidence directory under
 * `runsByDetail[detail]`. Arms are either in-bundle query toggles
 * (`--arms label=param=value,...`) or whole-build comparisons
 * (`--dist label=distDir`, each served from its own preview server), so a
 * bundled change can be paired against its pre-change build with alternating
 * per-repetition order.
 *
 * Metrics per sample: stable-frame requestToPresentMs (wall), coarse
 * requestToPresentMs, per-band completion elapsed (bandsElapsedMs) with the
 * derived time-to-50%-rows, worker timing aggregates, and a SHA-256 of the
 * stable canvas RGBA (row-major, documented byte order) for the paired
 * semantic comparison. Labels are honest: automation-bundled headless
 * engines are directional evidence, not the release protocol of plan §9.
 *
 * `--release` runs branded stable browsers, headed (release-browser.mjs), with
 * at least 22 repetitions, and adds 95% BCa paired intervals on the
 * baseline/candidate ratio of the stable wall and of the stable-frame
 * classifier time (`classifyMs`) to summary.md. `--classifier-mode <mode>`
 * pins the classifier for every arm; `default` omits the parameter so the
 * production default kernel runs (the historical default is legacy-scan).
 *
 * Usage:
 *   node tools/benchmark/run-renderer-path.mjs --detail m1-center-out \
 *     --arms "centerOut=bandOrder=center-out,legacy=bandOrder=legacy" \
 *     [--cases mi-easy-default-full,mi-hard-rabbit-boundary] [--reps 9]
 *     [--dist "baseline=/tmp/baseline/dist,feature=dist"] [--engine chromium]
 *     [--out-dir <evidence/phase-2/<date>-<commit>>]
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { build, preview } from 'vite';
import { bcaInterval } from './bca.ts';
import {
  automationLabel,
  DIRECTIONAL_LABEL,
  launchEvidenceBrowser,
  readPowerMode,
  RELEASE_LABEL,
  sessionLocked,
} from './release-browser.mjs';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const BASE_PORT = 4181;
const SHIPPING_RASTER_ID = 'shipping-1024x640';
const TARGET_RASTER = { width: 1024, height: 640 };
const NAVIGATION_TIMEOUT_MS = 10 * 60_000;

const CDP_PORT = 9336;
const BOOTSTRAP_REPS = 10_000;
const BOOTSTRAP_SEED = 20_261_015;

const log = (message) => {
  process.stderr.write(`[renderer-path] ${message}\n`);
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
if (RELEASE && sessionLocked() === true) {
  process.stderr.write('the session is locked: a headed release run stalls; unlock it first\n');
  process.exit(2);
}
const classifierModeOption = readOption('--classifier-mode') ?? 'legacy-scan';
const classifierParam =
  classifierModeOption === 'default' ? '' : `&classifierMode=${classifierModeOption}`;
const detail = readOption('--detail');
if (detail === undefined) {
  process.stderr.write('--detail <name> is required (e.g. m1-center-out)\n');
  process.exit(2);
}
const armsOption = readOption('--arms') ?? 'default=';
const arms = armsOption.split(',').map((entry) => {
  const eq = entry.indexOf('=');
  const label = eq === -1 ? entry : entry.slice(0, eq);
  const param = eq === -1 ? '' : entry.slice(eq + 1);
  return { label, param };
});
const compareArms = arms.length >= 2;
const distOption = readOption('--dist') ?? 'feature=dist';
const dists = distOption.split(',').map((entry) => {
  const eq = entry.indexOf('=');
  const label = eq === -1 ? entry : entry.slice(0, eq);
  const dir = eq === -1 ? entry : entry.slice(eq + 1);
  return { label, dir: path.resolve(repoRoot, dir) };
});
for (const dist of dists) {
  if (!existsSync(path.join(dist.dir, 'index.html'))) {
    process.stderr.write(`--dist ${dist.label}: no dist at ${dist.dir}\n`);
    process.exit(2);
  }
}
if (!compareArms && dists.length < 2) {
  process.stderr.write(
    '--arms needs two label=param entries, or one arm with two --dist entries\n',
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
const formatMs = (value) =>
  value === undefined || value === null ? '—' : `${Number(value).toFixed(1)} ms`;

// ---------------------------------------------------------------------------
// In-page capture (same conventions as run-stage-a.mjs).
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

/**
 * Time to 50% of rows from per-band completion elapsed: bands are equal-row
 * static bands in row order, so the threshold is reached at the first band
 * whose cumulative row share is >= 0.5.
 */
const t50RowsMsOf = (stableFrame, height) => {
  const bands = stableFrame.bandsElapsedMs;
  if (!Array.isArray(bands) || bands.length === 0) return null;
  const bandRows = height / bands.length;
  let rows = 0;
  for (const value of bands) {
    rows += bandRows;
    if (rows >= height / 2) {
      return Number.isFinite(value) ? value : null;
    }
  }
  return null;
};

// ---------------------------------------------------------------------------
// Build once per dist, serve each dist on its own preview server.
// ---------------------------------------------------------------------------
const servers = [];
const baseUrls = {};
let nextPort = BASE_PORT;
for (const dist of dists) {
  let previewRoot = repoRoot;
  if (dist.dir === path.join(repoRoot, 'dist')) {
    log(`building production bundle (vite build) for ${dist.label}…`);
    const buildStarted = Date.now();
    await build({
      root: repoRoot,
      configFile: path.join(repoRoot, 'vite.config.ts'),
      logLevel: 'warn',
    });
    log(`build finished in ${Math.round((Date.now() - buildStarted) / 1000)}s`);
  } else {
    // A prebuilt dist from another worktree/checkout: serve it from that
    // checkout's own root. (vite preview resolves outDir inside its root, so
    // pointing one root at a foreign dist silently serves the wrong bundle.)
    previewRoot = path.dirname(dist.dir);
    log(`using prebuilt dist for ${dist.label}: ${dist.dir} (root ${previewRoot})`);
  }
  const server = await preview({
    root: previewRoot,
    configFile: path.join(previewRoot, 'vite.config.ts'),
    preview: { host: '127.0.0.1', port: nextPort, strictPort: true },
  });
  baseUrls[dist.label] = `http://127.0.0.1:${nextPort}`;
  nextPort += 1;
  servers.push(server);
  log(`vite preview serving ${dist.label} at ${baseUrls[dist.label]}`);
}

const {
  browser,
  close: closeBrowser,
  launchedBy,
} = await launchEvidenceBrowser({
  engine,
  release: RELEASE,
  executablePath: readOption('--executable'),
  cdpPort: CDP_PORT,
});
log(
  `${engine} ${browser.version()} launched (${RELEASE ? `branded, headed: ${launchedBy}` : 'headless, automation-bundled'})`,
);

const viewportSize = { width: 1600, height: 900 };
const newContext = () => browser.newContext({ viewport: viewportSize, deviceScaleFactor: 1 });

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

// Calibrate once against the first server so the raster is 1024x640.
{
  const context = await browser.newContext({
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.goto(`${baseUrls[dists[0].label]}/?perf=1`);
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
  viewportSize.width = size.width;
  viewportSize.height = size.height;
  if (
    Math.round(rect.width) !== TARGET_RASTER.width ||
    Math.round(rect.height) !== TARGET_RASTER.height
  ) {
    throw new Error(
      `viewport calibration failed: canvas stack is ${rect.width}x${rect.height}, ` +
        `need a ${TARGET_RASTER.width}x${TARGET_RASTER.height} raster`,
    );
  }
  log(`calibrated viewport ${viewportSize.width}x${viewportSize.height} → 1024x640 raster`);
}

let sampleSeq = 0;
const measureOnce = async (page, spec) => {
  await page.goto(spec.url, { timeout: NAVIGATION_TIMEOUT_MS });
  await waitForStableComputedTrace(page);
  const state = await page.evaluate(capturePageState);
  const { trace, stableFrame } = stableTraceOf(state.traces);
  if (trace.width !== TARGET_RASTER.width || trace.height !== TARGET_RASTER.height) {
    throw new Error(
      `${spec.caseId}: raster is ${trace.width}x${trace.height}, expected ` +
        `${TARGET_RASTER.width}x${TARGET_RASTER.height}`,
    );
  }
  const coarseFrame = trace.frames.find((frame) => frame.stage === 'coarse');
  sampleSeq += 1;
  return {
    seq: sampleSeq,
    engine,
    detail,
    dist: spec.dist,
    arm: spec.arm,
    caseId: spec.caseId,
    caseClass: spec.caseClass,
    profile: spec.profile,
    repetition: spec.repetition,
    armOrder: spec.armOrder,
    climate: spec.climate,
    requestToPresentMs: stableFrame.requestToPresentMs,
    coarseRequestToPresentMs: coarseFrame === undefined ? null : coarseFrame.requestToPresentMs,
    t50RowsMs: t50RowsMsOf(stableFrame, trace.height),
    bandsElapsedMs: stableFrame.bandsElapsedMs ?? null,
    colorizeMs: stableFrame.colorizeMs ?? null,
    classifyMs: stableFrame.classifyMs ?? null,
    mergeCpuMs: stableFrame.mergeCpuMs ?? null,
    yieldWaitMs: stableFrame.yieldWaitMs ?? null,
    yieldCount: stableFrame.yieldCount ?? null,
    workerCount: trace.workerCount,
    backend: trace.backend,
    semanticHash: state.semanticHash,
    traces: state.traces,
  };
};

log(
  `running ${selectedCases.length} cases × ${arms.length} arms × ${dists.length} dists × ${reps} paired repetitions…`,
);
const allSamples = [];
for (const caseInfo of selectedCases) {
  const profileId = caseInfo.profile.toLowerCase();
  const urlFor = (dist, armParam) =>
    `${baseUrls[dist]}/?perf=1${classifierParam}&view=${caseInfo.center.re},${caseInfo.center.im},${caseInfo.spanY}&quality=${profileId}${armParam === '' ? '' : `&${armParam}`}`;
  for (let repetition = 0; repetition < reps; repetition += 1) {
    const order = repetition % 2 === 0 ? [...arms] : [...arms].reverse();
    const cold = repetition === 0;
    let warmContext;
    let warmPage;
    if (!cold) {
      warmContext = await newContext();
      warmPage = await warmContext.newPage();
    }
    try {
      for (const arm of order) {
        for (const dist of dists) {
          const contextHandle = cold ? await newContext() : warmContext;
          const page = cold ? await contextHandle.newPage() : warmPage;
          try {
            const sample = await measureOnce(page, {
              url: urlFor(dist.label, arm.param),
              dist: dist.label,
              arm: arm.label,
              caseId: caseInfo.id,
              caseClass: caseInfo.class,
              profile: caseInfo.profile,
              repetition,
              armOrder: order.map((entry) => entry.label).join('|'),
              climate: cold ? 'cold' : 'warm',
            });
            allSamples.push(sample);
            log(
              `${caseInfo.id} rep ${repetition} ${dist.label}/${arm.label} (${sample.climate}): ` +
                `${sample.requestToPresentMs.toFixed(0)} ms`,
            );
          } finally {
            if (cold) await contextHandle.close();
          }
        }
      }
    } finally {
      if (warmContext !== undefined) await warmContext.close();
    }
  }
}
log(`collected ${allSamples.length} samples`);

const userAgent = await (async () => {
  const context = await newContext();
  const page = await context.newPage();
  const value = await page.evaluate(() => globalThis.navigator.userAgent);
  await context.close();
  return value;
})();

// ---------------------------------------------------------------------------
// Evidence packaging: merge into the shared evidence directory. The manifest
// is NOT emitted here — it is emitted last by the bundle closeout (M4).
// ---------------------------------------------------------------------------
spawnSync(
  'node',
  [
    path.join(repoRoot, 'tools/benchmark/capture-environment.mjs'),
    '--out',
    path.join(outDir, 'environment.json'),
    '--note',
    `Renderer-path paired run (${detail}, ${engine}); production bundle via vite build + vite preview.`,
  ],
  { cwd: repoRoot, stdio: 'inherit' },
);

const environmentPath = path.join(outDir, 'environment.json');
const environment = JSON.parse(readFileSync(environmentPath, 'utf8'));
environment.browsers = {
  ...(environment.browsers ?? {}),
  [engine]: {
    build: browser.version(),
    engine: userAgent,
    headed: RELEASE,
    powerMode: RELEASE ? readPowerMode() : null,
    devicePixelRatio: 1,
    viewport: viewportSize,
    automation: automationLabel({ engine, release: RELEASE, launchedBy }),
    label: RELEASE ? RELEASE_LABEL : DIRECTIONAL_LABEL,
    workerCount: [...new Set(allSamples.map((sample) => sample.workerCount))].sort((a, b) => a - b),
    backend: 'cpu',
    samples: allSamples.length,
  },
};
environment.render = {
  workerCount: allSamples[0]?.workerCount ?? null,
  backend: 'cpu',
};
environment.protocol = {
  ...(environment.protocol ?? {}),
  buildMode: 'vite build (production bundle) served by vite preview; dev server never used',
  repetitions: reps,
  pairing: 'per repetition all arms run adjacently; arm order alternates per repetition',
  coldWarm:
    'repetition 0 is cold (fresh browser context per arm); repetitions 1+ re-navigate one persistent page (warm)',
  outOfScope:
    'cancellation interactions and cache/replay/recolor distributions are out of scope for renderer-path paired runs',
  raster: SHIPPING_RASTER_ID,
  classifierMode:
    classifierModeOption === 'default'
      ? 'production default for every arm (no classifierMode parameter): arms isolate the toggled detail, not classifier-mode variance'
      : `fixed to ${classifierModeOption} for every arm: arms isolate the toggled detail, not classifier-mode variance`,
  pairedIntervals: `95% BCa bootstrap on warm pairs, ${BOOTSTRAP_REPS} resamples, seed ${BOOTSTRAP_SEED} (tools/benchmark/bca.ts): median log-ratio ln(baseline/candidate) for stable wall and classifyMs`,
  wallMetric:
    'requestToPresentMs of the computed stable frame (plan §8); t50RowsMs derived from bandsElapsedMs (band-completion observability)',
  hashByteOrder:
    'SHA-256 over row-major RGBA bytes from getImageData(0, 0, width, height) of canvas.explorer__canvas',
  engineLabels: RELEASE
    ? 'branded stable browsers, headed with DevTools closed, on the declared target hardware (the machine running this harness)'
    : 'chromium/firefox here are Playwright automation builds; branded stable browsers on declared target hardware remain the release protocol',
};
environment.notes.push(
  `Renderer-path detail '${detail}' run (${engine}): arms ${arms.map((arm) => arm.label).join(', ')}; dists ${dists.map((dist) => dist.label).join(', ')}.`,
);
writeFileSync(environmentPath, `${JSON.stringify(environment, null, 2)}\n`);

const rawPath = path.join(outDir, 'raw-observations.json');
const existingRaw = existsSync(rawPath) ? JSON.parse(readFileSync(rawPath, 'utf8')) : undefined;
const runsByDetail = {
  ...(existingRaw?.runsByDetail ?? {}),
};
const keyOf = (sample) => `${sample.engine}|${sample.dist}|${sample.arm}`;
const samplesByKey = {};
for (const sample of allSamples) {
  const key = keyOf(sample);
  (samplesByKey[key] ??= []).push(sample);
}
runsByDetail[detail] = {
  schemaVersion: 1,
  arms: arms.map((arm) => arm.label),
  armParams: Object.fromEntries(arms.map((arm) => [arm.label, arm.param])),
  dists: dists.map((dist) => dist.label),
  repetitions: reps,
  samplesByKey,
};
const rawObservations = {
  schemaVersion: 1,
  description:
    'Every renderer-path paired sample, raw and timestamp-free. Aggregates in summary.md are derived views only.',
  corpus: {
    file: 'tools/benchmark/corpus.v1.json',
    schemaVersion: corpus.schemaVersion,
    sha256: corpusSha256,
  },
  raster: shippingRaster,
  runsByDetail,
};
writeFileSync(rawPath, `${JSON.stringify(rawObservations, null, 2)}\n`);

// Paired semantic comparison per case × repetition. Arm-compare runs pair
// arms within a dist (identical semantics expected); build-compare runs pair
// dists within an arm — the bundled build must be hash-identical to the
// baseline build (packed layout decodes to the same RGBA bytes).
const comparisons = [];
for (const caseInfo of selectedCases) {
  for (let repetition = 0; repetition < reps; repetition += 1) {
    if (compareArms) {
      for (const dist of dists) {
        const perArm = arms.map((arm) => {
          const sample = allSamples.find(
            (candidate) =>
              candidate.caseId === caseInfo.id &&
              candidate.repetition === repetition &&
              candidate.dist === dist.label &&
              candidate.arm === arm.label,
          );
          return { variant: arm.label, hash: sample?.semanticHash.hash ?? null };
        });
        const equal =
          perArm.length >= 2 &&
          perArm.every((entry) => entry.hash !== null && entry.hash === perArm[0].hash);
        comparisons.push({
          detail,
          caseId: caseInfo.id,
          dist: dist.label,
          repetition,
          climate: allSamples.find(
            (candidate) =>
              candidate.caseId === caseInfo.id &&
              candidate.repetition === repetition &&
              candidate.dist === dist.label,
          )?.climate,
          arms: perArm,
          equal,
        });
      }
    } else {
      for (const arm of arms) {
        const perDist = dists.map((dist) => {
          const sample = allSamples.find(
            (candidate) =>
              candidate.caseId === caseInfo.id &&
              candidate.repetition === repetition &&
              candidate.dist === dist.label &&
              candidate.arm === arm.label,
          );
          return { variant: dist.label, hash: sample?.semanticHash.hash ?? null };
        });
        const equal =
          perDist.length >= 2 &&
          perDist.every((entry) => entry.hash !== null && entry.hash === perDist[0].hash);
        comparisons.push({
          detail,
          caseId: caseInfo.id,
          arm: arm.label,
          repetition,
          climate: allSamples.find(
            (candidate) =>
              candidate.caseId === caseInfo.id &&
              candidate.repetition === repetition &&
              candidate.arm === arm.label,
          )?.climate,
          dists: perDist,
          equal,
        });
      }
    }
  }
}
const comparisonPath = path.join(outDir, 'semantic-comparison.json');
const existingComparison = existsSync(comparisonPath)
  ? JSON.parse(readFileSync(comparisonPath, 'utf8'))
  : undefined;
const mergedComparisons = [
  ...(existingComparison?.comparisons ?? []).filter((entry) => entry.detail !== detail),
  ...comparisons,
];
const semanticComparison = {
  schemaVersion: 1,
  method: {
    algorithm: 'sha-256',
    byteOrder:
      'row-major RGBA, 4 bytes per pixel, read via getImageData(0, 0, width, height) from canvas.explorer__canvas after the computed stable frame is presented',
    scope:
      'palette-inclusive proxy over the final RGBA raster; renderer-path arms must be hash-identical (semantic results are unchanged by scheduling, yield, transfer, and packed-layout changes)',
  },
  comparisons: mergedComparisons,
};
writeFileSync(comparisonPath, `${JSON.stringify(semanticComparison, null, 2)}\n`);

// Quick console summary: warm medians per case. The candidate is the first
// arm (or the first dist for whole-build comparisons); the baseline is the
// second. Δ = candidate − baseline on stable requestToPresentMs; the plan §9
// cap max(5%, 20 ms) is applied to that delta.
const candidateLabel = compareArms ? arms[0].label : dists[0].label;
const baselineLabel = compareArms ? arms[1].label : dists[1].label;
const summaryRows = [];
for (const caseInfo of selectedCases) {
  const warm = allSamples.filter(
    (sample) => sample.caseId === caseInfo.id && sample.climate === 'warm',
  );
  const candidateSamples = warm.filter((sample) =>
    compareArms
      ? sample.arm === arms[0].label && sample.dist === dists[0].label
      : sample.dist === dists[0].label,
  );
  const baselineSamples = warm.filter((sample) =>
    compareArms
      ? sample.arm === arms[1].label && sample.dist === dists[0].label
      : sample.dist === dists[1].label,
  );
  const firstMedian = median(candidateSamples.map((sample) => sample.requestToPresentMs));
  const secondMedian = median(baselineSamples.map((sample) => sample.requestToPresentMs));
  const delta =
    firstMedian === undefined || secondMedian === undefined
      ? undefined
      : firstMedian - secondMedian;
  const flag =
    delta === undefined || secondMedian === undefined
      ? undefined
      : delta > Math.max(0.05 * secondMedian, 20);
  const pairedRatio = (metric) => {
    const values = [];
    for (const candidate of candidateSamples) {
      const baseline = baselineSamples.find((sample) => sample.repetition === candidate.repetition);
      const a = baseline?.[metric];
      const b = candidate[metric];
      if (typeof a === 'number' && typeof b === 'number' && a > 0 && b > 0) {
        values.push(Math.log(a / b));
      }
    }
    if (values.length < 2) return undefined;
    const interval = bcaInterval({ values, resamples: BOOTSTRAP_REPS, seed: BOOTSTRAP_SEED });
    return {
      pairs: values.length,
      ratio: Math.exp(interval.estimate),
      interval: [Math.exp(interval.interval[0]), Math.exp(interval.interval[1])],
    };
  };
  const pairedDifference = () => {
    const values = [];
    for (const candidate of candidateSamples) {
      const baseline = baselineSamples.find((sample) => sample.repetition === candidate.repetition);
      if (baseline !== undefined) {
        values.push(candidate.requestToPresentMs - baseline.requestToPresentMs);
      }
    }
    return values.length < 2
      ? undefined
      : bcaInterval({ values, resamples: BOOTSTRAP_REPS, seed: BOOTSTRAP_SEED });
  };
  const t50Median = (samples) =>
    median(samples.map((sample) => sample.t50RowsMs).filter((value) => value !== null));
  const yieldMedian = (samples) =>
    median(samples.map((sample) => sample.yieldWaitMs).filter((value) => value !== null));
  const difference = pairedDifference();
  summaryRows.push({
    caseId: caseInfo.id,
    wallRatioBca: pairedRatio('requestToPresentMs'),
    classifyRatioBca: pairedRatio('classifyMs'),
    firstClassifyMs: median(
      candidateSamples.map((sample) => sample.classifyMs).filter((value) => value !== null),
    ),
    secondClassifyMs: median(
      baselineSamples.map((sample) => sample.classifyMs).filter((value) => value !== null),
    ),
    pairedRegressionFlag:
      difference === undefined || secondMedian === undefined
        ? undefined
        : difference.estimate > Math.max(0.05 * secondMedian, 20) && difference.interval[0] > 0,
    candidateLabel,
    baselineLabel,
    firstMedianMs: firstMedian,
    firstMadMs: mad(candidateSamples.map((sample) => sample.requestToPresentMs)),
    secondMedianMs: secondMedian,
    secondMadMs: mad(baselineSamples.map((sample) => sample.requestToPresentMs)),
    deltaMs: delta,
    regressionFlag: flag,
    firstT50Ms: t50Median(candidateSamples),
    secondT50Ms: t50Median(baselineSamples),
    firstYieldWaitMs: yieldMedian(candidateSamples),
    secondYieldWaitMs: yieldMedian(baselineSamples),
  });
}
process.stderr.write(
  `[renderer-path] paired warm medians (${engine}; Δ = ${candidateLabel} − ${baselineLabel}):\n`,
);
for (const row of summaryRows) {
  process.stderr.write(
    `  ${row.caseId}: ${row.candidateLabel} ${formatMs(row.firstMedianMs)} (t50 ${formatMs(row.firstT50Ms)}, yieldWait ${formatMs(row.firstYieldWaitMs)}) vs ` +
      `${row.baselineLabel} ${formatMs(row.secondMedianMs)} (t50 ${formatMs(row.secondT50Ms)}, yieldWait ${formatMs(row.secondYieldWaitMs)}) Δ ${row.deltaMs === undefined ? '—' : row.deltaMs.toFixed(1)} ms ` +
      `cap ${row.regressionFlag === undefined ? '—' : row.regressionFlag ? 'FLAGGED' : 'ok'}\n`,
  );
}
const mismatches = comparisons.filter((entry) => entry.equal === false);
process.stderr.write(
  `[renderer-path] semantic hash mismatches: ${mismatches.length}` +
    (mismatches.length > 0
      ? ` — ${mismatches.map((entry) => `${entry.caseId}/${entry.dist}/rep${entry.repetition}`).join(', ')}`
      : '') +
    '\n',
);

// summary.md section for this detail × engine (release runs carry BCa).
const formatRatio = (bca) =>
  bca === undefined
    ? '—'
    : `${bca.ratio.toFixed(2)}× [${bca.interval[0].toFixed(2)}×, ${bca.interval[1].toFixed(2)}×]`;
const sectionLines = [
  `## ${detail} — ${engine}`,
  '',
  `Label: ${RELEASE ? RELEASE_LABEL : DIRECTIONAL_LABEL}. Browser: ${automationLabel({ engine, release: RELEASE, launchedBy })} ${browser.version()}. Classifier: ${classifierModeOption}. ${reps} repetitions (rep 0 cold, excluded).`,
  '',
  `Ratios are ${baselineLabel}/${candidateLabel} (>1 means ${candidateLabel} is faster): exp of the median paired log-ratio with a 95% BCa interval (${BOOTSTRAP_REPS} resamples, seed ${BOOTSTRAP_SEED}). Regression flag: plan §9 paired median difference > max(5%, 20 ms) with its interval excluding zero.`,
  '',
  `| Case | ${candidateLabel} wall | ${baselineLabel} wall | wall ratio [95% BCa] | ${candidateLabel} classifyMs | ${baselineLabel} classifyMs | classifier ratio [95% BCa] | regression flag |`,
  '| --- | --- | --- | --- | --- | --- | --- | --- |',
  ...summaryRows.map(
    (row) =>
      `| ${row.caseId} | ${formatMs(row.firstMedianMs)} | ${formatMs(row.secondMedianMs)} | ${formatRatio(row.wallRatioBca)} | ${formatMs(row.firstClassifyMs)} | ${formatMs(row.secondClassifyMs)} | ${formatRatio(row.classifyRatioBca)} | ${row.pairedRegressionFlag === undefined ? '—' : row.pairedRegressionFlag ? '**flagged**' : 'no'} |`,
  ),
  '',
  `Semantic hash mismatches: ${mismatches.length}.`,
  '',
];
const summaryPath = path.join(outDir, 'summary.md');
const sectionKey = `## ${detail} — ${engine}`;
const previousSections = existsSync(summaryPath)
  ? readFileSync(summaryPath, 'utf8')
      .split(/(?=^## )/m)
      .filter((section) => !section.startsWith(sectionKey))
  : ['# Renderer-path paired evidence\n\n'];
writeFileSync(summaryPath, `${[...previousSections, sectionLines.join('\n')].join('')}\n`);

log(`evidence directory: ${path.relative(repoRoot, outDir)} (manifest emitted at closeout)`);
await closeBrowser();
for (const server of servers) await server.close();
process.exit(0);
