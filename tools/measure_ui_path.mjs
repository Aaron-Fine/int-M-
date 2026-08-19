import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { chromium, firefox } from 'playwright';

const baseUrl = process.env.PHASE1_BASE_URL ?? 'http://127.0.0.1:4173/';
const outputPath = resolve(process.env.PHASE1_OUTPUT ?? 'evidence/phase-1/ui-path-raw.json');
const sampleCount = Number.parseInt(process.env.PHASE1_SAMPLES ?? '5', 10);
const cancelPresses = Number.parseInt(process.env.PHASE1_CANCEL_PRESSES ?? '24', 10);
const headless = process.env.PHASE1_HEADLESS === '1';
const browsers = (process.env.PHASE1_BROWSERS ?? 'chromium,firefox')
  .split(',')
  .map((name) => name.trim())
  .filter(Boolean);

const BUDGETS = {
  coarse768Ms: 150,
  coarse1024Ms: 250,
  stable768Ms: 2000,
  stable1024Ms: 2250,
  cancellationP95Ms: 50,
  longTaskMs: 50,
};

const percentile = (values, p) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return roundMs(sorted[index]);
};

const median = (values) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? roundMs(((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2)
    : roundMs(sorted[middle] ?? 0);
};

const roundMs = (value) => Math.round(value * 100) / 100;

const collectMarks = async (page) =>
  page.evaluate(() =>
    performance
      .getEntriesByType('mark')
      .filter((entry) => entry.name.startsWith('mi:'))
      .map((entry) => {
        const detail = /** @type {PerformanceMark} */ (entry).detail;
        return {
          name: entry.name,
          startTime: entry.startTime,
          detail: detail ?? null,
        };
      }),
  );

const explorerState = async (page) =>
  page.evaluate(() => {
    const el = document.querySelector('#explorer');
    return {
      stage: el?.getAttribute('data-render-stage') ?? null,
      requestId: el?.getAttribute('data-render-request-id') ?? null,
    };
  });

const waitForAnimationFrames = async (page, count = 2) => {
  await page.evaluate(
    (frames) =>
      new Promise((resolve) => {
        const tick = (remaining) => {
          if (remaining <= 0) {
            resolve(undefined);
            return;
          }
          requestAnimationFrame(() => tick(remaining - 1));
        };
        tick(frames);
      }),
    count,
  );
};

const waitForStable = async (page, timeout = 20_000) => {
  await page.locator('#explorer').waitFor({ state: 'visible', timeout });
  await page.waitForFunction(
    () => document.querySelector('#explorer')?.getAttribute('data-render-stage') === 'stable',
    null,
    { timeout },
  );
  await waitForAnimationFrames(page);
};

const waitForNewRequest = async (page, previousId, timeout = 10_000) => {
  await page.waitForFunction(
    (prev) => {
      const el = document.querySelector('#explorer');
      const nextId = el?.getAttribute('data-render-request-id') ?? null;
      const stage = el?.getAttribute('data-render-stage');
      return nextId !== null && nextId !== prev && (stage === 'requested' || stage === 'coarse');
    },
    previousId,
    { timeout },
  );
};

const waitForStableRequest = async (page, requestId, timeout = 20_000) => {
  await page.waitForFunction(
    (id) => {
      const el = document.querySelector('#explorer');
      return (
        el?.getAttribute('data-render-request-id') === id &&
        el?.getAttribute('data-render-stage') === 'stable'
      );
    },
    requestId,
    { timeout },
  );
  await waitForAnimationFrames(page);
};

const canvasInfo = async (page) =>
  page.evaluate(() => {
    const canvas = document.querySelector('.explorer__canvas');
    const stack = document.querySelector('.explorer__stack');
    if (!(canvas instanceof HTMLCanvasElement) || !(stack instanceof HTMLElement)) {
      throw new Error('canvas or stack missing');
    }
    const rect = stack.getBoundingClientRect();
    return {
      backingWidth: canvas.width,
      backingHeight: canvas.height,
      cssWidth: rect.width,
      cssHeight: rect.height,
      devicePixelRatio: window.devicePixelRatio,
      renderStage: document.querySelector('#explorer')?.getAttribute('data-render-stage'),
      requestId: document.querySelector('#explorer')?.getAttribute('data-render-request-id'),
    };
  });

const setCanvasEdge = async (page, edge) => {
  const previous = await explorerState(page);
  await page.evaluate((size) => {
    const stack = document.querySelector('.explorer__stack');
    if (!(stack instanceof HTMLElement)) throw new Error('missing explorer stack');
    stack.style.width = `${size}px`;
    stack.style.height = `${size}px`;
    stack.style.maxWidth = `${size}px`;
    stack.style.minHeight = `${size}px`;
    stack.style.aspectRatio = 'auto';
  }, edge);
  await page.waitForFunction(
    (size) => {
      const canvas = document.querySelector('.explorer__canvas');
      const el = document.querySelector('#explorer');
      return (
        canvas instanceof HTMLCanvasElement &&
        canvas.width === size &&
        canvas.height === size &&
        el?.getAttribute('data-render-stage') === 'stable'
      );
    },
    edge,
    { timeout: 20_000 },
  );
  await waitForAnimationFrames(page);
  return previous;
};

const WORKER_MARK_NAMES = [
  'mi:worker-coarse-classify',
  'mi:worker-coarse-colorize',
  'mi:worker-stable-classify',
  'mi:worker-stable-colorize',
  'mi:worker-yield-wait',
];

const markRequestId = (mark) => {
  const requestId =
    mark.detail && typeof mark.detail === 'object' && 'requestId' in mark.detail
      ? Number(mark.detail.requestId)
      : undefined;
  return requestId === undefined || Number.isNaN(requestId) ? undefined : requestId;
};

const markDuration = (mark) => {
  const duration =
    mark.detail && typeof mark.detail === 'object' && 'duration' in mark.detail
      ? Number(mark.detail.duration)
      : null;
  return duration === null || Number.isNaN(duration) ? null : roundMs(duration);
};

const markCount = (mark) => {
  const count =
    mark.detail && typeof mark.detail === 'object' && 'count' in mark.detail
      ? Number(mark.detail.count)
      : null;
  return count === null || Number.isNaN(count) ? null : count;
};

const applyYieldTiming = (current, mark) => {
  const stage =
    mark.detail && typeof mark.detail === 'object' && 'stage' in mark.detail
      ? String(mark.detail.stage)
      : undefined;
  const duration = markDuration(mark);
  const count = markCount(mark);
  if (stage === 'coarse') {
    current.coarseYieldWaitMs = duration;
    current.coarseYieldCount = count;
  } else if (stage === 'stable') {
    current.stableYieldWaitMs = duration;
    current.stableYieldCount = count;
  }
};

const WORKER_DURATION_FIELDS = {
  'mi:worker-coarse-classify': 'coarseClassifyMs',
  'mi:worker-coarse-colorize': 'coarseColorizeMs',
  'mi:worker-stable-classify': 'stableClassifyMs',
  'mi:worker-stable-colorize': 'stableColorizeMs',
};

const pairWorkerTimings = (marks) => {
  /** @type {Map<number, Record<string, number | null>>} */
  const byId = new Map();
  for (const mark of marks) {
    const requestId = markRequestId(mark);
    if (requestId === undefined) continue;
    const current = byId.get(requestId) ?? {};
    const durationField = WORKER_DURATION_FIELDS[mark.name];
    if (durationField !== undefined) current[durationField] = markDuration(mark);
    if (mark.name === 'mi:worker-yield-wait') applyYieldTiming(current, mark);
    byId.set(requestId, current);
  }
  return byId;
};

const summarizeWorkerTimings = (samples) => {
  const present = samples.filter((item) => item);
  const values = (key) =>
    present.map((item) => item?.[key]).filter((value) => typeof value === 'number');
  if (values('stableClassifyMs').length === 0 && values('coarseClassifyMs').length === 0) {
    return null;
  }
  return {
    coarseClassifyMedianMs: median(values('coarseClassifyMs')),
    coarseColorizeMedianMs: median(values('coarseColorizeMs')),
    stableClassifyMedianMs: median(values('stableClassifyMs')),
    stableColorizeMedianMs: median(values('stableColorizeMs')),
    coarseYieldWaitMedianMs: median(values('coarseYieldWaitMs')),
    stableYieldWaitMedianMs: median(values('stableYieldWaitMs')),
    coarseYieldCountMedian: median(values('coarseYieldCount')),
    stableYieldCountMedian: median(values('stableYieldCount')),
  };
};

const pairPresentation = (marks) => {
  /** @type {Map<number, { request?: number, coarse?: number, stable?: number }>} */
  const byId = new Map();
  for (const mark of marks) {
    const requestId =
      mark.detail && typeof mark.detail === 'object' && 'requestId' in mark.detail
        ? Number(mark.detail.requestId)
        : undefined;
    if (requestId === undefined || Number.isNaN(requestId)) continue;
    const current = byId.get(requestId) ?? {};
    if (mark.name === 'mi:render-request') current.request = mark.startTime;
    if (mark.name === 'mi:coarse-presented') current.coarse = mark.startTime;
    if (mark.name === 'mi:stable-presented') current.stable = mark.startTime;
    byId.set(requestId, current);
  }
  return [...byId.entries()]
    .filter(([, times]) => times.request !== undefined)
    .map(([requestId, times]) => ({
      requestId,
      coarseMs:
        times.coarse !== undefined && times.request !== undefined
          ? roundMs(times.coarse - times.request)
          : null,
      stableMs:
        times.stable !== undefined && times.request !== undefined
          ? roundMs(times.stable - times.request)
          : null,
    }));
};

const pairCancellations = (marks) => {
  /** @type {Map<number, number[]>} */
  const requested = new Map();
  /** @type {Map<number, number[]>} */
  const acknowledged = new Map();
  /** @type {Map<number, number>} */
  const stableAt = new Map();
  for (const mark of marks) {
    const requestId =
      mark.detail && typeof mark.detail === 'object' && 'requestId' in mark.detail
        ? Number(mark.detail.requestId)
        : undefined;
    if (requestId === undefined || Number.isNaN(requestId)) continue;
    if (mark.name === 'mi:cancellation-requested') {
      requested.set(requestId, [...(requested.get(requestId) ?? []), mark.startTime]);
    }
    if (mark.name === 'mi:cancellation-acknowledged') {
      acknowledged.set(requestId, [...(acknowledged.get(requestId) ?? []), mark.startTime]);
    }
    if (mark.name === 'mi:stable-presented') {
      stableAt.set(requestId, mark.startTime);
    }
  }
  const all = [];
  const inFlight = [];
  for (const [requestId, times] of requested) {
    const acks = acknowledged.get(requestId) ?? [];
    for (const requestedAt of times) {
      const ack = acks.find((value) => value >= requestedAt);
      if (ack === undefined) continue;
      const sample = { requestId, ms: roundMs(ack - requestedAt) };
      all.push(sample);
      const stable = stableAt.get(requestId);
      if (stable === undefined || requestedAt < stable) inFlight.push(sample);
    }
  }
  return { all, inFlight };
};

const longTasks = (marks) =>
  marks
    .filter((mark) => mark.name === 'mi:long-task')
    .map((mark) => {
      const duration =
        mark.detail && typeof mark.detail === 'object' && 'duration' in mark.detail
          ? Number(mark.detail.duration)
          : null;
      return { startTime: mark.startTime, duration };
    });

const measureCase = async (page, canvas, edge, label) => {
  await page.getByLabel('Quality').selectOption('balanced');
  await setCanvasEdge(page, edge);
  await page.evaluate(() => {
    performance.clearMarks('mi:long-task');
  });

  const samples = [];
  for (let index = 0; index < sampleCount; index += 1) {
    const reset = page.getByRole('button', { name: 'Reset' });
    if (await reset.isEnabled()) {
      const beforeReset = await explorerState(page);
      await reset.click();
      await waitForNewRequest(page, beforeReset.requestId);
      const afterReset = await explorerState(page);
      await waitForStableRequest(page, afterReset.requestId);
    }
    await page.waitForFunction(
      (size) => {
        const canvasEl = document.querySelector('.explorer__canvas');
        return (
          canvasEl instanceof HTMLCanvasElement &&
          canvasEl.width === size &&
          canvasEl.height === size
        );
      },
      edge,
      { timeout: 20_000 },
    );
    const before = await explorerState(page);
    await page.evaluate(
      (names) => {
        for (const name of names) {
          performance.clearMarks(name);
        }
      },
      ['mi:render-request', 'mi:coarse-presented', 'mi:stable-presented', ...WORKER_MARK_NAMES],
    );
    await canvas.focus();
    await canvas.press('+');
    await waitForNewRequest(page, before.requestId);
    const started = await explorerState(page);
    await waitForStableRequest(page, started.requestId);
    const marks = await collectMarks(page);
    const paired = pairPresentation(marks).find(
      (item) => String(item.requestId) === started.requestId,
    );
    const worker = pairWorkerTimings(marks).get(Number(started.requestId)) ?? null;
    samples.push({
      index,
      canvas: await canvasInfo(page),
      requestId: started.requestId,
      latest: paired ?? null,
      worker,
    });
  }

  await page.evaluate(() => {
    for (const name of [
      'mi:cancellation-requested',
      'mi:cancellation-acknowledged',
      'mi:render-request',
      'mi:coarse-presented',
      'mi:stable-presented',
    ]) {
      performance.clearMarks(name);
    }
  });
  await canvas.focus();
  for (let step = 0; step < cancelPresses; step += 1) {
    const before = await explorerState(page);
    await canvas.press('ArrowRight');
    await waitForNewRequest(page, before.requestId);
    try {
      await page.waitForFunction(
        () => document.querySelector('#explorer')?.getAttribute('data-render-stage') === 'coarse',
        null,
        { timeout: 2_000 },
      );
    } catch {
      // Cached or very fast coarse frames can skip the observable coarse stage.
    }
    await canvas.press('ArrowRight');
  }
  await waitForStable(page, 30_000);
  const cancelMarks = await collectMarks(page);
  const cancellations = pairCancellations(cancelMarks);
  const tasks = longTasks(cancelMarks);
  const presentation = samples
    .map((sample) => sample.latest)
    .filter((item) => item && item.coarseMs !== null && item.stableMs !== null);

  return {
    id: label,
    edge,
    quality: 'balanced',
    canvas: await canvasInfo(page),
    samples,
    summary: {
      coarseMedianMs: median(presentation.map((item) => item?.coarseMs ?? 0)),
      coarseMaxMs: presentation.length
        ? roundMs(Math.max(...presentation.map((item) => item?.coarseMs ?? 0)))
        : null,
      stableMedianMs: median(presentation.map((item) => item?.stableMs ?? 0)),
      stableMaxMs: presentation.length
        ? roundMs(Math.max(...presentation.map((item) => item?.stableMs ?? 0)))
        : null,
      cancellationAllCount: cancellations.all.length,
      cancellationInFlightCount: cancellations.inFlight.length,
      cancellationAllP95Ms: percentile(
        cancellations.all.map((item) => item.ms),
        95,
      ),
      cancellationInFlightP95Ms: percentile(
        cancellations.inFlight.map((item) => item.ms),
        95,
      ),
      longTaskCount: tasks.length,
      longTasksOver50Ms: tasks.filter((task) => (task.duration ?? 0) > BUDGETS.longTaskMs),
      worker: summarizeWorkerTimings(samples.map((sample) => sample.worker)),
    },
    cancellations,
    longTasks: tasks,
    markNames: [...new Set(cancelMarks.map((mark) => mark.name))],
  };
};

const collectTabOrder = async (page) => {
  const order = [];
  await page.locator('.skip-link').focus();
  for (let index = 0; index < 40; index += 1) {
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => {
      const el = document.activeElement;
      if (!(el instanceof HTMLElement)) return null;
      return {
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute('role'),
        name:
          el.getAttribute('aria-label') ||
          el.getAttribute('title') ||
          el.textContent?.trim().replace(/\s+/g, ' ').slice(0, 80) ||
          '',
        outline: getComputedStyle(el).boxShadow,
      };
    });
    if (focused === null) continue;
    const key = `${focused.tag}:${focused.name}`;
    if (order.some((item) => `${item.tag}:${item.name}` === key) && index > 4) break;
    order.push(focused);
  }
  return order;
};

