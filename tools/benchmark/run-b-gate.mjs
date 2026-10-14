#!/usr/bin/env node
/**
 * Workstream B release-gate runner (performance plan §5): paired
 * pre-PR-2-baseline vs current-build evidence for the allocation-free scalar
 * kernel, driven through the real application UI in both build arms.
 *
 * What makes this run different from run-stage-a.mjs / run-renderer-path.mjs:
 * the pre-PR-2 baseline build has no `?view=`/`?quality=`/`?perf=1` benchmark
 * parameters and no `__miRenderTrace` hook (those arrived with Stage A, after
 * PR 2). The runner therefore:
 *
 * - compares WHOLE BUILDS (`--dist baseline=<dir>,current=dist`), each served
 *   from its own checkout root by `vite preview` — never the dev server;
 * - reaches every frozen-corpus view through the real pointer UI on BOTH arms
 *   using region-select chains planned by tools/benchmark/view-chain.mjs (the
 *   planner replays the application's own viewport math and is unit-pinned by
 *   tests/unit/benchmark/view-chain.test.ts). The current arm additionally
 *   pins `?perf=1&classifierMode=legacy-scan&quality=<profile>`; the baseline
 *   arm switches `#render-quality` through the UI. No arm uses `?view=`, so
 *   both arms run the identical pointer-driven viewport pipeline and the
 *   achieved viewport is verified per sample;
 * - captures metrics through build-neutral instrumentation: an init script
 *   that observes Worker frame messages (`workerTiming.classifyMs` — the
 *   classifier wall both builds already report) plus the
 *   `mi:render-request` → `mi:stable-presented` performance marks (the wall
 *   metric, computed identically by both builds inside the same rAF callback).
 *   No application source is modified for measurement.
 *
 * Known confounds, documented in summary.md and respected by the verdict:
 * - Era mismatch: the baseline build predates the renderer-path bundle
 *   (MessageChannel yields, zero-copy transfer, packed output, center-out
 *   band order) and PR 4. The end-to-end column therefore mixes workstream B
 *   with later renderer-path improvements.
 * - The classifier column (`classifyMs`) is the stable-pass classification
 *   wall as each build's own frame timing defines it (identical definition:
 *   tiled job wall from dispatch to last band, yields subtracted), so pool
 *   parallelism and scheduling sit inside it. Single-threaded classifier
 *   evidence remains the Node pr2 microbench artifact.
 *
 * Labels are honest: an automation-bundled engine under xvfb (headed or
 * headless, as recorded) is directional evidence, not the release protocol of
 * plan §9 (branded stable browsers, declared target hardware).
 *
 * Usage:
 *   node tools/benchmark/run-b-gate.mjs [--engine chromium|firefox]
 *     --dist "baseline=<pre-pr2-worktree>/dist,current=dist"
 *     [--reps 11] [--cases <id,id,...>] [--out-dir <evidence/phase-2/...>]
 *     [--headed] [--max-steps 64]
 *
 * The baseline checkout is deliberately explicit: create a disposable
 * detached worktree at commit a6e1838, build it, pass its dist path here, and
 * remove the worktree after the run. A volatile session path must never be an
 * implicit dependency of the evidence runner.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { build, preview } from 'vite';
import { planRegionChain } from './view-chain.mjs';

const require = createRequire(import.meta.url);
const { chromium, firefox } = require('@playwright/test');

const repoRoot = path.resolve(import.meta.dirname, '../..');
const BASE_PORT = 4183;
const SHIPPING_RASTER_ID = 'shipping-1024x640';
const TARGET_RASTER = { width: 1024, height: 640 };
const NAVIGATION_TIMEOUT_MS = 10 * 60_000;
const SETTLE_MS = 40;

const log = (message) => {
  process.stderr.write(`[b-gate] ${message}\n`);
};

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
const headed = args.includes('--headed');
const maxSteps = Number(readOption('--max-steps') ?? 64);

const distOption = readOption('--dist');
if (distOption === undefined) {
  process.stderr.write(
    '--dist is required: baseline=<pre-pr2-worktree>/dist,current=dist\n' +
      'Create and build a detached baseline worktree at commit a6e1838 before running this gate.\n',
  );
  process.exit(2);
}
const dists = distOption.split(',').map((entry) => {
  const eq = entry.indexOf('=');
  const label = eq === -1 ? entry : entry.slice(0, eq);
  const dir = eq === -1 ? entry : entry.slice(eq + 1);
  return { label, dir: path.resolve(repoRoot, dir) };
});
if (dists.length !== 2) {
  process.stderr.write('--dist needs exactly two label=dir entries (baseline,current)\n');
  process.exit(2);
}
for (const dist of dists) {
  if (!existsSync(path.join(dist.dir, 'index.html'))) {
    process.stderr.write(`--dist ${dist.label}: no dist at ${dist.dir}\n`);
    process.exit(2);
  }
}
const baselineLabel = dists[0].label;
const currentLabel = dists[1].label;

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

// The pre-PR-2 baseline commit, resolved from the baseline checkout itself so
// the manifest records what actually produced the measured binary.
const gitRevParse = (cwd) => {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : 'unknown';
};
const baselineCommit = gitRevParse(path.dirname(dists[0].dir));
const currentCommit = gitRevParse(repoRoot);
const shortCommit = currentCommit.slice(0, 7);
const runDate = new Date().toISOString().slice(0, 10);
const defaultOutDir = path.join(repoRoot, 'evidence/phase-2', `${runDate}-b-gate-${shortCommit}`);
const outDir = path.resolve(readOption('--out-dir') ?? defaultOutDir);
mkdirSync(outDir, { recursive: true });

// ---------------------------------------------------------------------------
// One region-select chain per corpus case, planned once from the exact decimal
// strings (parsed to binary64 exactly once, as ?view= would).
// ---------------------------------------------------------------------------
const chainByCase = new Map(
  corpus.cases.map((caseInfo) => [
    caseInfo.id,
    planRegionChain({
      target: {
        re: Number(caseInfo.center.re),
        im: Number(caseInfo.center.im),
        spanY: Number(caseInfo.spanY),
      },
      size: { width: TARGET_RASTER.width, height: TARGET_RASTER.height },
      maxSteps,
    }),
  ]),
);

// ---------------------------------------------------------------------------
// Stats helpers (aggregates are derived views; every sample is stored raw).
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
const formatMs = (value) =>
  value === undefined || value === null ? '—' : `${Number(value).toFixed(1)} ms`;

// ---------------------------------------------------------------------------
// In-page capture. Browser globals are reached through globalThis because this
// module also runs in Node; Playwright serializes these functions into the
// page. Hash byte order (documented): row-major RGBA from getImageData —
// bytes walk rows from the top-left pixel, four bytes (R, G, B, A) per pixel.
// ---------------------------------------------------------------------------

/**
 * Observability shim shared by BOTH build arms: the pre-PR-2 build exposes no
 * trace hook, so the runner observes Worker frame messages (both builds
 * deliver FrameMessage with workerTiming through Worker.addEventListener on
 * the main thread) via a prototype wrapper, without touching any application
 * source. The wrapper also makes setPointerCapture non-throwing for the
 * synthetic pointer ids the runner dispatches (real mouse pointers keep
 * working; the app's viewport math never depends on capture succeeding).
 * Failure isolation: neither wrapper can throw into the application.
 */
