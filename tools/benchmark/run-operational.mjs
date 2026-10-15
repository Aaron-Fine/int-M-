#!/usr/bin/env node
/**
 * Operational-suite evidence runner (performance plan §8/§9, workstream A gate
 * `Reproducible runs in stable Chrome and Firefox; cache/replay/cancel sources
 * distinguishable`; MI-PERF-006/007).
 *
 * Drives the production bundle (`vite build` + `vite preview`, never the dev
 * server) through the real application UI at the shipping 1024x640 raster and
 * reads the always-on render-trace ring through the opt-in `?perf=1` hook. One
 * persistent page per distribution; every interaction's trace is stored raw.
 *
 * Distributions (default 50 interactions each, plan §9: ≥50 per cancellation
 * distribution, ≥40 for any reported p95):
 *
 * - `cancel`: hard view (mi-hard-supplied-126x, Detailed, default classifier).
 *   After each render's coarse frame, a zoom key press supersedes it; the
 *   application cancels the in-flight request. Records the trace's
 *   `cancelAckMs` (worker acknowledgment) and `childQuiescenceMs` (renderer
 *   and every nested tile worker stopped), both from the main-thread cancel
 *   request time. A stable frame that wins the race is recorded as `raced`
 *   and does not count.
 * - `inflight-replay`: same view; after each render's coarse frame, the
 *   interior view changes. The worker rebinds the active computation and
 *   replays its retained coarse frame (`inflight-replay`), then delivers the
 *   stable frame as `computed` under the new request.
 * - `recolor`: same view, stable; cycle the interior view. Each request is a
 *   cached semantic frame delivered in a different view (`recolor`).
 * - `semantic-cache`: default view (mi-easy-default-full, Balanced), stable;
 *   press Reset. Each request is the cached frame in the same view.
 *
 * Per interaction the runner checks the provenance invariants: the expected
 * source, an `originComputeId` equal to the computation that produced the
 * reused frame, and compute fields (`workerWallMs`, band timing) absent on
 * every non-computed frame. Any violation is a recorded failure.
 *
 * Labels are honest: `--release` runs branded stable browsers, headed, on the
 * machine running the harness (plan §9 release protocol); otherwise the
 * automation-bundled engine runs headless and the evidence is directional.
 *
 * Usage:
 *   node tools/benchmark/run-operational.mjs [--engine chromium|firefox]
 *       [--release] [--executable <browser>] [--interactions 50]
 *       [--out-dir <evidence/phase-2/<date>-<commit>-operational>]
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { build, preview } from 'vite';
import {
  automationLabel,
  DIRECTIONAL_LABEL,
  launchEvidenceBrowser,
  readPowerMode,
  RELEASE_LABEL,
  sessionLocked,
} from './release-browser.mjs';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const PREVIEW_PORT = 4185;
const CDP_PORT = 9335;
const TARGET_RASTER = { width: 1024, height: 640 };
const STEP_TIMEOUT_MS = 2 * 60_000;
const VIEWS = ['stability', 'multiplier', 'period'];

const log = (message) => {
  process.stderr.write(`[operational] ${message}\n`);
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
const interactions = Number(readOption('--interactions') ?? 50);
if (!Number.isInteger(interactions) || interactions < 1) {
  process.stderr.write('--interactions must be a positive integer\n');
  process.exit(2);
}
if (RELEASE && interactions < 50) {
  process.stderr.write('--release needs --interactions >= 50 (plan §9 cancellation count)\n');
  process.exit(2);
}
if (RELEASE && sessionLocked() === true) {
  process.stderr.write(
    'the session is locked: a headed release run stalls without frame callbacks. ' +
      'Unlock it (and inhibit the screensaver, e.g. kde-inhibit --screenSaver) first.\n',
  );
  process.exit(2);
}
const executablePath = readOption('--executable');

const corpus = JSON.parse(
  readFileSync(path.join(repoRoot, 'tools/benchmark/corpus.v1.json'), 'utf8'),
);
const caseById = (id) => {
  const found = corpus.cases.find((caseInfo) => caseInfo.id === id);
  if (found === undefined) throw new Error(`corpus case ${id} missing`);
  return found;
};
const HARD = caseById('mi-hard-supplied-126x');
const EASY = caseById('mi-easy-default-full');

const shortCommit = (() => {
  const result = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  return result.status === 0 ? result.stdout.trim() : 'unknown';
})();
const dirty = (() => {
  const result = spawnSync('git', ['status', '--porcelain', '--', 'src', 'tools', 'index.html'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  return result.status === 0 && result.stdout.trim().length > 0;
})();
const runDate = new Date().toISOString().slice(0, 10);
const outDir = path.resolve(
  readOption('--out-dir') ??
    path.join(repoRoot, 'evidence/phase-2', `${runDate}-${shortCommit}-operational`),
);
mkdirSync(outDir, { recursive: true });

// ---------------------------------------------------------------------------
// Stats (derived views; every sample is stored).
// ---------------------------------------------------------------------------
const median = (values) => {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const mad = (values) => {
  const center = median(values);
  return center === undefined ? undefined : median(values.map((value) => Math.abs(value - center)));
};
/** Nearest-rank p95, reported only with ≥40 observations (plan §9). */
const p95 = (values) => {
  if (values.length < 40) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(0.95 * sorted.length) - 1];
};
const describe = (values) => ({
  n: values.length,
  median: median(values),
  mad: mad(values),
  p95: p95(values),
  min: values.length === 0 ? undefined : Math.min(...values),
  max: values.length === 0 ? undefined : Math.max(...values),
});
const formatMs = (value) => (value === undefined ? '—' : `${value.toFixed(1)} ms`);