const collectOverflow = async (page, zoom) => {
  await page.evaluate((value) => {
    document.documentElement.style.zoom = String(value);
  }, zoom);
  await page.waitForTimeout(300);
  const metrics = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    clientHeight: document.documentElement.clientHeight,
    scrollHeight: document.documentElement.scrollHeight,
  }));
  await page.evaluate(() => {
    document.documentElement.style.zoom = '';
  });
  return { zoom, ...metrics, overflowedX: metrics.scrollWidth > metrics.clientWidth + 1 };
};

const launchBrowser = async (name) => {
  if (name === 'chromium') {
    return {
      name,
      kind: 'Playwright Chromium / Chrome for Testing',
      browser: await chromium.launch({ headless }),
    };
  }
  if (name === 'firefox') {
    try {
      const branded = await firefox.launch({
        headless,
        executablePath: '/usr/bin/firefox',
      });
      return { name, kind: 'branded system Firefox', browser: branded };
    } catch (error) {
      const managed = await firefox.launch({ headless });
      return {
        name,
        kind: `Playwright Firefox (branded launch failed: ${String(error)})`,
        browser: managed,
      };
    }
  }
  throw new Error(`Unsupported browser ${name}`);
};

const runBrowser = async (name) => {
  const launched = await launchBrowser(name);
  const context = await launched.browser.newContext({
    viewport: { width: 1440, height: 1200 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const consoleMessages = [];
  const pageErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      consoleMessages.push({
        type: message.type(),
        text: message.text(),
        url: message.location().url,
      });
    }
  });
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  const guideVisibleBeforeStable = await page
    .getByRole('heading', { name: 'Start with structure' })
    .isVisible();
  await waitForStable(page);
  const guideVisibleAfterStable = await page
    .getByRole('heading', { name: 'Start with structure' })
    .isVisible();
  await page.getByRole('button', { name: 'Explore' }).click();
  const canvas = page.getByLabel('Interactive Mandelbrot set');
  await expectStableCeiling(page, canvas);

  const case768 = await measureCase(page, canvas, 768, 'balanced-768');
  const case1024 = await measureCase(page, canvas, 1024, 'balanced-1024');
  const tabOrder = await collectTabOrder(page);
  const overflow200 = await collectOverflow(page, 2);

  let vision = null;
  if (name === 'chromium') {
    const cdp = await context.newCDPSession(page);
    vision = {};
    for (const deficiency of ['protanopia', 'deuteranopia', 'tritanopia']) {
      await cdp.send('Emulation.setEmulatedVisionDeficiency', { type: deficiency });
      await page.waitForTimeout(250);
      const shotPath = resolve(`evidence/phase-1/vision-${deficiency}.png`);
      await page.screenshot({ path: shotPath, fullPage: false });
      vision[deficiency] = shotPath;
    }
    await cdp.send('Emulation.setEmulatedVisionDeficiency', { type: 'none' });
  }

  const userAgent = await page.evaluate(() => navigator.userAgent);
  const result = {
    name,
    kind: launched.kind,
    version: launched.browser.version(),
    userAgent,
    viewport: { width: 1440, height: 1200, deviceScaleFactor: 1 },
    firstUse: {
      guideVisibleBeforeStable,
      guideVisibleAfterStable,
    },
    cases: [case768, case1024],
    tabOrder,
    overflow200,
    vision,
    consoleMessages,
    pageErrors,
  };
  await context.close();
  await launched.browser.close();
  return result;
};