const initScript = `
(() => {
  const state = { frames: [], errors: [], pointerCaptureFailures: 0 };
  globalThis.__miBGate = state;
  const originalSetPointerCapture = Element.prototype.setPointerCapture;
  Element.prototype.setPointerCapture = function (pointerId) {
    try {
      return originalSetPointerCapture.call(this, pointerId);
    } catch {
      state.pointerCaptureFailures += 1;
      return undefined;
    }
  };
  const originalAddEventListener = Worker.prototype.addEventListener;
  Worker.prototype.addEventListener = function (type, listener, options) {
    if (type === 'message') {
      const wrapped = (event) => {
        try {
          const data = event && event.data;
          if (data && data.type === 'frame') {
            const timing = data.workerTiming;
            state.frames.push({
              requestId: data.requestId,
              stage: data.stage,
              width: data.width,
              height: data.height,
              classifyMs: timing && timing.classifyMs !== undefined ? timing.classifyMs : null,
              colorizeMs: timing && timing.colorizeMs !== undefined ? timing.colorizeMs : null,
              yieldWaitMs: timing && timing.yieldWaitMs !== undefined ? timing.yieldWaitMs : null,
              yieldCount: timing && timing.yieldCount !== undefined ? timing.yieldCount : null,
            });
          }
        } catch (error) {
          state.errors.push(String(error));
        }
        return listener.call(this, event);
      };
      return originalAddEventListener.call(this, type, wrapped, options);
    }
    return originalAddEventListener.call(this, type, listener, options);
  };
})();
`;

const stableReady = () => {
  const shell = globalThis.document.querySelector('#explorer');
  if (!shell || shell.dataset['renderStage'] !== 'stable') return false;
  const frames = (globalThis.__miBGate && globalThis.__miBGate.frames) || [];
  const requestId = shell.dataset['renderRequestId'];
  return frames.some(
    (frame) => String(frame.requestId) === String(requestId) && frame.stage === 'stable',
  );
};

/**
 * In-page state capture. Everything referenced here must live inside the
 * function body: Playwright serializes the function source alone into the
 * page, so module-level helpers are unreachable from page.evaluate.
 */