// ---------------------------------------------------------------------------
// Build, serve, launch, calibrate.
// ---------------------------------------------------------------------------
log(`engine=${engine} release=${RELEASE} interactions=${interactions}`);
log('building production bundle (vite build)…');
await build({
  root: repoRoot,
  configFile: path.join(repoRoot, 'vite.config.ts'),
  logLevel: 'warn',
});
const server = await preview({
  root: repoRoot,
  configFile: path.join(repoRoot, 'vite.config.ts'),
  preview: { host: '127.0.0.1', port: PREVIEW_PORT, strictPort: true },
});
const baseUrl = `http://127.0.0.1:${PREVIEW_PORT}`;

const {
  browser,
  close: closeBrowser,
  launchedBy,
} = await launchEvidenceBrowser({
  engine,
  release: RELEASE,
  executablePath,
  cdpPort: CDP_PORT,
});
log(
  `${engine} ${browser.version()} launched (${RELEASE ? `branded, headed: ${launchedBy}` : 'headless'})`,
);

/**
 * Waits for the request's trace in the ring. `kind`: 'any' (open traces are
 * not in the ring, so any closed trace), or 'cancel-resolved' (cancelled or
 * completed). Returns the trace as JSON.
 */
const waitForTrace = async (page, kind, requestId) => {
  const handle = await page.waitForFunction(
    ([expectedKind, id]) =>
      (globalThis.__miRenderTrace?.snapshot() ?? []).find(
        (trace) =>
          trace.requestId === id &&
          (expectedKind === 'any' ||
            trace.outcome === 'cancelled' ||
            trace.outcome === 'completed'),
      ),
    [kind, requestId],
    { timeout: STEP_TIMEOUT_MS, polling: 20 },
  );
  return handle.jsonValue();
};

/**
 * Waits for a newer request than `afterId` to reach `stage` (or, with
 * `orStable`, to reach either `stage` or stable — a cheap request can pass
 * through its coarse frame between polls). Returns its id and stage.
 */
const waitForStage = async (page, stage, afterId, orStable = false) => {
  const handle = await page.waitForFunction(
    ([expected, after, acceptStable]) => {
      const explorer = globalThis.document.querySelector('#explorer');
      const current = explorer?.getAttribute('data-render-stage');
      const id = Number(explorer?.getAttribute('data-render-request-id'));
      return id > after && (current === expected || (acceptStable && current === 'stable'))
        ? { id, stage: current }
        : undefined;
    },
    [stage, afterId, orStable],
    { timeout: STEP_TIMEOUT_MS, polling: 5 },
  );
  return handle.jsonValue();
};