const expectStableCeiling = async (page, canvas) => {
  await canvas.focus();
  for (let step = 0; step < 31; step += 1) {
    await canvas.press('+');
  }
  await page.getByLabel('Magnification').waitFor({ state: 'visible' });
  await page.waitForFunction(
    () =>
      (document.querySelector('[aria-label="Magnification"]')?.textContent ?? '').includes(
        '6.00e6',
      ),
    null,
    { timeout: 20_000 },
  );
  await page.getByRole('button', { name: 'Reset' }).click();
  await waitForStable(page);
};

const smokeProduction = async () => {
  const launched = await chromium.launch({ headless: true });
  const page = await launched.newPage();
  const consoleMessages = [];
  const failedRequests = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleMessages.push(message.text());
  });
  page.on('requestfailed', (request) => {
    failedRequests.push({ url: request.url(), error: request.failure()?.errorText ?? 'unknown' });
  });
  await page.goto('https://int-m.pages.dev/', { waitUntil: 'domcontentloaded' });
  const title = await page.title();
  await waitForStable(page, 30_000);
  await page.getByRole('button', { name: 'Explore' }).click();
  await page.getByRole('button', { name: 'Inspect Main cardioid, period 1' }).click();
  await page.getByRole('heading', { name: 'Main cardioid' }).waitFor({ timeout: 15_000 });
  await page.getByLabel('Interior view').selectOption('period');
  const canvas = page.getByLabel('Interactive Mandelbrot set');
  await canvas.focus();
  await canvas.press('+');
  await waitForStable(page);
  for (let step = 0; step < 31; step += 1) {
    await canvas.press('+');
  }
  await page.waitForFunction(
    () =>
      (document.querySelector('[aria-label="Magnification"]')?.textContent ?? '').includes(
        '6.00e6',
      ),
    null,
    { timeout: 20_000 },
  );
  const zoomInDisabled = await page.getByRole('button', { name: 'Zoom in' }).isDisabled();
  const assets = await page.evaluate(() =>
    [...document.querySelectorAll('script[src], link[rel="stylesheet"]')].map(
      (el) => el.getAttribute('src') || el.getAttribute('href'),
    ),
  );
  await launched.close();
  return {
    url: 'https://int-m.pages.dev/',
    title,
    assets,
    zoomCeilingVisible: true,
    zoomInDisabled,
    consoleErrors: consoleMessages,
    failedRequests,
  };
};

const results = {
  schemaVersion: 1,
  measuredAt: new Date().toISOString(),
  commit: process.env.PHASE1_COMMIT ?? null,
  baseUrl,
  headless,
  budgets: BUDGETS,
  sampleCount,
  cancelPresses,
  browsers: [],
  production: null,
};

for (const name of browsers) {
  results.browsers.push(await runBrowser(name));
}
if (process.env.PHASE1_SKIP_PRODUCTION !== '1') {
  results.production = await smokeProduction();
}

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(results, null, 2)}\n`, 'utf8');
process.stdout.write(
  `${JSON.stringify(
    {
      outputPath,
      browsers: results.browsers.map((item) => ({
        name: item.name,
        version: item.version,
        kind: item.kind,
        cases: item.cases.map((measurement) => ({
          id: measurement.id,
          canvas: measurement.canvas,
          summary: measurement.summary,
        })),
      })),
      production: results.production,
    },
    null,
    2,
  )}\n`,
);