const capturePageState = async (arm) => {
  const bGate = globalThis.__miBGate || { frames: [], errors: [] };

  // Inner helpers keep this page-evaluated function self-contained while each
  // staying under the complexity limit.
  const hashCanvas = async () => {
    const canvas = globalThis.document.querySelector('canvas.explorer__canvas');
    if (!(canvas instanceof globalThis.HTMLCanvasElement)) {
      throw new Error('render canvas not found');
    }
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('2D context unavailable for hashing');
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    // Both target engines provide WebCrypto; a missing subtle would fail the
    // run loudly rather than fall back to a weaker proxy hash.
    const digest = await globalThis.crypto.subtle.digest('SHA-256', image.data);
    return {
      algorithm: 'sha-256',
      hash: [...new globalThis.Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join(''),
      width: canvas.width,
      height: canvas.height,
    };
  };
  const markWallOf = () => {
    const marks = globalThis.performance.getEntriesByType('mark');
    const presented = marks.filter((mark) => mark.name === 'mi:stable-presented').pop();
    if (!presented) return { markWallMs: null, frameRequestId: null };
    const requestId = presented.detail ? presented.detail.requestId : null;
    const requested = marks.find(
      (mark) =>
        mark.name === 'mi:render-request' && mark.detail && mark.detail.requestId === requestId,
    );
    return {
      markWallMs: requested ? presented.startTime - requested.startTime : null,
      frameRequestId: requestId,
    };
  };
  const traceObservationOf = () => {
    const hook = globalThis.__miRenderTrace;
    if (!hook) throw new Error('window.__miRenderTrace missing — did ?perf=1 apply?');
    const completed = hook
      .snapshot()
      .filter(
        (trace) =>
          trace.outcome === 'completed' &&
          trace.frames.some((frame) => frame.stage === 'stable' && frame.source === 'computed'),
      );
    const trace = completed[completed.length - 1];
    const stableFrame =
      trace === undefined
        ? undefined
        : trace.frames.find((frame) => frame.stage === 'stable' && frame.source === 'computed');
    return {
      achievedViewport: hook.viewport(),
      trace: {
        requestToPresentMs: stableFrame ? stableFrame.requestToPresentMs : null,
        viewKeyHash: trace ? trace.viewKeyHash : null,
        profile: trace ? trace.profile : null,
        workerCount: trace ? trace.workerCount : null,
        backend: trace ? trace.backend : null,
        bandsElapsedMs:
          stableFrame && stableFrame.bandsElapsedMs ? [...stableFrame.bandsElapsedMs] : null,
        colorizeMs:
          stableFrame && stableFrame.colorizeMs !== undefined ? stableFrame.colorizeMs : null,
        mergeCpuMs:
          stableFrame && stableFrame.mergeCpuMs !== undefined ? stableFrame.mergeCpuMs : null,
        yieldWaitMs:
          stableFrame && stableFrame.yieldWaitMs !== undefined ? stableFrame.yieldWaitMs : null,
        yieldCount:
          stableFrame && stableFrame.yieldCount !== undefined ? stableFrame.yieldCount : null,
      },
    };
  };

  const bGateState = bGate ?? { frames: [], errors: [] };
  const explorer = globalThis.document.querySelector('#explorer');
  const state = {
    ...markWallOf(),
    renderStage: explorer ? explorer.dataset['renderStage'] : null,
    renderRequestId: explorer ? explorer.dataset['renderRequestId'] : null,
    frames: bGateState.frames,
    snoopErrors: [...bGateState.errors],
    pointerCaptureFailures: bGateState.pointerCaptureFailures ?? 0,
    canvasHash: await hashCanvas(),
    readout: {
      center: (globalThis.document.querySelector('.coordinates__center') || {}).textContent ?? null,
      magnification:
        (globalThis.document.querySelector('.coordinates__magnification') || {}).textContent ??
        null,
    },
    devicePixelRatio: globalThis.devicePixelRatio,
  };
  if (arm === 'current') {
    Object.assign(state, traceObservationOf());
  }
  return state;
};

/**
 * Achieved viewport readback. Current arm: the exact `__miRenderTrace.viewport()`
 * hook (validates the whole pointer chain end-to-end). Baseline arm: the
 * coordinate readout — 9 significant digits of the center plus the
 * magnification output — a sanity check against chain disasters, not a
 * bit-level verification.
 */
const readAchievedViewport = (page, arm) =>
  page.evaluate((armValue) => {
    if (armValue === 'current') {
      return globalThis.__miRenderTrace.viewport();
    }
    const centerText =
      (globalThis.document.querySelector('.coordinates__center') || {}).textContent ?? '';
    const magText =
      (globalThis.document.querySelector('.coordinates__magnification') || {}).textContent ?? '';
    const match = /center\s+(-?[0-9.eE+]+)\s+([−+])\s+([0-9.eE+−]+)i/.exec(centerText);
    const magnitude = Number(magText.replace('×', '').replace('−', 'e-'));
    return {
      center: match
        ? {
            re: Number(match[1]),
            im:
              match[2] === '−'
                ? -Number(match[3].replace('−', '-'))
                : Number(match[3].replace('−', '-')),
          }
        : null,
      spanY: Number.isFinite(magnitude) && magnitude > 0 ? 2.5 / magnitude : null,
      raw: { centerText, magText },
    };
  }, arm);

const checkAchievedViewport = (expected, achieved, arm) => {
  if (!achieved || !achieved.center) {
    return { ok: false, reason: 'achieved viewport unavailable from the UI' };
  }
  const achievedSpan = achieved.spanY ?? expected.spanY;
  // Current arm: exact hook readback — tolerance absorbs binary64 chain noise.
  // Baseline arm: the readout rounds the center to 9 significant digits and
  // the magnification to 2-3 significant digits, so 5% span / display-precision
  // center tolerances catch chain disasters without false positives.
  const centerTolerance =
    arm === 'current' ? expected.spanY * 1e-6 : Math.max(expected.spanY * 0.05, 2e-9);
  const spanTolerance = arm === 'current' ? 1e-6 : 0.05;
  const dRe = Math.abs(achieved.center.re - expected.center.re);
  const dIm = Math.abs(achieved.center.im - expected.center.im);
  const dSpan = Math.abs(achievedSpan - expected.spanY) / expected.spanY;
  return {
    ok: dRe <= centerTolerance && dIm <= centerTolerance && dSpan <= spanTolerance,
    reason:
      `dRe=${dRe.toExponential(2)} dIm=${dIm.toExponential(2)} dSpan=${dSpan.toExponential(2)} ` +
      `(tolerances ${centerTolerance.toExponential(2)}, ${spanTolerance})`,
  };
};

// ---------------------------------------------------------------------------
// Build once per dist (current), serve each dist from its own root.
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
    // A prebuilt dist from the baseline worktree: serve it from that
    // checkout's own root (vite preview resolves outDir inside its root).
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

const launcher = engine === 'chromium' ? chromium : firefox;
const playwrightVersion = require('@playwright/test/package.json').version;
const browser = await launcher.launch({ headless: !headed });
log(
  `${engine} ${browser.version()} launched (${headed ? 'headed under xvfb' : 'headless'}, automation-bundled)`,
);

let viewportSize = { width: 1600, height: 900 };
const newContext = () => browser.newContext({ viewport: viewportSize, deviceScaleFactor: 1 });

const waitForStable = (page) =>
  page.waitForFunction(stableReady, undefined, {
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

// Calibrate once against the current build so the canvas stack is exactly the
// shipping 1024x640 raster (src/styles.css and index.html are identical in
// both builds; the per-sample raster guard re-verifies each arm).
const calibrateViewport = async () => {
  const context = await newContext();
  await context.addInitScript(initScript);
  const page = await context.newPage();
  await page.goto(`${baseUrls[currentLabel]}/?perf=1`, { timeout: NAVIGATION_TIMEOUT_MS });
  await waitForStable(page);
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

viewportSize = await calibrateViewport();
log(
  `calibrated viewport ${viewportSize.width}x${viewportSize.height} → ` +
    `${TARGET_RASTER.width}x${TARGET_RASTER.height} raster`,
);

/**
 * Dispatches one synthetic pointer gesture (down → intermediate moves → up)
 * directly on the render canvas. pointerId 1 matches the session the app
 * opened on pointerdown; the app's handlers read clientX/clientY and the live
 * stack rect, never event.isTrusted.
 */
const dispatchGesture = (page, points) =>
  page.evaluate((points) => {
    const canvas = globalThis.document.querySelector('canvas.explorer__canvas');
    if (!canvas) throw new Error('render canvas not found for gesture dispatch');
    const fire = (type, x, y, buttons, button) => {
      canvas.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          pointerId: 1,
          pointerType: 'mouse',
          isPrimary: true,
          button,
          buttons,
          clientX: x,
          clientY: y,
        }),
      );
    };
    const [first, ...rest] = points;
    fire('pointerdown', first[0], first[1], 1, 0);
    for (const point of rest) {
      fire('pointermove', point[0], point[1], 1, -1);
    }
    const last = rest[rest.length - 1];
    fire('pointerup', last[0], last[1], 0, -1);
  }, points);

/**
 * Drives one planned pointer chain through the real UI. Region steps need the
 * 'Zoom area' tool; pan steps need the 'Pan' tool. Gestures are synthetic
 * PointerEvents dispatched directly on the canvas element: at the calibrated
 * viewport, overlapping control overlays (and the stack extending below the
 * fold) make real pointerdown hit-targets unreliable, and events dispatched on
 * the element reach the app's handlers regardless of overlays. The
 * application's session/viewport path (startPointerSession → panViewport /
 * zoomViewportToRect → scheduleRender) is unchanged; setPointerCapture
 * failures for synthetic pointer ids are tolerated by the init-script wrapper.
 * The stack is still scrolled into view so the rendered page state matches
 * real use. Coordinates map raster pixels through the live stack rect — the
 * same mapping as the app's canvasPoint.
 */
const driveChain = async (page, steps) => {
  const stack = page.locator('.explorer__stack');
  const scrollStackIntoView = () =>
    stack.evaluate((element) => {
      element.scrollIntoView({ block: 'center', inline: 'center' });
    });
  await scrollStackIntoView();
  await page.waitForTimeout(SETTLE_MS);
  // The client-coordinate mapping must use the app's own getBoundingClientRect
  // (the same values canvasPoint reads) — Playwright's boundingBox returns
  // quad coordinates with slightly different precision, which skews the
  // fractions enough to matter at deep-zoom spans.
  const boxOf = async () => {
    const box = await stack.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
    });
    return box;
  };
  let mode = 'pan';
  for (const step of steps) {
    const wantedMode = step.kind === 'pan' ? 'pan' : 'region';
    if (mode !== wantedMode) {
      await page.getByRole('button', { name: wantedMode === 'pan' ? 'Pan' : 'Zoom area' }).click();
      mode = wantedMode;
    }
    // Re-scroll before every gesture: Playwright's tool-button click and the
    // app's own feedback text can both shift the scroll position, and the
    // client-coordinate mapping must match the live stack rect the app reads.
    await scrollStackIntoView();
    const box = await boxOf();
    const clientX = (rasterX) => box.x + (rasterX / TARGET_RASTER.width) * box.width;
    const clientY = (rasterY) => box.y + (rasterY / TARGET_RASTER.height) * box.height;
    const startX =
      step.kind === 'pan'
        ? clientX(TARGET_RASTER.width / 2)
        : clientX(Math.min(step.rect.x1, step.rect.x2));
    const startY =
      step.kind === 'pan'
        ? clientY(TARGET_RASTER.height / 2)
        : clientY(Math.min(step.rect.y1, step.rect.y2));
    const endX =
      step.kind === 'pan'
        ? clientX(TARGET_RASTER.width / 2 + step.deltaPx.dx)
        : clientX(step.rect.x2);
    const endY =
      step.kind === 'pan'
        ? clientY(TARGET_RASTER.height / 2 + step.deltaPx.dy)
        : clientY(Math.max(step.rect.y1, step.rect.y2));
    await dispatchGesture(page, [
      [startX, startY],
      [(startX + endX) / 2, (startY + endY) / 2],
      [endX, endY],
    ]);
    await page.waitForTimeout(SETTLE_MS);
  }
};