const urlFor = (caseInfo) =>
  `${baseUrl}/?perf=1&view=${caseInfo.center.re},${caseInfo.center.im},${caseInfo.spanY}&quality=${caseInfo.profile.toLowerCase()}`;

const calibrateViewport = async () => {
  let size = { width: 1600, height: 900 };
  const context = await browser.newContext({ viewport: size, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/?perf=1`);
  await waitForStage(page, 'stable', 0);
  const measure = () =>
    page.evaluate(() => {
      const rect = globalThis.document.querySelector('.explorer__stack').getBoundingClientRect();
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
const viewportSize = await calibrateViewport();
log(`calibrated viewport ${viewportSize.width}x${viewportSize.height}`);

const openPage = async (caseInfo) => {
  const context = await browser.newContext({ viewport: viewportSize, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(urlFor(caseInfo), { timeout: STEP_TIMEOUT_MS });
  const { id: firstId } = await waitForStage(page, 'stable', 0);
  await page.getByLabel('Interactive Mandelbrot set').focus();
  return { context, page, firstId };
};

const canvasOf = (page) => page.getByLabel('Interactive Mandelbrot set');
const zoomKey = (index) => (index % 2 === 0 ? '+' : '-');

// ---------------------------------------------------------------------------
// Provenance invariants (one record per violation).
// ---------------------------------------------------------------------------
const COMPUTE_FIELDS = [
  'workerWallMs',
  'maxBandElapsedMs',
  'imbalanceRatio',
  'mergeCpuMs',
  'bandsElapsedMs',
  'yieldWaitMs',
  'yieldCount',
];
const checkFrame = (frame, expectedSource, expectedOrigin) => {
  const violations = [];
  if (frame.source !== expectedSource)
    violations.push(`source ${frame.source} != ${expectedSource}`);
  if (expectedSource === 'computed') {
    if (frame.originComputeId !== undefined)
      violations.push('computed frame carries originComputeId');
    if (frame.workerWallMs === undefined) violations.push('computed frame lacks workerWallMs');
  } else {
    if (frame.originComputeId !== expectedOrigin) {
      violations.push(`originComputeId ${frame.originComputeId} != ${expectedOrigin}`);
    }
    for (const field of COMPUTE_FIELDS) {
      if (frame[field] !== undefined) violations.push(`${expectedSource} frame carries ${field}`);
    }
  }
  if (frame.colorizeMs === undefined) violations.push('colorizeMs missing');
  return violations;
};

// ---------------------------------------------------------------------------
// Distributions.
// ---------------------------------------------------------------------------
const runCancel = async () => {
  const { context, page, firstId } = await openPage(HARD);
  const samples = [];
  let lastId = firstId;
  let attempts = 0;
  try {
    // Kick off the first render to cancel.
    await canvasOf(page).press(zoomKey(attempts));
    while (samples.filter((sample) => sample.outcome === 'cancelled').length < interactions) {
      if (attempts > interactions * 3) throw new Error('cancel: too many raced attempts');
      const { id: coarseId } = await waitForStage(page, 'coarse', lastId, true);
      attempts += 1;
      // A request already stable is not cancelled; the press only starts the
      // next one, and its trace closes as completed (recorded as raced).
      await canvasOf(page).press(zoomKey(attempts));
      const resolved = await waitForTrace(page, 'cancel-resolved', coarseId);
      lastId = coarseId;
      samples.push({
        interaction: attempts,
        requestId: coarseId,
        outcome: resolved.outcome === 'cancelled' ? 'cancelled' : 'raced',
        cancelAckMs: resolved.cancelAckMs,
        childQuiescenceMs: resolved.childQuiescenceMs,
        violations: [
          ...(resolved.outcome === 'cancelled' && resolved.cancelAckMs === undefined
            ? ['no cancelAckMs']
            : []),
          ...(resolved.outcome === 'cancelled' && resolved.childQuiescenceMs === undefined
            ? ['no childQuiescenceMs']
            : []),
          ...(resolved.outcome === 'cancelled' &&
          resolved.childQuiescenceMs !== undefined &&
          resolved.cancelAckMs !== undefined &&
          resolved.childQuiescenceMs < resolved.cancelAckMs
            ? ['quiescence precedes acknowledgment']
            : []),
        ],
        trace: resolved,
      });
      if (attempts % 10 === 0) log(`cancel: ${attempts} interactions`);
    }
  } finally {
    await context.close();
  }
  return samples;
};

const runReplay = async () => {
  const { context, page, firstId } = await openPage(HARD);
  const samples = [];
  let lastId = firstId;
  let viewIndex = 0;
  try {
    for (let index = 0; index < interactions; index += 1) {
      await canvasOf(page).press(zoomKey(index));
      const { id: coarseId } = await waitForStage(page, 'coarse', lastId, true);
      viewIndex = (viewIndex + 1) % VIEWS.length;
      await page.getByLabel('Interior view').selectOption(VIEWS[viewIndex]);
      const replayId = coarseId + 1;
      const resolved = await waitForTrace(page, 'any', replayId);
      const origin = await waitForTrace(page, 'any', coarseId);
      lastId = replayId;
      const replay = resolved.frames[0];
      const stable = resolved.frames.find((frame) => frame.stage === 'stable');
      const violations = [];
      // The superseded origin trace carries its computeId only if its coarse
      // frame was recorded (on the next animation frame) before the view
      // change began the new request; the rebound request always carries it.
      const originComputeId = origin.computeId ?? resolved.computeId;
      if (origin.computeId !== undefined && resolved.computeId !== origin.computeId) {
        violations.push(`origin computeId ${origin.computeId} != rebound ${resolved.computeId}`);
      }
      if (replay === undefined || stable === undefined) {
        violations.push(`incomplete replay trace (outcome ${resolved.outcome})`);
      } else if (replay.stage === 'coarse') {
        violations.push(...checkFrame(replay, 'inflight-replay', originComputeId));
        violations.push(...checkFrame(stable, 'computed'));
        if (resolved.computeId !== originComputeId) {
          violations.push(`rebound computeId ${resolved.computeId} != ${originComputeId}`);
        }
      }
      samples.push({
        interaction: index,
        requestId: replayId,
        // The stable frame can win the race against the view change.
        outcome: replay?.source === 'inflight-replay' ? 'replayed' : 'raced',
        replayRequestToPresentMs: replay?.requestToPresentMs,
        replayColorizeMs: replay?.colorizeMs,
        stableRequestToPresentMs: stable?.requestToPresentMs,
        violations: replay?.source === 'inflight-replay' ? violations : [],
        trace: resolved,
      });
      if ((index + 1) % 10 === 0) log(`inflight-replay: ${index + 1} interactions`);
    }
  } finally {
    await context.close();
  }
  return samples;
};

const runCached = async (caseInfo, distribution) => {
  const { context, page, firstId } = await openPage(caseInfo);
  const samples = [];
  let origin = await waitForTrace(page, 'any', firstId);
  let lastId = firstId;
  if (distribution === 'semantic-cache') {
    // Settle on the exact Reset viewport first: the corpus view's decimal
    // strings need not equal the default viewport bit for bit.
    await canvasOf(page).press('0');
    lastId = (await waitForStage(page, 'stable', lastId)).id;
    const reset = await waitForTrace(page, 'any', lastId);
    if (reset.computeId !== undefined) origin = reset;
  }
  let viewIndex = 0;
  try {
    for (let index = 0; index < interactions; index += 1) {
      if (distribution === 'recolor') {
        viewIndex = (viewIndex + 1) % VIEWS.length;
        await page.getByLabel('Interior view').selectOption(VIEWS[viewIndex]);
      } else {
        await canvasOf(page).press('0');
      }
      const { id: requestId } = await waitForStage(page, 'stable', lastId);
      lastId = requestId;
      const resolved = await waitForTrace(page, 'any', requestId);
      const frame = resolved.frames[0];
      samples.push({
        interaction: index,
        requestId,
        outcome: resolved.outcome,
        requestToPresentMs: frame?.requestToPresentMs,
        colorizeMs: frame?.colorizeMs,
        violations: [
          ...(resolved.frames.length === 1
            ? []
            : [`expected 1 frame, got ${resolved.frames.length}`]),
          ...(frame === undefined
            ? ['no frame']
            : checkFrame(frame, distribution, origin.computeId)),
          ...(resolved.computeId === undefined ? [] : ['reused request carries a computeId']),
        ],
        trace: resolved,
      });
      if ((index + 1) % 10 === 0) log(`${distribution}: ${index + 1} interactions`);
    }
  } finally {
    await context.close();
  }
  return { originComputeId: origin.computeId, samples };
};

const distributions = {};
log('cancel distribution…');
distributions.cancel = { case: HARD.id, profile: HARD.profile, samples: await runCancel() };
log('inflight-replay distribution…');
distributions['inflight-replay'] = {
  case: HARD.id,
  profile: HARD.profile,
  samples: await runReplay(),
};
log('recolor distribution…');
distributions.recolor = {
  case: HARD.id,
  profile: HARD.profile,
  ...(await runCached(HARD, 'recolor')),
};
log('semantic-cache distribution…');
distributions['semantic-cache'] = {
  case: EASY.id,
  profile: EASY.profile,
  ...(await runCached(EASY, 'semantic-cache')),
};

const userAgent = await (async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const value = await page.evaluate(() => globalThis.navigator.userAgent);
  await context.close();
  return value;
})();
const browserVersion = browser.version();
await closeBrowser();
await server.close();

// ---------------------------------------------------------------------------
// Evidence packaging (evidence/phase-2/README.md contract).
// ---------------------------------------------------------------------------
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
    `Operational suite (${engine}); production bundle via vite build + vite preview.`,
  ],
  { cwd: repoRoot, stdio: 'inherit' },
);
const environment = JSON.parse(readFileSync(environmentPath, 'utf8'));
const engineFacts = {
  build: browserVersion,
  engine: userAgent,
  headed: RELEASE,
  powerMode: RELEASE ? readPowerMode() : null,
  devicePixelRatio: 1,
  viewport: viewportSize,
  automation: automationLabel({ engine, release: RELEASE, launchedBy }),
  label: RELEASE
    ? RELEASE_LABEL.replace(
        '≥21 warm pairs, BCa paired intervals',
        `≥${interactions} interactions per distribution`,
      )
    : DIRECTIONAL_LABEL,
  sourceTreeDirty: dirty,
};
environment.browsers = { ...(existingEnvironment?.browsers ?? {}), [engine]: engineFacts };
environment.protocol = {
  buildMode: 'vite build (production bundle) served by vite preview; dev server never used',
  raster: 'shipping-1024x640',
  interactionsPerDistribution: interactions,
  classifierMode: 'production default (no classifierMode parameter)',
  distributions: {
    cancel: `${HARD.id} at ${HARD.profile}: a zoom key press after each coarse frame cancels the in-flight request; cancelAckMs and childQuiescenceMs from the main-thread cancel request`,
    'inflight-replay': `${HARD.id} at ${HARD.profile}: an interior-view change after each coarse frame; the replayed coarse frame's requestToPresentMs`,
    recolor: `${HARD.id} at ${HARD.profile}, stable: interior-view cycle; requestToPresentMs and colorizeMs`,
    'semantic-cache': `${EASY.id} at ${EASY.profile}, stable: Reset key; requestToPresentMs and colorizeMs`,
  },
  p95Rule: 'nearest-rank p95 reported only with at least 40 observations (plan §9)',
};
environment.notes = [
  ...(environment.notes ?? []),
  `Browser facts filled by tools/benchmark/run-operational.mjs (${engine} run).`,
];
writeFileSync(environmentPath, `${JSON.stringify(environment, null, 2)}\n`);

const rawPath = path.join(outDir, 'raw-observations.json');
const existingRaw = existsSync(rawPath) ? JSON.parse(readFileSync(rawPath, 'utf8')) : undefined;
const raw = {
  schemaVersion: 1,
  description: 'Every operational-suite interaction with its full render trace, timestamp-free.',
  distributionsByEngine: { ...(existingRaw?.distributionsByEngine ?? {}), [engine]: distributions },
};
writeFileSync(rawPath, `${JSON.stringify(raw, null, 2)}\n`);

const summaryLines = [
  `# Operational suite — ${runDate} @ ${shortCommit}${dirty ? ' (uncommitted source changes)' : ''}`,
  '',
  'Cache, replay, recolor, and cancellation distributions from the production bundle, driven through the real application UI and read from the always-on render-trace ring (`tools/benchmark/run-operational.mjs`). Every interaction and its full trace are in raw-observations.json.',
  '',
];
for (const [engineName, engineDistributions] of Object.entries(raw.distributionsByEngine)) {
  const facts = environment.browsers[engineName];
  summaryLines.push(
    `## ${engineName} — ${facts?.automation ?? 'unknown'}`,
    '',
    `Label: ${facts?.label ?? '—'}`,
    '',
  );
  summaryLines.push(
    '| Distribution | Metric | n | median (MAD) | p95 | min / max | provenance violations | raced |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
  );
  const row = (name, metric, values, samples, raced) => {
    const stats = describe(values);
    const violations = samples.reduce((sum, sample) => sum + sample.violations.length, 0);
    summaryLines.push(
      `| ${name} | ${metric} | ${stats.n} | ${formatMs(stats.median)} (${formatMs(stats.mad)}) | ${formatMs(stats.p95)} | ${formatMs(stats.min)} / ${formatMs(stats.max)} | ${violations} | ${raced} |`,
    );
  };
  const cancel = engineDistributions.cancel.samples;
  const cancelled = cancel.filter((sample) => sample.outcome === 'cancelled');
  const cancelRaced = cancel.length - cancelled.length;
  row(
    'cancel',
    'cancelAckMs',
    cancelled.map((s) => s.cancelAckMs).filter(Number.isFinite),
    cancel,
    cancelRaced,
  );
  row(
    'cancel',
    'childQuiescenceMs',
    cancelled.map((s) => s.childQuiescenceMs).filter(Number.isFinite),
    cancel,
    cancelRaced,
  );
  const replay = engineDistributions['inflight-replay'].samples;
  const replayed = replay.filter((sample) => sample.outcome === 'replayed');
  row(
    'inflight-replay',
    'requestToPresentMs (replayed coarse)',
    replayed.map((s) => s.replayRequestToPresentMs),
    replay,
    replay.length - replayed.length,
  );
  for (const name of ['recolor', 'semantic-cache']) {
    const samples = engineDistributions[name].samples;
    row(
      name,
      'requestToPresentMs',
      samples.map((s) => s.requestToPresentMs),
      samples,
      0,
    );
    row(
      name,
      'colorizeMs',
      samples.map((s) => s.colorizeMs),
      samples,
      0,
    );
  }
  const totalViolations = Object.values(engineDistributions).reduce(
    (sum, distribution) =>
      sum + distribution.samples.reduce((inner, sample) => inner + sample.violations.length, 0),
    0,
  );
  summaryLines.push(
    '',
    totalViolations === 0
      ? 'Sources distinguishable: every interaction carried its expected source, reused frames named the computation they reused, and no compute field appeared on a non-computed frame.'
      : `**${totalViolations} provenance violations** — see raw-observations.json \`violations\`.`,
    '',
  );
}
summaryLines.push(
  '## Scope and honesty notes',
  '',
  '- `requestToPresentMs` ends at the next presentation opportunity after image upload; it is not proof of physical paint (plan §8).',
  '- Cancellation timings are main-thread deltas from the cancel request: acknowledgment when the worker accepted the cancel, quiescence when the renderer and every nested tile worker had stopped (or the pool was reset).',
  '- `raced` counts interactions where the stable frame arrived before the cancel or view change took effect; they are stored but excluded from the distribution.',
  '- Cold worker and fallback-recovery behavior are covered by Stage A cold repetitions and the browser recovery test, not measured here; cold Wasm and catalog shard states do not apply (no Wasm backend, workstream F deferred).',
);
writeFileSync(path.join(outDir, 'summary.md'), `${summaryLines.join('\n')}\n`);

const manifest = spawnSync('node', [path.join(repoRoot, 'tools/benchmark/manifest.mjs'), outDir], {
  cwd: repoRoot,
  stdio: 'inherit',
});
log(`evidence directory: ${path.relative(repoRoot, outDir)}`);
process.exit(manifest.status ?? 0);
