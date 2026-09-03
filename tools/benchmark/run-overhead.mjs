#!/usr/bin/env node
/**
 * MI-PERF-007 overhead benchmark (performance plan §8/§9).
 *
 * Paired end-to-end overhead evidence for the always-on render-trace ring and
 * the opt-in `?perf=1` diagnostics, in the declared Firefox target
 * environment, on the production bundle (`vite build` + `vite preview`):
 *
 * - 4 corpus cases (2 easy + 2 hard) × {`?perf=1` present vs absent} × 11
 *   paired repetitions with alternating arm order; rep 0 cold (fresh browser
 *   context per arm), reps 1+ warm (persistent page re-navigated);
 * - wall metric available in BOTH arms without the hook: in-page User Timing
 *   marks `mi:app-mount` → last `mi:stable-presented` (both marks are
 *   emitted unconditionally by the application);
 * - (a) always-on non-inferiority: paired median % difference within 2% with
 *   a paired bootstrap percentile interval (log-ratio space, recorded seed,
 *   no new deps) excluding worse-than-2%;
 * - (b) opt-in diagnostics ≤5%: the same paired samples, 5% threshold;
 * - (c) measured retention: filled-ring snapshot JSON size ≤64 KiB on the
 *   biggest case, plus the worst-single-trace × capacity extrapolation;
 * - recorder per-frame cost from tools/benchmark/recorder-cost.ts
 *   (`npm run bench:recorder`, stored as recorder-cost-node.json);
 * - every sample is stored raw; aggregates are derived views.
 *
 * Firefox runs headed under `xvfb-run -a` when available (self-wrapping);
 * otherwise the run falls back headless and the fallback is recorded in the
 * environment and summary. Automation-bundled engines are directional
 * evidence, not the release protocol of plan §9.
 *
 * Usage:
 *   node tools/benchmark/run-overhead.mjs [--engine firefox|chromium]
 *       [--reps 11] [--cases <id,id>] [--out-dir <evidence/phase-2/<date>-<commit>>]
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { build, preview } from 'vite';

const require = createRequire(import.meta.url);
const { chromium, firefox } = require('@playwright/test');

const repoRoot = path.resolve(import.meta.dirname, '../..');
const PREVIEW_PORT = 4181;
const SHIPPING_RASTER = { width: 1024, height: 640 };
const NAVIGATION_TIMEOUT_MS = 10 * 60_000;
const OVERHEAD_CASE_IDS = [
  'mi-easy-default-full',
  'mi-easy-exterior-heavy',
  'mi-hard-rabbit-boundary',
  'mi-hard-supplied-126x',
];
const RETENTION_CASE_ID = 'mi-hard-supplied-126x';
const RETENTION_EASY_CASE_ID = 'mi-easy-exterior-heavy';
const RETENTION_BUDGET_BYTES = 64 * 1024;
const BOOTSTRAP_REPS = 10_000;
const BOOTSTRAP_SEED = 20_260_902;
const ALWAYS_ON_BUDGET = 0.02;
const OPT_IN_BUDGET = 0.05;

const log = (message) => {
  process.stderr.write(`[overhead] ${message}\n`);
};

// ---------------------------------------------------------------------------
// Arguments.
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const readOption = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};
const engine = readOption('--engine') ?? 'firefox';
if (engine !== 'chromium' && engine !== 'firefox') {
  process.stderr.write(`unknown engine: ${engine} (use chromium or firefox)\n`);
  process.exit(2);
}
const reps = Number(readOption('--reps') ?? 11);
if (!Number.isInteger(reps) || reps < 2) {
  process.stderr.write('--reps must be an integer >= 2\n');
  process.exit(2);
}

// Self-wrap under xvfb-run so the harness is one reproducible command.
if (
  engine === 'firefox' &&
  process.env['MI_XVFB_WRAPPED'] !== '1' &&
  !process.env['DISPLAY'] &&
  spawnSync('which', ['xvfb-run'], { encoding: 'utf8' }).status === 0
) {
  process.stderr.write('[overhead] no DISPLAY; re-executing under xvfb-run -a\n');
  const wrapped = spawnSync('xvfb-run', ['-a', process.execPath, ...process.argv.slice(1)], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: { ...process.env, MI_XVFB_WRAPPED: '1' },
  });
  process.exit(wrapped.status ?? 1);
}
const xvfbWrapped = process.env['MI_XVFB_WRAPPED'] === '1';
const displayAvailable = Boolean(process.env['DISPLAY']);
const headed = displayAvailable;
const executionMode = headed
  ? xvfbWrapped
    ? 'headed under Xvfb (xvfb-run -a)'
    : 'headed under an existing display server'
  : 'headless (no xvfb-run/display — fallback recorded honestly)';

const corpusPath = path.join(repoRoot, 'tools/benchmark/corpus.v1.json');
const corpusRaw = readFileSync(corpusPath, 'utf8');
const corpus = JSON.parse(corpusRaw);
const corpusSha256 = createHash('sha256').update(corpusRaw).digest('hex');
const selectedCases = OVERHEAD_CASE_IDS.map((id) => {
  const caseInfo = corpus.cases.find((candidate) => candidate.id === id);
  if (caseInfo === undefined) {
    process.stderr.write(`corpus is missing case ${id}\n`);
    process.exit(2);
  }
  return caseInfo;
});
const retentionCase = corpus.cases.find((candidate) => candidate.id === RETENTION_CASE_ID);
const retentionEasyCase = corpus.cases.find((candidate) => candidate.id === RETENTION_EASY_CASE_ID);
if (retentionCase === undefined || retentionEasyCase === undefined) {
  process.stderr.write('corpus is missing a retention case\n');
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
// Stats helpers (aggregates are derived views; every sample is stored).
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

/** Deterministic mulberry32 PRNG so the bootstrap is reproducible. */
const mulberry32 = (seed) => {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/**
 * Paired bootstrap percentile interval in log-ratio space (plan §9: log-ratios
 * for speed ratios). Returns bounds as ratios; callers express them as %.
 */
const bootstrapLogRatioInterval = (logRatios, bootstrapReps = BOOTSTRAP_REPS) => {
  const rng = mulberry32(BOOTSTRAP_SEED);
  const n = logRatios.length;
  if (n === 0) return undefined;
  const means = new Array(bootstrapReps);
  for (let sample = 0; sample < bootstrapReps; sample += 1) {
    let sum = 0;
    for (let index = 0; index < n; index += 1) {
      sum += logRatios[Math.floor(rng() * n)];
    }
    means[sample] = sum / n;
  }
  means.sort((a, b) => a - b);
  const lo = means[Math.floor(0.025 * bootstrapReps)];
  const hi = means[Math.min(bootstrapReps - 1, Math.ceil(0.975 * bootstrapReps) - 1)];
  return { lo, hi, point: median(means) };
};

const formatPct = (ratio) => (ratio === undefined ? '—' : `${(ratio * 100).toFixed(2)}%`);

// ---------------------------------------------------------------------------
// In-page capture. Browser globals are reached through globalThis because this
// module also runs in Node; Playwright serializes the functions into the page.
// Hash byte order (documented): row-major RGBA from getImageData — bytes walk
// rows from the top-left pixel, four bytes (R, G, B, A) per pixel.
// ---------------------------------------------------------------------------
const marksWallMetric = () => {
  const marks = performance.getEntriesByType('mark');
  const mount = marks.find((mark) => mark.name === 'mi:app-mount');
  const presented = marks.filter((mark) => mark.name === 'mi:stable-presented');
  const last = presented[presented.length - 1];
  return {
    appMountMarkMs: mount === undefined ? null : mount.startTime,
    stablePresentedMarkMs: last === undefined ? null : last.startTime,
    stablePresentedCount: presented.length,
    wallMs: mount === undefined || last === undefined ? null : last.startTime - mount.startTime,
    renderRequestCount: marks.filter((mark) => mark.name === 'mi:render-request').length,
    longTaskMarkCount: marks.filter((mark) => mark.name === 'mi:long-task').length,
  };
};

const waitForStablePresented = (page) =>
  page.waitForFunction(
    () => performance.getEntriesByType('mark').some((mark) => mark.name === 'mi:stable-presented'),
    undefined,
    { timeout: NAVIGATION_TIMEOUT_MS, polling: 100 },
  );

const capturePageState = async (page, perf) => {
  const metric = await page.evaluate(marksWallMetric);
  if (metric.wallMs === null) throw new Error('stable-presented mark missing');
  const canvas = await page.evaluate(() => {
    const element = globalThis.document.querySelector('canvas.explorer__canvas');
    if (!(element instanceof globalThis.HTMLCanvasElement)) return null;
    return {
      width: element.width,
      height: element.height,
      data: Array.from(
        element.getContext('2d', { alpha: false }).getImageData(0, 0, element.width, element.height)
          .data,
      ),
    };
  });
  if (canvas === null) throw new Error('render canvas not found');
  // Hash in Node (byte order documented above); Uint8ClampedArray is 0-255
  // clamped, so the plain Array round-trip is byte-exact.
  const hash = createHash('sha256').update(new Uint8Array(canvas.data)).digest('hex');
  const base = {
    wallMetric: metric,
    raster: { width: canvas.width, height: canvas.height },
    semanticHash: { algorithm: 'sha-256', hash, width: canvas.width, height: canvas.height },
    devicePixelRatio: await page.evaluate(() => globalThis.devicePixelRatio),
  };
  if (!perf) return base;
  const perfState = await page.evaluate(() => {
    const hook = globalThis.__miRenderTrace;
    if (!hook) throw new Error('window.__miRenderTrace missing — did ?perf=1 apply?');
    const snapshot = hook.snapshot();
    const encoder = new TextEncoder();
    const tracesJson = snapshot.map((trace) => JSON.stringify(trace));
    return {
      traces: snapshot,
      view: hook.viewport(),
      snapshotJsonBytes: encoder.encode(JSON.stringify(snapshot)).length,
      traceJsonBytes: tracesJson.map((json) => encoder.encode(json).length),
    };
  });
  return { ...base, ...perfState };
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

// ---------------------------------------------------------------------------
// Build once, serve, calibrate the viewport to the shipping raster.
// ---------------------------------------------------------------------------
log(`engine=${engine} reps=${reps} execution=${executionMode}`);
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
const browser = await launcher.launch({ headless: !headed });
log(
  `${engine} ${browser.version()} launched (${headed ? 'headed' : 'headless'}, ` +
    `automation-bundled)`,
);

const viewportSize = { width: 1280, height: 905 };
const newContext = () => browser.newContext({ viewport: viewportSize, deviceScaleFactor: 1 });

const calibrateViewport = async () => {
  const context = await newContext();
  const page = await context.newPage();
  await page.goto(`${baseUrl}/?perf=1`);
  await waitForStablePresented(page);
  const measureStackRect = () =>
    page.evaluate(() => {
      const stack = globalThis.document.querySelector('.explorer__stack');
      if (!stack) throw new Error('.explorer__stack not found');
      return stack.getBoundingClientRect();
    });
  let size = { ...viewportSize };
  let rect = await measureStackRect();
  for (
    let attempt = 0;
    attempt < 6 &&
    !(
      Math.round(rect.width) === SHIPPING_RASTER.width &&
      Math.round(rect.height) === SHIPPING_RASTER.height
    );
    attempt += 1
  ) {
    size = {
      width: Math.max(320, Math.round(size.width + SHIPPING_RASTER.width - rect.width)),
      height: Math.max(320, Math.round(size.height + SHIPPING_RASTER.height - rect.height)),
    };
    await page.setViewportSize(size);
    await page.waitForTimeout(250);
    rect = await measureStackRect();
  }
  await context.close();
  viewportSize.width = size.width;
  viewportSize.height = size.height;
  if (
    Math.round(rect.width) !== SHIPPING_RASTER.width ||
    Math.round(rect.height) !== SHIPPING_RASTER.height
  ) {
    throw new Error(
      `viewport calibration failed: canvas stack is ${rect.width}x${rect.height}, ` +
        `need a ${SHIPPING_RASTER.width}x${SHIPPING_RASTER.height} raster`,
    );
  }
  return size;
};

const calibrated = await calibrateViewport();
viewportSize.width = calibrated.width;
viewportSize.height = calibrated.height;
log(
  `calibrated viewport ${viewportSize.width}x${viewportSize.height} → ` +
    `${SHIPPING_RASTER.width}x${SHIPPING_RASTER.height} raster`,
);

// ---------------------------------------------------------------------------
// Paired measurement.
// ---------------------------------------------------------------------------
const urlFor = (caseInfo, perf) =>
  `${baseUrl}/${perf ? '?perf=1&' : '?'}view=${caseInfo.center.re},${caseInfo.center.im},${caseInfo.spanY}` +
  `&quality=${caseInfo.profile.toLowerCase()}`;

const measureOnce = async (page, spec) => {
  await page.goto(spec.url, { timeout: NAVIGATION_TIMEOUT_MS });
  await waitForStablePresented(page);
  const state = await capturePageState(page, spec.perf);
  const sample = {
    engine,
    caseId: spec.caseInfo.id,
    caseClass: spec.caseInfo.class,
    designation: spec.caseInfo.designation,
    profile: spec.caseInfo.profile,
    arm: spec.perf ? 'perf1' : 'perf0',
    repetition: spec.repetition,
    armOrder: spec.armOrder.join('|'),
    climate: spec.climate,
    view: { center: spec.caseInfo.center, spanY: spec.caseInfo.spanY },
    raster: state.raster,
    devicePixelRatio: state.devicePixelRatio,
    wallMetric: state.wallMetric,
    semanticHash: state.semanticHash,
  };
  if (spec.perf) {
    const { trace, stableFrame } = stableTraceOf(state.traces);
    if (trace.width !== SHIPPING_RASTER.width || trace.height !== SHIPPING_RASTER.height) {
      throw new Error(
        `${spec.caseInfo.id}: perf-arm raster is ${trace.width}x${trace.height}, expected ` +
          `${SHIPPING_RASTER.width}x${SHIPPING_RASTER.height}`,
      );
    }
    const expectedView = {
      center: { re: Number(spec.caseInfo.center.re), im: Number(spec.caseInfo.center.im) },
      spanY: Number(spec.caseInfo.spanY),
    };
    if (
      state.view.center.re !== expectedView.center.re ||
      state.view.center.im !== expectedView.center.im ||
      state.view.spanY !== expectedView.spanY
    ) {
      throw new Error(
        `${spec.caseInfo.id}: application viewport ${JSON.stringify(state.view)} does not match ` +
          `the corpus view — ?view= was not applied`,
      );
    }
    sample.raster = { width: trace.width, height: trace.height };
    sample.viewKeyHash = trace.viewKeyHash;
    sample.workerCount = trace.workerCount;
    sample.backend = trace.backend;
    sample.requestToPresentMs = stableFrame.requestToPresentMs;
    sample.traces = state.traces;
  }
  return sample;
};

const ARMS = [
  { id: 'perf1', perf: true },
  { id: 'perf0', perf: false },
];

const runCase = async (caseInfo) => {
  const samples = [];
  for (let repetition = 0; repetition < reps; repetition += 1) {
    const armOrder = repetition % 2 === 0 ? [...ARMS] : [...ARMS].reverse();
    const cold = repetition === 0;
    let warmContext;
    let warmPage;
    if (!cold) {
      warmContext = await newContext();
      warmPage = await warmContext.newPage();
    }
    try {
      for (const arm of armOrder) {
        const contextHandle = cold ? await newContext() : warmContext;
        const page = cold ? await contextHandle.newPage() : warmPage;
        try {
          const sample = await measureOnce(page, {
            url: urlFor(caseInfo, arm.perf),
            caseInfo,
            perf: arm.perf,
            repetition,
            armOrder,
            climate: cold ? 'cold' : 'warm',
          });
          samples.push(sample);
          log(
            `${caseInfo.id} rep ${repetition} ${arm.id} (${sample.climate}): ` +
              `${sample.wallMetric.wallMs.toFixed(0)} ms`,
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

log(`running ${selectedCases.length} cases × 2 arms × ${reps} paired repetitions…`);
const allSamples = [];
for (const caseInfo of selectedCases) {
  allSamples.push(...(await runCase(caseInfo)));
}
log(`collected ${allSamples.length} samples`);

// ---------------------------------------------------------------------------
// (c) Measured retention: fill the ring on the biggest case and measure the
// snapshot JSON size. Two fills: hard case (1 computed + cache-hit fill) and
// easy case (many computed + cache fill), plus the single-trace extrapolation.
// ---------------------------------------------------------------------------
const fillRingByRerequest = async (page, count) => {
  for (let index = 0; index < count; index += 1) {
    await page.getByLabel('Interior view').selectOption('stability');
    await page.waitForTimeout(30);
  }
};
const retentionFill = async (caseInfo, pansFirst) => {
  const context = await newContext();
  const page = await context.newPage();
  try {
    await page.goto(urlFor(caseInfo, true), { timeout: NAVIGATION_TIMEOUT_MS });
    await waitForStablePresented(page);
    if (pansFirst > 0) {
      // Arrow-key pans are handled on the canvas element, so focus it first.
      // Each pan schedules a fresh computed render (view changes by 10%);
      // wait for each stable presentation before the next interaction.
      await page.getByLabel('Interactive Mandelbrot set').focus();
      for (let index = 0; index < pansFirst; index += 1) {
        const before = await page.evaluate(
          () =>
            performance
              .getEntriesByType('mark')
              .filter((mark) => mark.name === 'mi:stable-presented').length,
        );
        await page.keyboard.press(index % 2 === 0 ? 'ArrowRight' : 'ArrowLeft');
        await page.waitForFunction(
          (previous) =>
            performance
              .getEntriesByType('mark')
              .filter((mark) => mark.name === 'mi:stable-presented').length > previous,
          before,
          { timeout: NAVIGATION_TIMEOUT_MS, polling: 100 },
        );
      }
    }
    await fillRingByRerequest(page, 32 - pansFirst);
    await page.waitForFunction(
      () => globalThis.__miRenderTrace.snapshot().length >= 32,
      undefined,
      { timeout: 60_000, polling: 100 },
    );
    return page.evaluate(() => {
      const hook = globalThis.__miRenderTrace;
      const snapshot = hook.snapshot();
      const encoder = new TextEncoder();
      const sizes = snapshot.map((trace) => encoder.encode(JSON.stringify(trace)).length);
      return {
        caseId: undefined,
        tracesInRing: snapshot.length,
        outcomes: Object.entries(
          snapshot.reduce((counts, trace) => {
            counts[trace.outcome] = (counts[trace.outcome] ?? 0) + 1;
            return counts;
          }, {}),
        ),
        totalSnapshotJsonBytes: encoder.encode(JSON.stringify(snapshot)).length,
        maxSingleTraceJsonBytes: Math.max(...sizes),
        allTracesTimesCapacityBytes: Math.max(...sizes) * snapshot.length,
      };
    });
  } finally {
    await context.close();
  }
};

log('measuring ring retention on the biggest case (computed + cache fill)…');
const retentionHard = { ...(await retentionFill(retentionCase, 1)), caseId: RETENTION_CASE_ID };
log(
  `retention (${RETENTION_CASE_ID}, 1 computed + cache fill): ` +
    `${retentionHard.totalSnapshotJsonBytes} bytes`,
);
log('measuring ring retention on the easy case (computed-heavy fill)…');
const retentionEasy = {
  ...(await retentionFill(retentionEasyCase, 24)),
  caseId: RETENTION_EASY_CASE_ID,
};
log(
  `retention (${RETENTION_EASY_CASE_ID}, 24 computed + cache fill): ` +
    `${retentionEasy.totalSnapshotJsonBytes} bytes`,
);
const retention = {
  budgetBytes: RETENTION_BUDGET_BYTES,
  fills: [retentionHard, retentionEasy],
  maxSingleTraceExtrapolation: {
    method:
      'largest single-trace JSON size × ring capacity 32 (upper bound: assumes every retained trace is the worst computed shape)',
    bytes: Math.max(
      retentionHard.allTracesTimesCapacityBytes,
      retentionEasy.allTracesTimesCapacityBytes,
    ),
    caseId:
      retentionHard.allTracesTimesCapacityBytes >= retentionEasy.allTracesTimesCapacityBytes
        ? RETENTION_CASE_ID
        : RETENTION_EASY_CASE_ID,
  },
  withinBudget: [retentionHard, retentionEasy].every(
    (fill) =>
      fill.totalSnapshotJsonBytes <= RETENTION_BUDGET_BYTES &&
      fill.allTracesTimesCapacityBytes <= RETENTION_BUDGET_BYTES,
  ),
};
if (!retention.withinBudget) {
  log('WARNING: measured retention exceeds the 64 KiB budget — recorded honestly');
}

// ---------------------------------------------------------------------------
// Recorder per-frame cost (Node microbenchmark of the production ring).
// ---------------------------------------------------------------------------
log('running the recorder-cost microbenchmark (npm run bench:recorder)…');
const recorderRun = spawnSync('npm', ['run', '--silent', 'bench:recorder'], {
  cwd: repoRoot,
  encoding: 'utf8',
  maxBuffer: 16 * 1024 * 1024,
});
if (recorderRun.status !== 0) {
  process.stderr.write(recorderRun.stderr);
  process.stderr.write('recorder-cost microbenchmark failed\n');
  await browser.close();
  await server.close();
  process.exit(recorderRun.status ?? 1);
}
const recorderOutput = recorderRun.stdout;
const recorderJsonStart = recorderOutput.lastIndexOf('\n{');
const recorderCost = JSON.parse(recorderOutput.slice(recorderJsonStart));
log(`recorder recordFrame mean: ${recorderCost.measured.recordFrameMeanUs.toFixed(2)} µs/frame`);

// ---------------------------------------------------------------------------
// Paired analysis: per-case and pooled log-ratio bootstrap intervals.
// ---------------------------------------------------------------------------
const pairedLogRatios = (caseId) => {
  const ratios = [];
  const pairs = [];
  for (let repetition = 0; repetition < reps; repetition += 1) {
    const present = allSamples.find(
      (sample) =>
        sample.caseId === caseId && sample.arm === 'perf1' && sample.repetition === repetition,
    );
    const absent = allSamples.find(
      (sample) =>
        sample.caseId === caseId && sample.arm === 'perf0' && sample.repetition === repetition,
    );
    if (present === undefined || absent === undefined) continue;
    ratios.push(Math.log(present.wallMetric.wallMs / absent.wallMetric.wallMs));
    pairs.push({
      repetition,
      presentMs: present.wallMetric.wallMs,
      absentMs: absent.wallMetric.wallMs,
    });
  }
  return { ratios, pairs };
};

const evaluateBudget = (interval, budget) => {
  if (interval === undefined) return { verdict: 'no-data', budget };
  // Bounds are log-ratios; express them as relative deltas via exp(·)−1.
  const upperRatio = Math.exp(interval.hi) - 1;
  const lowerRatio = Math.exp(interval.lo) - 1;
  const medianPct = Math.exp(interval.point) - 1;
  const within = upperRatio < budget;
  return {
    budget,
    medianDeltaPct: medianPct,
    intervalLoPct: lowerRatio,
    intervalHiPct: upperRatio,
    verdict: within
      ? `PASS: 95% interval upper bound ${(upperRatio * 100).toFixed(2)}% < ${(budget * 100).toFixed(0)}%`
      : `NOT ESTABLISHED: interval upper bound ${(upperRatio * 100).toFixed(2)}% ≥ ${(budget * 100).toFixed(0)}%`,
  };
};

const analysis = {};
{
  const pooled = { ratios: [], pairs: [] };
  for (const caseInfo of selectedCases) {
    const { ratios, pairs } = pairedLogRatios(caseInfo.id);
    pooled.ratios.push(...ratios);
    pooled.pairs.push(...pairs.map((pair) => ({ caseId: caseInfo.id, ...pair })));
    const interval = bootstrapLogRatioInterval(ratios);
    const budgetView = evaluateBudget(interval, ALWAYS_ON_BUDGET);
    analysis[caseInfo.id] = {
      pairs,
      medianAbsentMs: median(pairs.map((pair) => pair.absentMs)),
      madAbsentMs: mad(pairs.map((pair) => pair.absentMs)),
      medianPresentMs: median(pairs.map((pair) => pair.presentMs)),
      madPresentMs: mad(pairs.map((pair) => pair.presentMs)),
      medianDeltaPct: budgetView.medianDeltaPct,
      interval:
        interval === undefined
          ? undefined
          : { loPct: budgetView.intervalLoPct, hiPct: budgetView.intervalHiPct },
      alwaysOn: budgetView,
      optIn: evaluateBudget(interval, OPT_IN_BUDGET),
    };
  }
  const pooledInterval = bootstrapLogRatioInterval(pooled.ratios);
  analysis.pooled = {
    pairs: pooled.pairs,
    pairCount: pooled.ratios.length,
    medianAbsentMs: median(pooled.pairs.map((pair) => pair.absentMs)),
    medianPresentMs: median(pooled.pairs.map((pair) => pair.presentMs)),
    medianDeltaPct: pooledInterval === undefined ? undefined : Math.exp(pooledInterval.point) - 1,
    interval:
      pooledInterval === undefined
        ? undefined
        : { loPct: pooledInterval.lo - 1, hiPct: pooledInterval.hi - 1 },
    alwaysOn: evaluateBudget(pooledInterval, ALWAYS_ON_BUDGET),
    optIn: evaluateBudget(pooledInterval, OPT_IN_BUDGET),
  };
}
for (const key of [...selectedCases.map((caseInfo) => caseInfo.id), 'pooled']) {
  const entry = analysis[key];
  log(
    `${key}: median Δ ${(entry.medianDeltaPct * 100).toFixed(2)}% ` +
      `[${(entry.interval.loPct * 100).toFixed(2)}%, ${(entry.interval.hiPct * 100).toFixed(2)}%] ` +
      `always-on: ${entry.alwaysOn.verdict}`,
  );
}

// ---------------------------------------------------------------------------
// Semantic comparison: perf1 vs perf0 stable-canvas hashes must be identical
// (the hook adds no rendering work; any mismatch is a finding).
// ---------------------------------------------------------------------------
const comparisons = selectedCases.map((caseInfo) => {
  const repsData = [];
  for (let repetition = 0; repetition < reps; repetition += 1) {
    const present = allSamples.find(
      (sample) =>
        sample.caseId === caseInfo.id && sample.arm === 'perf1' && sample.repetition === repetition,
    );
    const absent = allSamples.find(
      (sample) =>
        sample.caseId === caseInfo.id && sample.arm === 'perf0' && sample.repetition === repetition,
    );
    if (present === undefined || absent === undefined) continue;
    repsData.push({
      repetition,
      climate: present.climate,
      perf1Hash: present.semanticHash.hash,
      perf0Hash: absent.semanticHash.hash,
      equal: present.semanticHash.hash === absent.semanticHash.hash,
    });
  }
  const mismatches = repsData.filter((rep) => !rep.equal).map((rep) => rep.repetition);
  return {
    caseId: caseInfo.id,
    matches: repsData.length - mismatches.length,
    mismatches: mismatches.length,
    mismatchRepetitions: mismatches,
    reps: repsData,
  };
});

// ---------------------------------------------------------------------------
// Evidence packaging (evidence/phase-2/README.md contract). The manifest is
// emitted last.
// ---------------------------------------------------------------------------
const userAgent = await (async () => {
  const context = await newContext();
  const page = await context.newPage();
  const value = await page.evaluate(() => globalThis.navigator.userAgent);
  await context.close();
  return value;
})();

const environmentPath = path.join(outDir, 'environment.json');
spawnSync(
  'node',
  [
    path.join(repoRoot, 'tools/benchmark/capture-environment.mjs'),
    '--out',
    environmentPath,
    '--note',
    `MI-PERF-007 overhead benchmark (${engine}, ${executionMode}); production bundle via vite build + vite preview.`,
  ],
  { cwd: repoRoot, stdio: 'inherit' },
);
const environment = JSON.parse(readFileSync(environmentPath, 'utf8'));
const engineFacts = {
  build: browser.version(),
  engine: userAgent,
  headed,
  executionMode,
  powerMode: null,
  devicePixelRatio: 1,
  viewport: { ...viewportSize },
  automation: `Playwright ${playwrightVersion} automation-bundled ${engine}`,
  label:
    'automation-bundled engine — directional only, not release evidence per plan §9 (branded stable Firefox, declared target hardware, 21+ reps remain release-gate work)',
  workerCount: [
    ...new Set(
      allSamples
        .filter((sample) => sample.workerCount !== undefined)
        .map((sample) => sample.workerCount),
    ),
  ].sort((a, b) => a - b),
  backend: 'cpu',
  samples: allSamples.length,
};
environment.browser = { ...engineFacts, notes: 'primary overhead-benchmark record' };
environment.render = {
  workerCount: engineFacts.workerCount[0] ?? null,
  backend: 'cpu',
};
environment.protocol = {
  buildMode: 'vite build (production bundle) served by vite preview; dev server never used',
  design:
    'paired ?perf=1 present vs absent, 11 paired repetitions, arm order alternating per repetition, rep 0 cold (fresh context per arm), reps 1+ warm',
  wallMetric:
    'in-page User Timing marks: last mi:stable-presented startTime minus mi:app-mount startTime (both marks are emitted unconditionally, so the metric exists in both arms without the diagnostic hook)',
  alwaysOnBudget:
    'paired median % difference within 2% with the bootstrap interval excluding worse-than-2% (plan §8)',
  optInBudget: 'same paired samples against the 5% opt-in diagnostics budget (plan §8)',
  retentionBudget: 'filled-ring snapshot JSON ≤64 KiB on the biggest case (plan §8)',
  bootstrap: {
    method: 'paired percentile bootstrap on log(present/absent) per pair, B=10000 resamples',
    seed: BOOTSTRAP_SEED,
    bootstrapReps: BOOTSTRAP_REPS,
    space: 'log-ratio; bounds reported as ratios (exp( bound )−1)',
  },
  recorderCost:
    'Node microbenchmark of the production ring (npm run bench:recorder), stored as recorder-cost-node.json; directional',
  hashByteOrder:
    'SHA-256 over row-major RGBA bytes from getImageData(0, 0, width, height) of canvas.explorer__canvas',
  engineLabels:
    'automation-bundled engines are directional; branded stable browsers on declared target hardware remain the release protocol',
  executionMode,
  powerMode: 'unknown in the automation environment; recorded as null',
};
environment.notes.push(`Browser facts filled by tools/benchmark/run-overhead.mjs (${engine} run).`);
writeFileSync(environmentPath, `${JSON.stringify(environment, null, 2)}\n`);

const rawPath = path.join(outDir, 'raw-observations.json');
const existingRaw = existsSync(rawPath) ? JSON.parse(readFileSync(rawPath, 'utf8')) : undefined;
const samplesByEngine = {
  ...(existingRaw?.samplesByEngine ?? {}),
  [engine]: allSamples,
};
const rawObservations = {
  schemaVersion: 1,
  description:
    'Every overhead-benchmark sample, raw and timestamp-free. Aggregates in summary.md are derived views only. perf1 samples additionally carry the full opt-in render-trace snapshot.',
  corpus: {
    file: 'tools/benchmark/corpus.v1.json',
    schemaVersion: corpus.schemaVersion,
    sha256: corpusSha256,
  },
  raster: SHIPPING_RASTER,
  repetitions: reps,
  arms: ['perf1 (?perf=1 present)', 'perf0 (?perf=1 absent)'],
  retention,
  recorderCostNode: recorderCost,
  samplesByEngine,
};
writeFileSync(rawPath, `${JSON.stringify(rawObservations, null, 2)}\n`);

writeFileSync(
  path.join(outDir, 'recorder-cost-node.json'),
  `${JSON.stringify(recorderCost, null, 2)}\n`,
);

const comparisonPath = path.join(outDir, 'semantic-comparison.json');
const existingComparison = existsSync(comparisonPath)
  ? JSON.parse(readFileSync(comparisonPath, 'utf8'))
  : undefined;
const semanticComparison = {
  schemaVersion: 1,
  method: {
    algorithm: 'sha-256',
    byteOrder:
      'row-major RGBA, 4 bytes per pixel, read via getImageData(0, 0, width, height) from canvas.explorer__canvas after the computed stable frame is presented',
    scope:
      'overhead-run comparison: the perf=1 arm (opt-in diagnostics) against the perf0 arm must render byte-identical rasters; the hook adds no rendering work',
    expectation: 'identical hashes on every case × repetition; mismatches are findings',
  },
  comparisonsByEngine: {
    ...(existingComparison?.comparisonsByEngine ?? {}),
    [engine]: comparisons,
  },
};
writeFileSync(comparisonPath, `${JSON.stringify(semanticComparison, null, 2)}\n`);

// ---------------------------------------------------------------------------
// Summary.
// ---------------------------------------------------------------------------
const summaryLines = [];
summaryLines.push(`# MI-PERF-007 overhead benchmark — ${runDate} @ ${shortCommit}`);
summaryLines.push('');
summaryLines.push(
  'Paired `?perf=1` present vs absent evidence from the production bundle ' +
    '(`vite build` + `vite preview`), driven through the real application UI by ' +
    '`tools/benchmark/run-overhead.mjs`. ' +
    `Wall metric: in-page marks (last \`mi:stable-presented\` − \`mi:app-mount\`), available in both arms. ` +
    `${selectedCases.length} cases (2 easy + 2 hard) × 2 arms × ${reps} paired repetitions, ` +
    'arm order alternating per repetition; rep 0 cold (fresh context per arm), reps 1+ warm. ' +
    'Every sample is stored raw in raw-observations.json; aggregates below are derived views.',
);
summaryLines.push('');
summaryLines.push(
  `**Label (${engine}):** Playwright automation-bundled ${engine}, ${executionMode} — ` +
    'directional only, not release evidence per plan §9 (branded stable Firefox, headed on declared target hardware, 21+ reps).',
);
summaryLines.push('');
summaryLines.push('## Paired end-to-end overhead (perf=1 present vs absent)');
summaryLines.push('');
summaryLines.push(
  '| Case | absent median (MAD) | perf=1 median (MAD) | median Δ | 95% paired bootstrap interval | always-on ≤2% | opt-in ≤5% |',
);
summaryLines.push('| --- | --- | --- | --- | --- | --- | --- |');
for (const caseInfo of selectedCases) {
  const entry = analysis[caseInfo.id];
  summaryLines.push(
    `| ${caseInfo.id} | ${entry.medianAbsentMs.toFixed(0)} ms (${entry.madAbsentMs.toFixed(0)}) | ` +
      `${entry.medianPresentMs.toFixed(0)} ms (${entry.madPresentMs.toFixed(0)}) | ` +
      `${formatPct(entry.medianDeltaPct)} | ` +
      `${formatPct(entry.interval.loPct)} … ${formatPct(entry.interval.hiPct)} | ` +
      `${entry.alwaysOn.verdict.startsWith('PASS') ? 'established' : '**not established**'} | ` +
      `${entry.optIn.verdict.startsWith('PASS') ? 'within' : '**not established**'} |`,
  );
}
const pooled = analysis.pooled;
summaryLines.push(
  `| **pooled (${pooled.pairCount} pairs)** | ${pooled.medianAbsentMs.toFixed(0)} | ${pooled.medianPresentMs.toFixed(0)} | ${formatPct(pooled.medianDeltaPct)} | ${formatPct(pooled.interval.loPct)} … ${formatPct(pooled.interval.hiPct)} | ${pooled.alwaysOn.verdict.startsWith('PASS') ? 'established' : '**not established**'} | ${pooled.optIn.verdict.startsWith('PASS') ? 'within' : '**not established**'} |`,
);
summaryLines.push('');
summaryLines.push(
  `Bootstrap: paired percentile bootstrap on log(present/absent), B=${BOOTSTRAP_REPS}, ` +
    `seed ${BOOTSTRAP_SEED} (mulberry32, recorded per the evidence contract). Intervals are in log-ratio space; ` +
    'the always-on claim needs the interval upper bound below +2%, the opt-in budget below +5%. ' +
    'Per-case intervals at 11 pairs are wide; the pooled row is the primary verdict and per-case rows are recorded alongside.',
);
summaryLines.push('');
summaryLines.push('## Recorder cost and retention');
summaryLines.push('');
summaryLines.push(
  `- Recorder per-frame cost (Node microbenchmark of the production ring, directional): ` +
    `recordFrame mean ${recorderCost.measured.recordFrameMeanUs.toFixed(2)} µs, ` +
    `ring-call mean ${recorderCost.measured.ringCallMeanUs.toFixed(2)} µs — ` +
    `${recorderCost.measured.recordFrameMeanUs <= recorderCost.budget.perFrameBudgetUs ? 'within' : '**exceeds**'} the ≤0.2 ms/frame budget. ` +
    'The end-to-end paired interval above bounds the same budget behaviorally in the browser.',
);
summaryLines.push(
  `- Measured retention: budget ${RETENTION_BUDGET_BYTES} bytes. ` +
    retention.fills
      .map(
        (fill) =>
          `${fill.caseId} (${fill.outcomes.map(([outcome, count]) => `${count}×${outcome}`).join(', ')}): ` +
          `${fill.totalSnapshotJsonBytes} bytes`,
      )
      .join('; ') +
    `. Worst-single-trace × capacity extrapolation: ${retention.maxSingleTraceExtrapolation.bytes} bytes. ` +
    `${retention.withinBudget ? 'Within the 64 KiB budget.' : '**EXCEEDS** the 64 KiB budget.'}`,
);
summaryLines.push('');
summaryLines.push('## Semantic comparison (perf1 vs perf0 stable-canvas hash)');
summaryLines.push('');
for (const entry of comparisons) {
  summaryLines.push(
    `- ${entry.caseId}: ${entry.matches}/${entry.reps.length} identical hashes` +
      (entry.mismatchRepetitions.length > 0
        ? `; mismatches at repetitions ${entry.mismatchRepetitions.join(', ')} — FINDING`
        : ''),
  );
}
summaryLines.push('');
summaryLines.push('## Scope and honesty notes');
summaryLines.push('');
for (const note of [
  `Execution: ${executionMode}. Automation-bundled engines are directional; the release protocol (plan §9) needs branded stable Firefox, declared target hardware, 21+ paired repetitions with BCa intervals.`,
  'The wall metric is mark-based (mi:app-mount → last mi:stable-presented) rather than the ring’s requestToPresentMs, so it exists identically in the perf0 arm; requestToPresentMs of the perf arm is stored raw for cross-reference.',
  'The perf=1 arm carries the full opt-in diagnostics (hook + trace retention); the always-on ring is present in BOTH arms, so the paired delta isolates the opt-in diagnostics overhead on top of the always-on recorder.',
  'Rep 0 (cold) is included in the paired intervals (worker/module compile noise is paired and largely cancels); warm-only views are derivable from raw-observations.json.',
  'Retention fills use the ring capacity (32): the hard-case fill is 1 computed + 31 cache traces; the easy-case fill is 24 computed + 8 cache traces; the single-trace × 32 extrapolation bounds the all-computed worst case.',
  'recorder-cost-node.json is a Node/V8 microbenchmark — directional only; browser magnitudes are bounded end-to-end by the paired intervals above.',
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

await browser.close();
await server.close();
process.exit(0);