/** Asserts the raster guard and assembles the raw sample record. */
const assembleSample = (spec, state, achievedViewport, viewCheck, seq) => {
  const stableFrame = state.frames
    .filter(
      (frame) =>
        frame.stage === 'stable' && String(frame.requestId) === String(state.renderRequestId),
    )
    .pop();
  const coarseFrame = state.frames.filter((frame) => frame.stage === 'coarse').pop();
  const trace = spec.arm === 'current' ? (state.trace ?? null) : null;
  return {
    seq,
    engine,
    arm: spec.arm,
    dist: spec.dist,
    caseId: spec.caseId,
    caseClass: spec.caseClass,
    designation: spec.designation,
    corpusProfile: spec.corpusProfile,
    profileId: spec.profileId,
    repetition: spec.repetition,
    armOrder: spec.armOrder,
    climate: spec.climate,
    chain: {
      stepCount: spec.steps.length,
      kinds: spec.steps.map((step) => step.kind),
      rects: spec.steps.filter((step) => step.kind === 'region').map((step) => step.rect),
      pans: spec.steps.filter((step) => step.kind === 'pan').map((step) => step.deltaPx),
    },
    expectedFinalViewport: spec.expectedFinalViewport,
    achievedViewport,
    viewCheck,
    markWallMs: state.markWallMs,
    traceRequestToPresentMs: trace ? trace.requestToPresentMs : null,
    stableClassifyMs: stableFrame ? stableFrame.classifyMs : null,
    coarseClassifyMs: coarseFrame ? coarseFrame.classifyMs : null,
    colorizeMs: stableFrame ? stableFrame.colorizeMs : null,
    yieldWaitMs: stableFrame ? stableFrame.yieldWaitMs : null,
    yieldCount: stableFrame ? stableFrame.yieldCount : null,
    bandsElapsedMs: trace ? trace.bandsElapsedMs : null,
    viewKeyHash: trace ? trace.viewKeyHash : null,
    workerCount: trace ? trace.workerCount : null,
    backend: trace ? trace.backend : null,
    raster: { width: state.canvasHash.width, height: state.canvasHash.height },
    devicePixelRatio: state.devicePixelRatio,
    readout: state.readout,
    snoopErrors: state.snoopErrors,
    pointerCaptureFailures: state.pointerCaptureFailures,
    frames: state.frames,
    canvasHash: state.canvasHash,
  };
};

let sampleSeq = 0;
const measureOnce = async (page, spec) => {
  const url =
    spec.arm === 'current'
      ? `${baseUrls[spec.dist]}/?perf=1&classifierMode=legacy-scan&quality=${spec.profileId}`
      : `${baseUrls[spec.dist]}/`;
  await page.goto(url, { timeout: NAVIGATION_TIMEOUT_MS });
  await page.waitForSelector('#explorer', { timeout: NAVIGATION_TIMEOUT_MS });
  if (spec.arm === 'baseline') {
    await page.waitForSelector('#render-quality', { timeout: 60_000 });
    await page.selectOption('#render-quality', spec.profileId);
  }
  await driveChain(page, spec.steps);
  await waitForStable(page);
  await page.waitForTimeout(SETTLE_MS);
  const state = await page.evaluate(capturePageState, spec.arm);
  if (
    state.canvasHash.width !== TARGET_RASTER.width ||
    state.canvasHash.height !== TARGET_RASTER.height
  ) {
    throw new Error(
      `${spec.caseId}/${spec.arm}: raster is ${state.canvasHash.width}x${state.canvasHash.height}, ` +
        `expected ${TARGET_RASTER.width}x${TARGET_RASTER.height}`,
    );
  }
  const achievedViewport = await readAchievedViewport(page, spec.arm);
  const viewCheck = checkAchievedViewport(spec.expectedFinalViewport, achievedViewport, spec.arm);
  if (!viewCheck.ok && spec.arm === 'current') {
    throw new Error(
      `${spec.caseId}/current: chain landed on the wrong view (${viewCheck.reason}; expected ` +
        `${JSON.stringify(spec.expectedFinalViewport)}, achieved ${JSON.stringify(achievedViewport)})`,
    );
  }
  sampleSeq += 1;
  return assembleSample(spec, state, achievedViewport, viewCheck, sampleSeq);
};

const userAgent = await (async () => {
  const context = await newContext();
  const page = await context.newPage();
  const value = await page.evaluate(() => globalThis.navigator.userAgent);
  await context.close();
  return value;
})();

/**
 * Measures one (case, repetition, arm) cell. Cold repetitions open a fresh
 * context per arm; warm repetitions share one context and page across arms.
 */
const runArmSample = async (caseInfo, spec, repetition, order, dist, cold, warmPage) => {
  const arm = dist === baselineLabel ? 'baseline' : 'current';
  let contextHandle;
  let page;
  if (cold) {
    contextHandle = await newContext();
    await contextHandle.addInitScript(initScript);
    page = await contextHandle.newPage();
  } else {
    contextHandle = undefined;
    page = warmPage;
  }
  try {
    const sample = await measureOnce(page, {
      ...spec,
      dist,
      arm,
      repetition,
      armOrder: order.map((entry) => (entry === baselineLabel ? 'baseline' : 'current')).join('|'),
      climate: cold ? 'cold' : 'warm',
    });
    allSamples.push(sample);
    log(
      `${caseInfo.id} rep ${repetition} ${arm} (${sample.climate}): wall ` +
        `${sample.markWallMs === null ? '—' : sample.markWallMs.toFixed(0)} ms, classify ` +
        `${sample.stableClassifyMs === null ? '—' : sample.stableClassifyMs.toFixed(0)} ms` +
        (sample.viewCheck.ok ? '' : ` [VIEW CHECK: ${sample.viewCheck.reason}]`),
    );
  } finally {
    if (contextHandle !== undefined) await contextHandle.close();
  }
};

// ---------------------------------------------------------------------------
// The paired pass: per corpus case × repetition, both build arms run
// adjacently with alternating order; repetition 0 is cold (fresh context per
// arm), repetitions 1+ re-navigate one persistent page (warm).
// ---------------------------------------------------------------------------
log(`running ${selectedCases.length} cases × 2 build arms × ${reps} paired repetitions…`);
const allSamples = [];
for (const caseInfo of selectedCases) {
  const chain = chainByCase.get(caseInfo.id);
  const spec = {
    caseId: caseInfo.id,
    caseClass: caseInfo.class,
    designation: caseInfo.designation,
    corpusProfile: caseInfo.profile,
    profileId: caseInfo.profile.toLowerCase(),
    steps: chain.steps,
    expectedFinalViewport: chain.finalViewport,
  };
  for (let repetition = 0; repetition < reps; repetition += 1) {
    const order =
      repetition % 2 === 0 ? [baselineLabel, currentLabel] : [currentLabel, baselineLabel];
    const cold = repetition === 0;
    let warmContext;
    let warmPage;
    if (!cold) {
      warmContext = await newContext();
      await warmContext.addInitScript(initScript);
      warmPage = await warmContext.newPage();
    }
    try {
      for (const dist of order) {
        await runArmSample(caseInfo, spec, repetition, order, dist, cold, warmPage);
      }
    } finally {
      if (warmContext !== undefined) await warmContext.close();
    }
  }
}
log(`collected ${allSamples.length} samples`);

// ---------------------------------------------------------------------------
// Packaging (evidence/phase-2/README.md contract). Manifest emitted last.
// ---------------------------------------------------------------------------
spawnSync(
  'node',
  [
    path.join(repoRoot, 'tools/benchmark/capture-environment.mjs'),
    '--out',
    path.join(outDir, 'environment.json'),
    '--note',
    `Workstream B gate: paired pre-PR-2 vs current production build (${engine}); vite build + vite preview, UI-driven region-select chains.`,
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
    headed,
    powerMode: null,
    devicePixelRatio: 1,
    viewport: viewportSize,
    display: headed ? 'xvfb-run virtual display (headed)' : 'headless',
    automation: `Playwright ${playwrightVersion} automation-bundled ${engine}, ${headed ? 'headed under xvfb' : 'headless'}`,
    label:
      'automation-bundled engine — directional only, not release evidence per plan §9 (branded stable browsers, declared target hardware)',
    workerCount: [...new Set(allSamples.map((sample) => sample.workerCount).filter(Boolean))].sort(
      (a, b) => a - b,
    ),
    backend: 'cpu',
    samples: allSamples.length,
  },
};
environment.render = {
  workerCount: allSamples.find((sample) => sample.workerCount)?.workerCount ?? null,
  backend: 'cpu',
};
environment.comparison = {
  arms: {
    [baselineLabel]: {
      role: 'baseline (pre-PR-2 build)',
      commit: baselineCommit,
      distDir: dists[0].dir,
      classifierMode: 'legacy-scan (the only mode the pre-PR-2 build has)',
      viewDriving:
        'real pointer UI: region-select chains + pan drags (tools/benchmark/view-chain.mjs)',
      profileSelection: 'select#render-quality',
    },
    [currentLabel]: {
      role: 'candidate (current build; contains PR 2 + PR 4 default-legacy + renderer-path bundle)',
      commit: currentCommit,
      distDir: dists[1].dir,
      classifierMode: 'legacy-scan (pinned via ?classifierMode=legacy-scan to isolate B from C)',
      viewDriving: 'real pointer UI: identical chains (no ?view=, matching the baseline arm)',
      profileSelection: '?quality= query parameter',
    },
  },
  baselineBuild: {
    commit: baselineCommit,
    note: 'built with vite build at the pre-PR-2 commit; measurement fixture only, not committed',
  },
  protocol: {
    buildMode: 'vite build (production bundle) served by vite preview; dev server never used',
    repetitions: reps,
    pairing:
      'per repetition both build arms run adjacently; baseline/candidate order alternates per repetition',
    coldWarm:
      'repetition 0 runs each arm in a fresh browser context (cold; the browser process is shared and the per-context HTTP cache is empty); repetitions 1+ re-navigate one persistent page (warm)',
    raster: SHIPPING_RASTER_ID,
    wallMetric:
      'markWallMs: performance.mark(mi:render-request) -> performance.mark(mi:stable-presented) delta paired by requestId — both builds emit these marks inside the same rAF callback where requestToPresentMs is computed; identical definition in both builds. The current arm also records the trace requestToPresentMs for continuity with Stage A.',
    classifierMetric:
      'stable-frame classifyMs observed from Worker frame messages (workerTiming.classifyMs): the stable-pass classification wall as each build defines it (tiled job wall from dispatch to last band, yields subtracted). Parallelism/scheduling sit inside this column; single-threaded classifier evidence remains poc/performance/results/pr2/pr2-microbench.json.',
    viewDriving:
      'planned region-select chains (plus a pan step where the target center is unreachable by region selection alone); expectations replay the application viewport math and are unit-tested against src/domain/viewport.ts; achieved viewport verified per sample (exact hook readback on the current arm, 9-digit coordinate readout on the baseline arm)',
    hashByteOrder:
      'SHA-256 over row-major RGBA bytes from getImageData(0, 0, width, height) of canvas.explorer__canvas',
    engineLabels:
      'chromium/firefox here are Playwright automation builds; branded stable browsers on declared target hardware remain the release protocol',
    outOfScope:
      'cancellation interactions, cache/replay/recolor distributions, and catalog shard states are out of scope',
  },
};
environment.notes.push(
  `Workstream B gate run (${engine}): baseline dist from commit ${baselineCommit} (worktree fixture), candidate from ${currentCommit}.`,
);
writeFileSync(environmentPath, `${JSON.stringify(environment, null, 2)}\n`);

const rawPath = path.join(outDir, 'raw-observations.json');
const existingRaw = existsSync(rawPath) ? JSON.parse(readFileSync(rawPath, 'utf8')) : undefined;
const engineKey = `${engine}${headed ? '-headed-xvfb' : '-headless'}`;
const runsByEngine = {
  ...(existingRaw?.runsByEngine ?? {}),
  [engineKey]: {
    schemaVersion: 1,
    description:
      'Every workstream B gate sample, raw and timestamp-free. Aggregates in summary.md are derived views only.',
    corpus: {
      file: 'tools/benchmark/corpus.v1.json',
      schemaVersion: corpus.schemaVersion,
      sha256: corpusSha256,
    },
    raster: shippingRaster,
    repetitions: reps,
    engineLabel: engineKey,
    arms: {
      [baselineLabel]: { role: 'pre-PR-2 build', commit: baselineCommit },
      [currentLabel]: { role: 'current build', commit: currentCommit },
    },
    chains: Object.fromEntries(
      [...chainByCase.entries()].map(([caseId, chain]) => [
        caseId,
        {
          stepCount: chain.steps.length,
          steps: chain.steps,
          finalViewport: chain.finalViewport,
        },
      ]),
    ),
    samples: allSamples,
  },
};
const rawObservations = {
  schemaVersion: 1,
  description:
    'Every workstream B gate sample, raw and timestamp-free. Aggregates in summary.md are derived views only.',
  runsByEngine,
};
writeFileSync(rawPath, `${JSON.stringify(rawObservations, null, 2)}\n`);

// Semantic comparison: per case × repetition, hash equality between the two
// build arms (both pinned to legacy-scan semantics). PR 3 (common verifier)
// and PR 5 (period policy display) landed between the arms, so mismatches are
// enumerated findings with the era-mismatch confound, not failures.
const comparisons = [];
for (const caseInfo of selectedCases) {
  for (let repetition = 0; repetition < reps; repetition += 1) {
    const perArm = ['baseline', 'current'].map((arm) => {
      const sample = allSamples.find(
        (candidate) =>
          candidate.caseId === caseInfo.id &&
          candidate.repetition === repetition &&
          candidate.arm === arm,
      );
      return { arm, hash: sample ? sample.canvasHash.hash : null };
    });
    comparisons.push({
      caseId: caseInfo.id,
      repetition,
      climate: allSamples.find(
        (candidate) => candidate.caseId === caseInfo.id && candidate.repetition === repetition,
      )?.climate,
      arms: perArm,
      equal:
        perArm.length >= 2 &&
        perArm.every((entry) => entry.hash !== null && entry.hash === perArm[0].hash),
    });
  }
}
const comparisonPath = path.join(outDir, 'semantic-comparison.json');
const existingComparison = existsSync(comparisonPath)
  ? JSON.parse(readFileSync(comparisonPath, 'utf8'))
  : undefined;
const semanticComparison = {
  schemaVersion: 1,
  method: {
    algorithm: allSamples[0] === undefined ? undefined : allSamples[0].canvasHash.algorithm,
    byteOrder:
      'row-major RGBA, 4 bytes per pixel, read via getImageData(0, 0, width, height) from canvas.explorer__canvas after the computed stable frame is presented',
    scope:
      'palette-inclusive proxy over the final RGBA raster, cross-build: the baseline arm predates the PR 3 verifier unification and the PR 5 period-policy display buckets, so hash inequality is an expected finding on interior/boundary-heavy views and is enumerated, never treated as a B-gate failure (the B parity record is the pr2 microbench full-raster parity gate)',
  },
  comparisonsByEngine: {
    ...(existingComparison?.comparisonsByEngine ?? {}),
    [engineKey]: comparisons,
  },
};
writeFileSync(comparisonPath, `${JSON.stringify(semanticComparison, null, 2)}\n`);

// ---------------------------------------------------------------------------
// Summary: warm paired medians per case for both arms, both metrics (wall and
// classifier), improvement percentages, and the plan §9 cap max(5%, 20 ms)
// applied in the regression direction (with the improvement direction
// recorded as the gate signal).
// ---------------------------------------------------------------------------
const summarize = () =>
  selectedCases.map((caseInfo) => {
    const warm = allSamples.filter(
      (sample) => sample.caseId === caseInfo.id && sample.climate === 'warm',
    );
    const row = {
      caseId: caseInfo.id,
      designation: caseInfo.designation,
      corpusProfile: caseInfo.profile,
    };
    for (const [arm, label] of [
      ['baseline', 'baseline'],
      ['current', 'current'],
    ]) {
      const samples = warm.filter((sample) => sample.arm === arm);
      row[`${label}WallMedianMs`] = median(samples.map((sample) => sample.markWallMs));
      row[`${label}WallMadMs`] = mad(samples.map((sample) => sample.markWallMs));
      row[`${label}ClassifyMedianMs`] = median(
        samples.map((sample) => sample.stableClassifyMs).filter((value) => value !== null),
      );
      row[`${label}ClassifyMadMs`] = mad(
        samples.map((sample) => sample.stableClassifyMs).filter((value) => value !== null),
      );
      row[`${label}WarmReps`] = samples.length;
    }
    row.wallDeltaMs =
      row.currentWallMedianMs === undefined || row.baselineWallMedianMs === undefined
        ? undefined
        : row.currentWallMedianMs - row.baselineWallMedianMs;
    row.wallImprovementPct =
      row.baselineWallMedianMs === undefined || row.currentWallMedianMs === undefined
        ? undefined
        : ((row.baselineWallMedianMs - row.currentWallMedianMs) / row.baselineWallMedianMs) * 100;
    row.wallRegressionFlag =
      row.wallDeltaMs === undefined || row.baselineWallMedianMs === undefined
        ? undefined
        : row.wallDeltaMs > Math.max(0.05 * row.baselineWallMedianMs, 20);
    row.classifyDeltaMs =
      row.currentClassifyMedianMs === undefined || row.baselineClassifyMedianMs === undefined
        ? undefined
        : row.currentClassifyMedianMs - row.baselineClassifyMedianMs;
    row.classifyImprovementPct =
      row.baselineClassifyMedianMs === undefined || row.currentClassifyMedianMs === undefined
        ? undefined
        : ((row.baselineClassifyMedianMs - row.currentClassifyMedianMs) /
            row.baselineClassifyMedianMs) *
          100;
    row.classifyRegressionFlag =
      row.classifyDeltaMs === undefined || row.baselineClassifyMedianMs === undefined
        ? undefined
        : row.classifyDeltaMs > Math.max(0.05 * row.baselineClassifyMedianMs, 20);
    return row;
  });

const summaryLines = [];
summaryLines.push(`# Workstream B release gate — ${runDate} @ ${shortCommit}`);
summaryLines.push('');
summaryLines.push(
  'Paired **whole-build** comparison: the pre-PR-2 baseline build (commit `' +
    baselineCommit +
    '`, built with `vite build` in a temporary worktree fixture) vs the current build ' +
    '(`' +
    shortCommit +
    '`), both pinned to the legacy-scan classifier, driven through the real ' +
    'application UI by `tools/benchmark/run-b-gate.mjs` with region-select chains planned by ' +
    '`tools/benchmark/view-chain.mjs` (unit-pinned against the application viewport math). ' +
    'Medians are **warm** samples (reps ' +
    `${reps - 1} pairs per case; cold rep 0 is stored raw and excluded).`,
);
summaryLines.push('');
summaryLines.push(
  `**Label (${engine}):** Playwright ${playwrightVersion} automation-bundled ${engine} ` +
    `${browser.version()}, ${headed ? 'headed under xvfb-run' : 'headless'} — directional only, ` +
    'not release evidence per plan §9.',
);
summaryLines.push('');
summaryLines.push('## Headline (paired warm medians) — end-to-end wall');
summaryLines.push('');
summaryLines.push(
  'Wall metric: `mi:render-request` → `mi:stable-presented` mark delta (both builds emit these marks ' +
    'identically inside the present rAF; equals the trace `requestToPresentMs` definition). ' +
    'Cap: plan §9 `max(5%, 20 ms)` regression rule, applied in the regression direction.',
);
summaryLines.push('');
summaryLines.push(
  '| Case | Designation | baseline wall median (MAD) | current wall median (MAD) | Δ (cur−base) | improvement | regression flag |',
);
summaryLines.push('| --- | --- | --- | --- | --- | --- | --- |');
for (const row of summarize()) {
  summaryLines.push(
    `| ${row.caseId} | ${row.designation} | ${formatMs(row.baselineWallMedianMs)} (${formatMs(row.baselineWallMadMs)}) | ${formatMs(row.currentWallMedianMs)} (${formatMs(row.currentWallMadMs)}) | ${row.wallDeltaMs === undefined ? '—' : `${row.wallDeltaMs.toFixed(1)} ms`} | ${row.wallImprovementPct === undefined ? '—' : `${row.wallImprovementPct.toFixed(1)}%`} | ${row.wallRegressionFlag === undefined ? '—' : row.wallRegressionFlag ? '**flagged**' : 'no'} |`,
  );
}
summaryLines.push('');
summaryLines.push('## Classifier column (stable-frame `classifyMs`, warm paired medians)');
summaryLines.push('');
summaryLines.push(
  'Observed from Worker frame messages on both builds without touching any application source: ' +
    'the stable-pass classification wall as each build defines it (tiled job wall from dispatch to ' +
    'last band, yields subtracted). Pool parallelism and scheduling sit inside this number; the ' +
    'single-threaded classifier comparison remains the pr2 Node microbench ' +
    '(`poc/performance/results/pr2/pr2-microbench.json`).',
);
summaryLines.push('');
summaryLines.push(
  '| Case | baseline classify median (MAD) | current classify median (MAD) | Δ (cur−base) | classify improvement |',
);
summaryLines.push('| --- | --- | --- | --- | --- |');
for (const row of summarize()) {
  summaryLines.push(
    `| ${row.caseId} | ${formatMs(row.baselineClassifyMedianMs)} (${formatMs(row.baselineClassifyMadMs)}) | ${formatMs(row.currentClassifyMedianMs)} (${formatMs(row.currentClassifyMadMs)}) | ${row.classifyDeltaMs === undefined ? '—' : `${row.classifyDeltaMs.toFixed(1)} ms`} | ${row.classifyImprovementPct === undefined ? '—' : `${row.classifyImprovementPct.toFixed(1)}%`} |`,
  );
}
summaryLines.push('');
summaryLines.push('## Confounds (read before quoting any number above)');
summaryLines.push('');
for (const note of [
  "**Era mismatch (documented, not removable here):** the baseline build predates the renderer-path bundle (MessageChannel yields, zero-copy transfer, packed output, center-out band order) and PR 4. The end-to-end wall column therefore measures PR 2 **plus** every later renderer-path improvement — it is an upper bound on B's end-to-end contribution, not an isolation of it.",
  "**Classifier column semantics:** `classifyMs` is each build's own stable-pass classification wall (tiled job wall from dispatch to last band, yields subtracted). Both builds use the same 4-worker pool shape, but scheduling/transfer improvements sit inside the current arm's number, so this column is directional corroboration, not a single-threaded kernel measurement. The single-threaded classifier evidence remains `poc/performance/results/pr2/pr2-microbench.json` (hard anchor −0.3%, full-set −5.0%: no ≥10% classifier win in Node).",
  '**View driving:** both arms reach corpus views through the same synthetic pointer chains (region-select + pan over the real UI). The planner replicates the application viewport math exactly (unit-pinned) and every sample records the achieved viewport (exact hook readback on the current arm; 9-digit readout + magnification on the baseline arm). Chain landing precision is binary64-level on the current arm; the baseline readout verifies to display precision.',
  '**No `?view=` on the baseline:** the pre-PR-2 build has no benchmark parameters, so corpus views are UI-driven on both arms; the corpus decimal strings are honored through the planner targets, not through URL parameters.',
]) {
  summaryLines.push(`- ${note}`);
}
summaryLines.push('');
summaryLines.push('## Scope and honesty notes');
summaryLines.push('');
for (const note of [
  'Cold/warm: repetition 0 is cold (fresh browser context per arm; the browser process is shared, so process-level code caches are not cold). Repetitions 1+ re-navigate one persistent page (warm).',
  'Cancellation interactions, cache/replay/recolor distributions, and catalog shard states are out of scope for this pass.',
  'markWallMs ends at the same rAF callback as the trace requestToPresentMs; it is not proof of physical paint (plan §8).',
  'The RGBA hash is a palette-inclusive proxy; cross-build hash mismatches are expected on interior/boundary-heavy views (PR 3 verifier reductions + PR 5 period-policy display landed between the arms) and are enumerated in semantic-comparison.json.',
  `${reps} paired repetitions = screening-protocol scale (plan §9 allows 9-11); release-gate cases need 21+ reps, BCa paired intervals, branded stable browsers, and declared target hardware.`,
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
for (const server of servers) await server.close();
process.exit(0);
