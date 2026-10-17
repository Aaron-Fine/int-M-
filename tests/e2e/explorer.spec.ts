import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const wcagTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const expectNoAccessibilityViolations = async (page: Page): Promise<void> => {
  const results = await new AxeBuilder({ page }).withTags(wcagTags).analyze();
  expect(
    results.violations,
    results.violations
      .map(
        (violation) =>
          `${violation.id}: ${violation.help} (${violation.nodes
            .map((node) => node.target.join(' '))
            .join(', ')})`,
      )
      .join('\n'),
  ).toEqual([]);
};

const APP_WORKER_NAME = /^(?:mandelbrot-renderer|mandelbrot-tile)$/;
const APP_WORKER_URL = /(?:render|tile)\.worker/;

interface AppWorkerCounts {
  readonly render: number;
  readonly tile: number;
  readonly total: number;
  readonly source: 'cdp' | 'page.workers';
  readonly urls: readonly string[];
}

const isAppWorkerUrl = (url: string, title = ''): boolean =>
  APP_WORKER_NAME.test(title) || APP_WORKER_URL.test(url);

const countFromPageWorkers = (page: Page): AppWorkerCounts => {
  const urls = page
    .workers()
    .map((worker) => worker.url())
    .filter((url) => isAppWorkerUrl(url));
  const render = urls.filter((url) => url.includes('render.worker')).length;
  const tile = urls.filter((url) => url.includes('tile.worker')).length;
  return { render, tile, total: urls.length, source: 'page.workers', urls };
};

const countFromCdpTargets = async (page: Page): Promise<AppWorkerCounts> => {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('Target.setDiscoverTargets', { discover: true });
    const { targetInfos } = await cdp.send('Target.getTargets');
    const workers = targetInfos.filter(
      (target) => target.type === 'worker' && isAppWorkerUrl(target.url, target.title),
    );
    const render = workers.filter(
      (target) => target.title === 'mandelbrot-renderer' || target.url.includes('render.worker'),
    ).length;
    const tile = workers.filter(
      (target) => target.title === 'mandelbrot-tile' || target.url.includes('tile.worker'),
    ).length;
    return {
      render,
      tile,
      total: workers.length,
      source: 'cdp',
      urls: workers.map((target) => `${target.title}:${target.url}`),
    };
  } finally {
    await cdp.detach();
  }
};

const failRenderer = async (page: Page, count = 1): Promise<void> => {
  await page.evaluate((failureCount) => {
    const testGlobal = globalThis as typeof globalThis & {
      __MI_PHASE1_TEST__?: { failRenderer(): void };
    };
    const testApi = testGlobal.__MI_PHASE1_TEST__;
    if (!testApi) throw new Error('Phase 1 test seam is unavailable');
    for (let index = 0; index < failureCount; index += 1) {
      testApi.failRenderer();
    }
  }, count);
};

const expectNoHorizontalOverflow = async (page: Page, context: string): Promise<void> => {
  const pageWidth = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(pageWidth.scroll, `${context} overflowed horizontally`).toBeLessThanOrEqual(
    pageWidth.client,
  );
};

interface InspectionHold {
  /** Holds back every inspection reply that the renderer sends from now on. */
  readonly start: () => Promise<void>;
  /** How many replies are currently held back. */
  readonly held: () => Promise<number>;
  /** Delivers the held replies to the page, in arrival order. */
  readonly release: () => Promise<void>;
}

interface InspectionHoldState {
  active: boolean;
  readonly held: (() => void)[];
}

type HoldGlobal = typeof globalThis & { __miInspectionHold?: InspectionHoldState };

/**
 * Lets a test delay the renderer's inspection reply on purpose. Call it before
 * `page.goto`: it wraps the page's worker `message` listeners so that, once
 * started, `inspection` messages wait until `release`. Nothing else is held,
 * and no timer is involved.
 */
const holdInspectionReplies = async (page: Page): Promise<InspectionHold> => {
  await page.addInitScript(() => {
    const state: InspectionHoldState = { active: false, held: [] };
    (globalThis as HoldGlobal).__miInspectionHold = state;
    // eslint-disable-next-line @typescript-eslint/unbound-method -- invoked only via original.call(this, ...)
    const original = Worker.prototype.addEventListener;
    Worker.prototype.addEventListener = function (
      this: Worker,
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ): void {
      if (type !== 'message') {
        original.call(this, type, listener, options);
        return;
      }
      const deliver = (event: Event): void => {
        if (typeof listener === 'function') listener.call(this, event);
        else listener.handleEvent(event);
      };
      original.call(
        this,
        type,
        (event: Event) => {
          const data = (event as MessageEvent<{ type?: string } | null>).data;
          if (state.active && data?.type === 'inspection') {
            state.held.push(() => {
              deliver(event);
            });
            return;
          }
          deliver(event);
        },
        options,
      );
    } as typeof Worker.prototype.addEventListener;
  });
  return {
    start: () =>
      page.evaluate(() => {
        const state = (globalThis as HoldGlobal).__miInspectionHold;
        if (state) state.active = true;
      }),
    held: () =>
      page.evaluate(() => (globalThis as HoldGlobal).__miInspectionHold?.held.length ?? 0),
    release: () =>
      page.evaluate(() => {
        const state = (globalThis as HoldGlobal).__miInspectionHold;
        if (!state) return;
        state.active = false;
        for (const deliverHeld of state.held.splice(0)) deliverHeld();
      }),
  };
};

interface TraceView {
  readonly requestId: number | string;
  readonly computeId?: number | undefined;
  readonly outcome: string;
  readonly cancelAckMs?: number | undefined;
  readonly childQuiescenceMs?: number | undefined;
  readonly frames: readonly {
    readonly stage: string;
    readonly source: string;
    readonly originComputeId?: number | undefined;
    readonly workerWallMs?: number | undefined;
    readonly colorizeMs?: number | undefined;
  }[];
}

/** The ?perf=1 render-trace ring, reduced to the provenance and timing fields. */
const renderTraces = (page: Page): Promise<TraceView[]> =>
  page.evaluate((): TraceView[] => {
    const hook = (
      globalThis as typeof globalThis & {
        __miRenderTrace?: { snapshot(): readonly TraceView[] };
      }
    ).__miRenderTrace;
    return (hook?.snapshot() ?? []).map((trace) => ({
      requestId: trace.requestId,
      computeId: trace.computeId,
      outcome: trace.outcome,
      cancelAckMs: trace.cancelAckMs,
      childQuiescenceMs: trace.childQuiescenceMs,
      frames: trace.frames.map((frame) => ({
        stage: frame.stage,
        source: frame.source,
        originComputeId: frame.originComputeId,
        workerWallMs: frame.workerWallMs,
        colorizeMs: frame.colorizeMs,
      })),
    }));
  });

const tracesWith = async (page: Page, outcome: string): Promise<TraceView | undefined> =>
  (await renderTraces(page)).find((trace) => trace.outcome === outcome);

/**
 * Waits until nothing is in flight: the newest closed trace is the request on
 * screen, it completed, and its last frame is stable. Returns that trace's
 * `computeId`, the computation the worker's semantic cache then holds, which is
 * what a recolor reports as `originComputeId`.
 *
 * Why not just take the last completed trace: the page sets
 * `data-render-stage="stable"` synchronously, but records the frame, and so
 * closes the trace, in a later requestAnimationFrame. A test that read the ring
 * on that signal could still see an older completed trace (for example compute
 * 2) while the cache already held the on-screen compute (4). That is the
 * probable cause of the one unreproduced "4 against an expected 2" failure; the
 * settled request's own trace is the cached computation.
 */
const settledOriginComputeId = async (page: Page): Promise<number> => {
  const newest = async (): Promise<{ trace: TraceView | undefined; onScreen: string | null }> => ({
    trace: (await renderTraces(page)).at(-1),
    onScreen: await page.locator('#explorer').getAttribute('data-render-request-id'),
  });
  await expect
    .poll(
      async () => {
        const { trace, onScreen } = await newest();
        return (
          trace?.outcome === 'completed' &&
          String(trace.requestId) === onScreen &&
          trace.frames.at(-1)?.stage === 'stable'
        );
      },
      { timeout: 10_000 },
    )
    .toBe(true);
  const { trace } = await newest();
  const origin = trace?.computeId;
  if (origin === undefined)
    throw new Error(`settled trace names no computation: ${JSON.stringify(trace)}`);
  return origin;
};

/**
 * The latest trace is a one-frame recolor of `originComputeId`, with no compute fields.
 * A mismatch prints the whole trace ring.
 */
const expectRecolorOf = async (page: Page, originComputeId: number | undefined): Promise<void> => {
  await expect
    .poll(async () => (await renderTraces(page)).at(-1)?.frames[0]?.source, { timeout: 10_000 })
    .toBe('recolor');
  const ring = await renderTraces(page);
  const recolorTrace = ring.at(-1);
  expect(recolorTrace?.outcome).toBe('completed');
  expect(recolorTrace?.computeId).toBeUndefined();
  expect(recolorTrace?.frames).toHaveLength(1);
  const [frame] = recolorTrace?.frames ?? [];
  expect(frame?.originComputeId, `trace ring: ${JSON.stringify(ring)}`).toBe(originComputeId);
  expect(frame?.workerWallMs).toBeUndefined();
  expect(frame?.colorizeMs).toBeGreaterThanOrEqual(0);
};

/**
 * In-flight replay: change the interior view while a coarse frame is the active
 * computation. The worker replays the retained coarse frame and the same
 * computation delivers the stable frame. The stable frame can win the race, so
 * retry (bounded) until a trace opens with an inflight-replay frame. Each attempt
 * picks a view that differs from the previous one.
 */
const findInflightReplayTrace = async (page: Page): Promise<TraceView | undefined> => {
  const replayViews = ['period', 'stability'] as const;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await page.getByLabel('Interactive Mandelbrot set').press(attempt % 2 === 0 ? '+' : '-');
    await expect(page.locator('#explorer')).toHaveAttribute('data-render-stage', 'coarse', {
      timeout: 10_000,
    });
    await page.getByLabel('Interior view').selectOption(replayViews[attempt % 2] ?? 'period');
    await expect(page.locator('#explorer')).toHaveAttribute('data-render-stage', 'stable', {
      timeout: 10_000,
    });
    const replayTrace = (await renderTraces(page)).find(
      (trace) => trace.frames[0]?.source === 'inflight-replay',
    );
    if (replayTrace !== undefined) return replayTrace;
  }
  return undefined;
};

/** The replay trace is one completed request: a coarse replay of the active computation, then its stable frame. */
const expectInflightReplay = (
  replayTrace: TraceView | undefined,
  ring: readonly TraceView[],
): void => {
  expect(replayTrace).toBeDefined();
  const [replayFrame, replayStableFrame] = replayTrace?.frames ?? [];
  expect(replayTrace?.outcome).toBe('completed');
  expect(replayFrame?.stage).toBe('coarse');
  expect(replayFrame?.originComputeId).toBeGreaterThan(0);
  expect(replayFrame?.originComputeId, `trace ring: ${JSON.stringify(ring)}`).toBe(
    replayTrace?.computeId,
  );
  expect(replayFrame?.workerWallMs).toBeUndefined();
  expect(replayFrame?.colorizeMs).toBeGreaterThanOrEqual(0);
  expect(replayStableFrame?.stage).toBe('stable');
  expect(replayStableFrame?.source).toBe('computed');
  expect(replayStableFrame?.originComputeId).toBeUndefined();
  expect(replayStableFrame?.workerWallMs).toBeGreaterThan(0);
};

/**
 * The period legend lists at most five periods in ascending order plus "Other
 * periods", and every listed swatch is a colour the canvas actually drew
 * (the legend and the raster share one palette, MI-UX-018/MI-UX-021).
 */
const expectPeriodLegendMatchesRaster = async (page: Page): Promise<void> => {
  const legend = page.getByRole('region', { name: 'Semantic legend' });
  await expect(legend.getByText('Period 1', { exact: true })).toBeVisible();
  await expect(legend.getByText('Other periods', { exact: true })).toBeVisible();
  const periods = (
    await legend
      .locator('.legend__item--period')
      .evaluateAll((items) => items.map((item) => (item as HTMLElement).dataset['period'] ?? ''))
  )
    .filter((period) => period !== 'other')
    .map(Number);
  expect(periods.length).toBeGreaterThanOrEqual(1);
  expect(periods.length).toBeLessThanOrEqual(5);
  expect(periods).toEqual([...periods].sort((a, b) => a - b));

  const missing = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('.explorer__canvas');
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return ['no canvas'];
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    const drawn = new Set<string>();
    for (let index = 0; index < data.length; index += 4) {
      drawn.add(`${data[index]},${data[index + 1]},${data[index + 2]}`);
    }
    return [
      ...document.querySelectorAll<HTMLElement>(
        '.legend__item--period:not([data-period="other"]) .legend__swatch',
      ),
    ]
      .map((swatch) => (getComputedStyle(swatch).backgroundColor.match(/\d+/g) ?? []).join(','))
      .filter((rgb) => !drawn.has(rgb));
  });
  expect(missing).toEqual([]);
};

/**
 * Legend isolation (MI-UX-018): counts canvas pixels drawn in the swatch
 * colour of `period`'s legend entry, and pixels of any other colour brighter
 * than the isolation dimming allows (dimChannel(255) = 31).
 */
const isolationPixels = async (
  page: Page,
  period: number,
): Promise<{ readonly kept: number; readonly undimmed: number }> =>
  page.evaluate((target) => {
    const swatch = document.querySelector<HTMLElement>(
      `.legend__entry[data-period="${target}"] .legend__swatch`,
    );
    const canvas = document.querySelector<HTMLCanvasElement>('.explorer__canvas');
    const context = canvas?.getContext('2d');
    if (!swatch || !canvas || !context) return { kept: -1, undimmed: -1 };
    const [red, green, blue] = (getComputedStyle(swatch).backgroundColor.match(/\d+/g) ?? []).map(
      Number,
    );
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let kept = 0;
    let undimmed = 0;
    for (let index = 0; index < data.length; index += 4) {
      const r = data[index] ?? 0;
      const g = data[index + 1] ?? 0;
      const b = data[index + 2] ?? 0;
      if (r === red && g === green && b === blue) kept += 1;
      else if (Math.max(r, g, b) > 31) undimmed += 1;
    }
    return { kept, undimmed };
  }, period);

/** Opens the period view and waits for its stable frame. */
const openPeriodView = async (page: Page): Promise<void> => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore', exact: true }).click();
  await page.getByLabel('Interior view').selectOption('period');
  await expect(page.locator('#explorer')).toHaveAttribute('data-render-stage', 'stable', {
    timeout: 20_000,
  });
};

test.describe('Mandelbrot Interiority explorer', () => {
  test('first-use flow: explanations, evidence terms, interior views, and accessibility', async ({
    page,
  }) => {
    // Four folded scenarios; overruns 30 s only under heavy CPU oversubscription.
    test.slow();
    await test.step('starts with a useful, explained semantic view', async () => {
      await page.goto('/');

      await expect(page.getByRole('heading', { name: 'Mandelbrot Interiority' })).toBeVisible();
      await expect(page.getByLabel('Interior view')).toHaveValue('stability');
      await expect(page.getByText('How quickly the orbit settles')).toBeVisible();

      const catalog = page.getByRole('button', { name: /Catalog/ });
      await expect(catalog).toHaveAttribute('aria-pressed', 'true');
      await expect(catalog).toContainText('Shown');

      await expect(page.getByRole('heading', { name: 'Semantic legend' })).toBeVisible();
      await expect(page.getByText('Unresolved', { exact: true })).toBeVisible();
      await expect(page.getByText('No claim at current quality')).toBeVisible();

      await expect(page.getByRole('heading', { name: 'Start with structure' })).toBeVisible();
      await expect(page.locator('#explorer')).toHaveAttribute('data-render-stage', 'stable', {
        timeout: 20_000,
      });
      await expect(page.getByRole('heading', { name: 'Start with structure' })).toBeVisible();
      await expect(page.getByLabel('Interior view')).toBeEnabled();
      await expectNoAccessibilityViolations(page);
      await page.getByRole('button', { name: 'Explore' }).click();
      await expect(page.getByRole('heading', { name: 'Start with structure' })).not.toBeVisible();

      await expect(page.getByRole('status', { name: 'Render status' })).toBeVisible();
      await expect(page.getByLabel('Interactive Mandelbrot set')).toBeVisible();
    });

    await test.step('explains evidence terms and exposes bounded quality profiles', async () => {
      const help = page.getByText('How to read these values');
      await help.click();
      await expect(page.getByText('Multiplier magnitude |λ|', { exact: true })).toBeVisible();
      await expect(page.getByText(/Attraction strength per iteration/)).toBeVisible();
      await expect(page.getByText(/unresolved still means no claim/)).toBeVisible();
    });

    await test.step('changes semantic views and updates their explanation', async () => {
      const legend = page.getByRole('region', { name: 'Semantic legend' });
      await expect(legend.getByText('Stability κ', { exact: true })).toBeVisible();
      await expect(legend.locator('.legend__tick')).toHaveText(['0', '0.5', '1', '2', '∞']);

      await page.getByLabel('Interior view').selectOption('multiplier');
      await expect(
        page.getByText('The strength and angle of attraction around a detected cycle.'),
      ).toBeVisible();
      await expect(page.getByText(/Hue and oriented stripes show rotation/)).toBeVisible();
      await expect(page.getByText('Multiplier angle', { exact: true })).toBeVisible();
      await expect(legend.locator('.legend__stripe')).toHaveText(['−π/2', '0', 'π/2']);
      await expect(legend.getByText('Attraction |λ|', { exact: true })).toBeVisible();
      await expect(legend.locator('.legend__tick').first()).toHaveText('0');

      await page.getByLabel('Interior view').selectOption('period');
      await expect(page.getByText('The detected attracting-cycle period.')).toBeVisible();
      await expect(
        page.getByText(/^Up to five periods covering the most area in this view get a color/),
      ).toBeVisible();
      await expect(page.locator('#explorer')).toHaveAttribute('data-render-stage', 'stable', {
        timeout: 20_000,
      });
      await expectPeriodLegendMatchesRaster(page);
    });

    await test.step('has no automated WCAG A or AA violations in primary states', async () => {
      await expect(page.getByLabel('Interactive Mandelbrot set')).toBeVisible();
      await expectNoAccessibilityViolations(page);

      await expect(page.getByRole('button', { name: 'Explore', exact: true })).toBeHidden();
      const mainCardioid = page.getByRole('button', {
        name: 'Inspect Main cardioid, period 1',
      });
      await expect(mainCardioid).toBeVisible({ timeout: 20_000 });
      await mainCardioid.click();
      await expect(page.getByRole('heading', { name: 'Main cardioid' })).toBeVisible();
      await expectNoAccessibilityViolations(page);
    });

    await test.step('selects the Detailed quality profile', async () => {
      const quality = page.getByLabel('Quality');
      await expect(quality).toHaveValue('balanced');
      await quality.selectOption('detailed');
      // Plan §4 recommended framing, driven by the Detailed profile's period
      // policy: the guaranteed systematic budget plus the opportunistic caveat.
      await expect(
        page.getByText(
          /Detailed quality selected · Systematically checks through period 64 within 1024 iterations/,
        ),
      ).toBeVisible();
      await expect(page.getByText(/Checks longer and higher-period cycles/)).toBeVisible();
    });
  });
  test('supports keyboard navigation, reset, and an explicit zoom bound', async ({ page }) => {
    await page.goto('/');
    const canvas = page.getByLabel('Interactive Mandelbrot set');
    const reset = page.getByRole('button', { name: /Reset/ });

    await expect(reset).toBeDisabled();
    await canvas.focus();
    await canvas.press('+');
    await expect(reset).toBeEnabled();

    await canvas.press('0');
    await expect(reset).toBeDisabled();

    await canvas.press('-');
    await canvas.press('-');
    await expect(page.getByText('Already showing the complete Mandelbrot set.')).toBeVisible();

    await canvas.press('0');
    for (let step = 0; step < 31; step += 1) {
      await canvas.press('+');
    }
    await expect(page.getByLabel('Magnification')).toHaveText('6.00e6×');
    await expect(page.getByRole('button', { name: 'Zoom in' })).toBeDisabled();
    await expect(
      page.getByText(
        'Reached the current reliable zoom limit for this renderer and numerical budget.',
      ),
    ).toBeVisible();
  });

  test('catalog markers are keyboard-selectable and populate evidence', async ({ page }) => {
    await page.goto('/');

    const mainCardioid = page.getByRole('button', {
      name: 'Inspect Main cardioid, period 1',
    });
    await expect(mainCardioid).toBeVisible({ timeout: 20_000 });
    await mainCardioid.focus();
    await mainCardioid.press('Enter');

    await expect(page.getByRole('heading', { name: 'Main cardioid' })).toBeVisible();
    await expect(
      page.locator('.facts').getByText('Internal address', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Attracting cycle', { exact: true })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator('.facts').getByText('Stability exponent κ')).toBeVisible();

    const catalog = page.getByRole('button', { name: /Catalog/ });
    await catalog.click();
    await expect(catalog).toHaveAttribute('aria-pressed', 'false');
    await expect(mainCardioid).not.toBeVisible();
  });

  test('the Douady rabbit marker reports the analytic period-3 closed form', async ({ page }) => {
    await page.goto('/');

    const rabbit = page.getByRole('button', { name: 'Inspect Douady rabbit, period 3' });
    await expect(rabbit).toBeVisible({ timeout: 20_000 });
    await rabbit.focus();
    await rabbit.press('Enter');

    await expect(page.getByRole('heading', { name: 'Douady rabbit' })).toBeVisible();
    const pointEvidence = page.getByRole('region', { name: 'Point evidence' });
    await expect(pointEvidence.locator('.inspector__classification')).toHaveText(
      'Attracting cycle',
      { timeout: 10_000 },
    );
    // ADR 0010: the closed form answers, and the inspector says so.
    await expect(pointEvidence.locator('.inspector__evidence')).toHaveText(
      'Analytic Period 3 Component',
    );
    await expect(
      pointEvidence.locator('.facts').getByText('Analytic closed form', { exact: true }),
    ).toBeVisible();
  });

  test('zooms to a selected area and reveals labels as magnification increases', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Explore' }).click();

    const regionTool = page.getByRole('button', { name: 'Zoom area' });
    await regionTool.click();
    await expect(regionTool).toHaveAttribute('aria-pressed', 'true');

    const canvas = page.getByLabel('Interactive Mandelbrot set');
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.25);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.75, { steps: 4 });
    await expect(page.locator('.zoom-selection')).toBeVisible();
    await page.mouse.up();

    await expect(page.getByText('Zoomed to selected area.')).toBeVisible();
    await expect(page.locator('.zoom-selection')).not.toBeVisible();
    await expect
      .poll(async () =>
        Number.parseFloat((await page.getByLabel('Magnification').textContent()) ?? '0'),
      )
      .toBeGreaterThanOrEqual(1.9);
    await expect
      .poll(async () =>
        Number.parseFloat((await page.getByLabel('Magnification').textContent()) ?? '0'),
      )
      .toBeLessThanOrEqual(2.1);
    await expect(page.getByRole('button', { name: 'Reset' })).toBeEnabled();

    await page.getByRole('button', { name: 'Reset' }).click();
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await page.getByRole('button', { name: 'Zoom in' }).click();
    const periodFour = page.getByRole('button', {
      name: 'Inspect Period-4 component 2, period 4',
    });
    await expect(periodFour.locator('.catalog-marker__label')).toBeVisible();
  });

  test('marks and describes arbitrary escaped, attracting, and unresolved points', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Explore' }).click();
    const catalog = page.getByRole('button', { name: /Catalog/ });
    await catalog.click();
    await expect(catalog).toHaveAttribute('aria-pressed', 'false');
    const canvas = page.getByLabel('Interactive Mandelbrot set');
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    const pointEvidence = page.getByRole('region', { name: 'Point evidence' });
    const inspectAt = async (x: number, y: number, outcome: string): Promise<void> => {
      await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
      await expect(page.locator('#selected-point-status')).toContainText(
        `Outcome: ${outcome.toLowerCase()}`,
        { timeout: 10_000 },
      );
      await expect(pointEvidence.locator('.inspector__classification')).toHaveText(outcome);
      await expect(page.locator('.selected-point-marker')).toBeVisible();
      await expect(
        pointEvidence.locator('.facts').getByText('Parameter c', { exact: true }),
      ).toBeVisible();
      await expect(
        pointEvidence.locator('.facts').getByText('Evidence', { exact: true }),
      ).toBeVisible();
      await expect(
        pointEvidence.locator('.facts').getByText('Quality', { exact: true }),
      ).toBeVisible();
    };

    await inspectAt(0.6375, 0.5, 'Attracting cycle');
    await expect(
      page.locator('.facts').getByText('Detected period', { exact: true }),
    ).toBeVisible();
    await expect(
      page.locator('.facts').getByText('Multiplier magnitude', { exact: true }),
    ).toBeVisible();
    await inspectAt(0.9375, 0.5, 'Escaped');
    await expect(
      page.locator('.facts').getByText('Escape iteration', { exact: true }),
    ).toBeVisible();
    await expect(
      page.locator('.facts').getByText('Final magnitude', { exact: true }),
    ).toBeVisible();
    // This high-period real-axis neighborhood remains unresolved within the
    // Balanced profile's finite iteration and period search budget.
    await inspectAt(0.338, 0.5, 'Unresolved');
    await expect(pointEvidence.locator('.inspector__evidence')).toHaveText('Iteration Limit');
    await expect(page.locator('.inspector__coordinate')).toContainText('c =');
    await expect(page.getByText('How to read these values')).toBeVisible();

    const marker = page.locator('.selected-point-marker');
    const markerStyle = await marker.getAttribute('style');
    await canvas.focus();
    await canvas.press('ArrowLeft');
    await expect(marker).toBeVisible();
    await expect.poll(() => marker.getAttribute('style')).not.toBe(markerStyle);
    const pannedMarkerStyle = await marker.getAttribute('style');
    await canvas.press('+');
    await expect(marker).toBeVisible();
    await expect.poll(() => marker.getAttribute('style')).not.toBe(pannedMarkerStyle);
    await page.getByLabel('Quality').selectOption('detailed');
    await expect(marker).toBeVisible();
    await catalog.click();
    await expect(catalog).toHaveAttribute('aria-pressed', 'true');
    const periodTwo = page.getByRole('button', {
      name: 'Inspect Period-2 bulb, period 2',
    });
    await expect(periodTwo).toBeVisible({ timeout: 20_000 });
    await periodTwo.click();
    await expect(marker).toBeVisible();
    await page.getByRole('button', { name: 'Reset' }).click();
    await expect(marker).toBeHidden();
    await expect(page.locator('#selected-point-status')).toHaveText('No point selected.');
  });

  test('ignores an inspection reply that arrives after Reset', async ({ page }) => {
    const hold = await holdInspectionReplies(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Explore', exact: true }).click();
    const canvas = page.getByLabel('Interactive Mandelbrot set');
    const status = page.locator('#selected-point-status');
    const resetButton = page.getByRole('button', { name: 'Reset' });
    await canvas.focus();
    await canvas.press('+');
    await expect(resetButton).toBeEnabled();

    await hold.start();
    await canvas.press('Enter');
    await expect(status).toContainText('Computing evidence');
    await expect.poll(hold.held).toBe(1);

    await resetButton.click();
    await expect(status).toHaveText('No point selected.');
    await hold.release();

    // The held reply has now run through the page's message handler.
    await expect(status).toHaveText('No point selected.');
    await expect(page.locator('.selected-point-marker')).toBeHidden();
    await expect(
      page.getByRole('region', { name: 'Point evidence' }).locator('.inspector__classification'),
    ).toHaveCount(0);
  });

  test('Reset from the keyboard ends a drag in progress instead of resuming it', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Explore', exact: true }).click();
    const canvas = page.getByLabel('Interactive Mandelbrot set');
    const view = page.getByLabel('Current view');
    const defaultView = await view.textContent();
    await canvas.focus();
    await canvas.press('+');
    await expect.poll(() => view.textContent()).not.toBe(defaultView);
    const box = await canvas.boundingBox();
    if (!box) throw new Error('canvas has no box');
    const startX = box.x + box.width * 0.3;
    const startY = box.y + box.height * 0.3;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 40, startY + 20, { steps: 4 });
    await page.keyboard.press('Home');
    await expect.poll(() => view.textContent()).toBe(defaultView);

    // The rest of the gesture must not pan the restored view.
    await page.mouse.move(startX + 90, startY + 40, { steps: 4 });
    await page.mouse.up();
    await expect(view).toHaveText(defaultView ?? '');
    await expect(page.getByRole('button', { name: 'Reset' })).toBeDisabled();
  });

  test('keeps keyboard focus on a catalog marker across a redraw', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Explore', exact: true }).click();
    const explorer = page.locator('#explorer');
    const marker = page.getByRole('button', { name: 'Inspect Main cardioid, period 1' });
    await expect(marker).toBeVisible({ timeout: 20_000 });
    await expect(explorer).toHaveAttribute('data-render-stage', 'stable', { timeout: 20_000 });
    await marker.focus();
    await expect(marker).toBeFocused();

    // A resize forces a redraw: a new request, then its frames.
    const before = Number(await explorer.getAttribute('data-render-request-id'));
    await page.setViewportSize({ width: 1111, height: 700 });
    await expect
      .poll(async () => Number(await explorer.getAttribute('data-render-request-id')))
      .toBeGreaterThan(before);
    await expect(explorer).toHaveAttribute('data-render-stage', 'stable', { timeout: 20_000 });

    await expect(marker).toBeFocused();
  });

  test('keeps one marker per component and the selection across redraws and toggles', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Explore', exact: true }).click();
    const explorer = page.locator('#explorer');
    const markers = page.locator('.catalog-marker');
    const cardioid = page.getByRole('button', { name: 'Inspect Main cardioid, period 1' });
    await expect(cardioid).toBeVisible({ timeout: 20_000 });
    await expect(explorer).toHaveAttribute('data-render-stage', 'stable', { timeout: 20_000 });
    const total = await markers.count();
    expect(total).toBeGreaterThan(1);

    await cardioid.focus();
    await cardioid.press('Enter');
    await expect(cardioid).toHaveAttribute('aria-current', 'true');
    await expect(page.locator('.catalog-marker[aria-current="true"]')).toHaveCount(1);

    const before = Number(await explorer.getAttribute('data-render-request-id'));
    await page.setViewportSize({ width: 1111, height: 700 });
    await expect
      .poll(async () => Number(await explorer.getAttribute('data-render-request-id')))
      .toBeGreaterThan(before);
    await expect(explorer).toHaveAttribute('data-render-stage', 'stable', { timeout: 20_000 });
    await expect(markers).toHaveCount(total);
    await expect(cardioid).toHaveAttribute('aria-current', 'true');
    await expect(cardioid).toHaveClass(/catalog-marker--selected/);

    const toggle = page.getByRole('button', { name: /Catalog/ });
    await toggle.click();
    await expect(markers).toHaveCount(0);
    await toggle.click();
    await expect(markers).toHaveCount(total);
    await expect(page.locator('.catalog-marker[aria-current="true"]')).toHaveCount(1);
  });

  test('tabs through catalog markers in catalog order, lowest periods first (ADR 0012)', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Explore', exact: true }).click();
    await expect(page.locator('#explorer')).toHaveAttribute('data-render-stage', 'stable', {
      timeout: 20_000,
    });
    await expect(page.locator('.catalog-marker')).toHaveCount(11);
    await page.getByLabel('Interactive Mandelbrot set').focus();
    const names: string[] = [];
    for (let step = 0; step < 11; step += 1) {
      await page.keyboard.press('Tab');
      names.push(
        await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? ''),
      );
    }
    expect(names).toEqual([
      'Inspect Main cardioid, period 1',
      'Inspect Period-2 bulb, period 2',
      'Inspect Douady rabbit, period 3',
      'Inspect Airplane, period 3',
      'Inspect Co-rabbit, period 3',
      'Inspect Period-4 component 6, period 4',
      'Inspect Period-4 component 4, period 4',
      'Inspect Period-4 component 2, period 4',
      'Inspect Period-4 component 1, period 4',
      'Inspect Period-4 component 3, period 4',
      'Inspect Period-4 component 5, period 4',
    ]);
  });

  test('keeps catalog marker hit boxes apart at 320 px (MI-PERF-008)', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Explore', exact: true }).click();
    await expect(page.locator('#explorer')).toHaveAttribute('data-render-stage', 'stable', {
      timeout: 20_000,
    });
    const boxes = await page.locator('.catalog-marker').evaluateAll((markers) =>
      markers.map((marker) => {
        const { left, top, right, bottom, width } = marker.getBoundingClientRect();
        return { left, top, right, bottom, width };
      }),
    );
    expect(boxes.length).toBeGreaterThan(0);
    expect(boxes.length).toBeLessThanOrEqual(40);
    for (const [index, a] of boxes.entries()) {
      expect(a.width).toBeGreaterThanOrEqual(24);
      for (const b of boxes.slice(index + 1)) {
        const apart =
          a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
        expect(apart, `marker boxes ${JSON.stringify([a, b])} overlap`).toBe(true);
      }
    }
  });

  test('keeps the label of a selected marker whose label the density policy hid', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Explore', exact: true }).click();
    await expect(page.locator('#explorer')).toHaveAttribute('data-render-stage', 'stable', {
      timeout: 20_000,
    });
    const hidden = page.locator('.catalog-marker--label-hidden').first();
    await expect(hidden).toHaveCount(1);
    const id = await hidden.getAttribute('data-catalog-id');
    await hidden.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator(`.catalog-marker[data-catalog-id="${id}"]`)).toHaveAttribute(
      'aria-current',
      'true',
    );
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.mouse.move(2, 2);
    const label = page.locator(`.catalog-marker[data-catalog-id="${id}"] .catalog-marker__label`);
    await expect(label).toBeVisible();
  });

  test('Reset clears the selection from the evidence, the marker, and the address bar', async ({
    page,
  }) => {
    await page.goto('/?v=1&c=-0.1,0.65&s=0.5&view=stability&q=balanced&sel=-0.1,0.65');
    await expect(page.locator('#selected-point-status')).toContainText('Outcome:', {
      timeout: 10_000,
    });
    await expect(page.locator('.selected-point-marker')).toBeVisible();

    await page.getByRole('button', { name: 'Reset' }).click();

    await expect(page.locator('#selected-point-status')).toHaveText('No point selected.');
    await expect(page.locator('.selected-point-marker')).toBeHidden();
    await expect(
      page.getByRole('region', { name: 'Point evidence' }).locator('.inspector__classification'),
    ).toHaveCount(0);
    await expect(page.locator('.catalog-marker--selected')).toHaveCount(0);
    await expect.poll(() => new URL(page.url()).searchParams.has('sel')).toBe(false);
  });

  test('automatically recovers once and offers manual retry after persistent failure', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('status', { name: 'Render status' })).toContainText(
      'Stable frame',
      {
        timeout: 20_000,
      },
    );

    await failRenderer(page);
    await expect(page.getByRole('status', { name: 'Render status' })).toContainText(
      'Stable frame',
      {
        timeout: 20_000,
      },
    );
    await expect(page.getByRole('button', { name: 'Retry renderer' })).toBeHidden();

    await failRenderer(page, 2);
    await expect(page.getByRole('status', { name: 'Render status' })).toContainText(
      'Renderer could not recover. Controls remain available.',
    );
    const retry = page.getByRole('button', { name: 'Retry renderer' });
    await expect(retry).toBeVisible();
    await page.getByLabel('Interior view').selectOption('period');
    await expect(page.getByLabel('Interior view')).toHaveValue('period');

    await retry.click();
    await expect(page.getByRole('status', { name: 'Render status' })).toContainText(
      'Stable frame',
      {
        timeout: 20_000,
      },
    );
  });

  test('presents coarse and stable frames in order for one render request', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Explore' }).click();
    await expect(page.getByRole('status', { name: 'Render status' })).toContainText(
      'Stable frame',
      {
        timeout: 20_000,
      },
    );

    // The presented marks are written in a requestAnimationFrame after the status text changes,
    // so the startup render's marks can still be pending here. Wait for the stable mark of the
    // request on screen, or it would land after the clear below and be read as this request's.
    await page.waitForFunction(() => {
      const id = Number(
        document.querySelector('#explorer')?.getAttribute('data-render-request-id'),
      );
      return performance
        .getEntriesByName('mi:stable-presented')
        .some(
          (entry) =>
            ((entry as PerformanceMark).detail as { requestId?: number } | null)?.requestId === id,
        );
    });

    await page.evaluate(() => {
      for (const name of [
        'mi:interaction-feedback',
        'mi:render-request',
        'mi:coarse-presented',
        'mi:stable-presented',
      ]) {
        performance.clearMarks(name);
      }
    });

    const canvas = page.getByLabel('Interactive Mandelbrot set');
    const explorer = page.locator('#explorer');
    await canvas.focus();
    await canvas.press('+');
    await expect(explorer).toHaveAttribute('data-render-stage', 'coarse', {
      timeout: 20_000,
    });
    const coarseRequestId = await explorer.getAttribute('data-render-request-id');
    expect(coarseRequestId).not.toBeNull();
    await expect(explorer).toHaveAttribute('data-render-stage', 'stable', {
      timeout: 20_000,
    });
    await expect(explorer).toHaveAttribute('data-render-request-id', coarseRequestId ?? '');

    // The stable mark is written a frame after the dataset changes; wait for this request's.
    await page.waitForFunction(
      (id) =>
        performance
          .getEntriesByName('mi:stable-presented')
          .some(
            (entry) =>
              ((entry as PerformanceMark).detail as { requestId?: number } | null)?.requestId ===
              id,
          ),
      Number(coarseRequestId),
    );

    const marks = await page.evaluate(() =>
      performance
        .getEntriesByType('mark')
        .filter((entry) =>
          [
            'mi:interaction-feedback',
            'mi:render-request',
            'mi:coarse-presented',
            'mi:stable-presented',
          ].includes(entry.name),
        )
        .map((entry) => {
          const detail: unknown = (entry as PerformanceMark).detail;
          const requestId =
            typeof detail === 'object' &&
            detail !== null &&
            'requestId' in detail &&
            typeof detail.requestId === 'number'
              ? detail.requestId
              : undefined;
          return { name: entry.name, startTime: entry.startTime, requestId };
        }),
    );
    for (const name of [
      'mi:interaction-feedback',
      'mi:render-request',
      'mi:coarse-presented',
      'mi:stable-presented',
    ]) {
      expect(
        marks.some((mark) => mark.name === name),
        `${name} was not recorded`,
      ).toBe(true);
    }
    const first = (name: string): number =>
      marks.find((mark) => mark.name === name)?.startTime ?? Number.POSITIVE_INFINITY;
    expect(first('mi:interaction-feedback')).toBeLessThanOrEqual(first('mi:render-request'));
    expect(first('mi:render-request')).toBeLessThanOrEqual(first('mi:coarse-presented'));
    expect(first('mi:coarse-presented')).toBeLessThanOrEqual(first('mi:stable-presented'));

    const requestIds = marks
      .filter((mark) => mark.name !== 'mi:interaction-feedback')
      .map((mark) => mark.requestId);
    expect(new Set(requestIds)).toEqual(new Set([Number(coarseRequestId)]));
  });

  test('render traces carry delivery provenance and two-event cancellation timing', async ({
    page,
  }) => {
    await page.goto(
      '/?perf=1&view=-0.158902249,-1.034028,0.019841269841269841269&quality=detailed',
    );
    const explorer = page.locator('#explorer');
    await expect(explorer).toHaveAttribute('data-render-stage', 'stable', { timeout: 30_000 });
    const canvas = page.getByLabel('Interactive Mandelbrot set');
    await canvas.focus();

    // Cancel: press during a coarse frame; the stable frame can win the race,
    // so retry until a trace closes as cancelled.
    let cancelledTrace: TraceView | undefined;
    for (let attempt = 0; attempt < 5 && cancelledTrace === undefined; attempt += 1) {
      await canvas.press(attempt % 2 === 0 ? '+' : '-');
      await expect(explorer).toHaveAttribute('data-render-stage', 'coarse', { timeout: 10_000 });
      await canvas.press(attempt % 2 === 0 ? '-' : '+');
      await expect(explorer).toHaveAttribute('data-render-stage', 'stable', { timeout: 10_000 });
      cancelledTrace = await tracesWith(page, 'cancelled');
    }
    expect(cancelledTrace).toBeDefined();
    expect(cancelledTrace?.childQuiescenceMs).toBeGreaterThanOrEqual(
      cancelledTrace?.cancelAckMs ?? Number.POSITIVE_INFINITY,
    );

    const settledOrigin = await settledOriginComputeId(page);
    const computedTrace = (await renderTraces(page))
      .filter((t) => t.outcome === 'completed')
      .at(-1);
    expect(computedTrace?.computeId).toBeGreaterThan(0);
    for (const frame of computedTrace?.frames ?? []) {
      expect(frame.source).toBe('computed');
      expect(frame.originComputeId).toBeUndefined();
      expect(frame.workerWallMs).toBeGreaterThan(0);
    }

    await page.getByLabel('Interior view').selectOption('multiplier');
    await expectRecolorOf(page, settledOrigin);

    const replayTrace = await findInflightReplayTrace(page);
    expectInflightReplay(replayTrace, await renderTraces(page));
  });
  test('preserves focus and non-color state cues in forced colors', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await page.goto('/');
    await expect
      .poll(() => page.evaluate(() => matchMedia('(forced-colors: active)').matches))
      .toBe(true);
    await page.getByRole('button', { name: 'Explore', exact: true }).click();

    const periodTwo = page.getByRole('button', {
      name: 'Inspect Period-2 bulb, period 2',
    });
    await expect(periodTwo).toBeVisible({ timeout: 20_000 });
    await periodTwo.click();
    await expect(page.getByRole('heading', { name: 'Period-2 bulb' })).toBeVisible();

    const canvas = page.getByLabel('Interactive Mandelbrot set');
    await periodTwo.focus();
    for (let step = 0; step < 12; step += 1) {
      if (await canvas.evaluate((element) => element === document.activeElement)) {
        break;
      }
      await page.keyboard.press('Shift+Tab');
    }
    await expect(canvas).toBeFocused();
    await expect
      .poll(() => canvas.evaluate((element) => element.matches(':focus-visible')))
      .toBe(true);
    const focusStyle = await canvas.evaluate((element) => {
      const style = getComputedStyle(element);
      return { style: style.outlineStyle, width: Number.parseFloat(style.outlineWidth) };
    });
    expect(focusStyle.style).not.toBe('none');
    expect(focusStyle.width).toBeGreaterThanOrEqual(3);

    const selectedMarker = page.locator('.selected-point-marker');
    await expect(selectedMarker).toBeVisible();
    const markerStyle = await selectedMarker.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        borderStyle: style.borderTopStyle,
        outlineStyle: style.outlineStyle,
        outlineWidth: Number.parseFloat(style.outlineWidth),
      };
    });
    expect(markerStyle.borderStyle).toBe('solid');
    expect(markerStyle.outlineStyle).not.toBe('none');
    expect(markerStyle.outlineWidth).toBeGreaterThanOrEqual(2);

    await expect(page.locator('.classification--attracting-cycle')).toHaveCSS(
      'border-style',
      'solid',
    );
    await expectNoAccessibilityViolations(page);
  });

  test('reflows phone layouts without horizontal overflow or undersized controls', async ({
    page,
  }) => {
    for (const viewport of [
      { width: 320, height: 568 },
      { width: 375, height: 667 },
      { width: 430, height: 932 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto('/');

      const guidance = page.locator('.guidance');
      const guidanceBox = await guidance.boundingBox();
      expect(guidanceBox).not.toBeNull();
      if (guidanceBox) {
        expect(guidanceBox.x).toBeGreaterThanOrEqual(0);
        expect(guidanceBox.y).toBeGreaterThanOrEqual(0);
        expect(guidanceBox.x + guidanceBox.width).toBeLessThanOrEqual(viewport.width);
        expect(guidanceBox.y + guidanceBox.height).toBeLessThanOrEqual(viewport.height);
      }

      await page.getByRole('button', { name: 'Explore', exact: true }).click();
      await expect(page.getByLabel('Interactive Mandelbrot set')).toBeVisible();

      await expectNoHorizontalOverflow(page, `${viewport.width}px initial phone layout`);

      const canvasBox = await page.locator('.explorer__stack').boundingBox();
      expect(canvasBox).not.toBeNull();
      if (canvasBox) {
        expect(canvasBox.width / canvasBox.height).toBeGreaterThan(1.3);
        expect(canvasBox.width / canvasBox.height).toBeLessThan(1.37);
      }

      const targets = await page
        .locator('.site-header button, .controls__actions button, .controls select')
        .evaluateAll((elements) =>
          elements.map((target) => {
            const rect = target.getBoundingClientRect();
            return { width: rect.width, height: rect.height, left: rect.left, right: rect.right };
          }),
        );
      for (const target of targets) {
        expect(target.height).toBeGreaterThanOrEqual(44);
        expect(target.left).toBeGreaterThanOrEqual(0);
        expect(target.right).toBeLessThanOrEqual(viewport.width);
      }
    }
  });

  // One viewport per test: the multi-viewport reflow test above would exceed 30 s with axe in it.
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 375, height: 667 },
    { width: 430, height: 932 },
  ]) {
    test(`has no automated WCAG violations at ${viewport.width} px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto('/');
      await page.getByRole('button', { name: 'Explore', exact: true }).click();
      // The guide fades out for 150 ms: axe must not sample it half transparent.
      await expect(page.locator('.guidance')).toBeHidden();
      // Catalog markers appear with the first frame and are redrawn until the stable one.
      await expect(page.getByRole('button', { name: 'Inspect Airplane, period 3' })).toBeVisible({
        timeout: 20_000,
      });
      await expect(page.locator('#explorer')).toHaveAttribute('data-render-stage', 'stable', {
        timeout: 20_000,
      });
      await expectNoAccessibilityViolations(page);
    });
  }

  test('keeps every legend view and its scale ticks inside a 320 px phone layout', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Explore', exact: true }).click();
    // Tick counts follow legendModel: stability has one κ scale (5 ticks); multiplier has
    // |λ| (5 ticks) and the angle scale (5 ticks); the period view has no tick scale.
    const expectedTicks = { stability: 5, multiplier: 10, period: 0 } as const;
    for (const view of ['stability', 'multiplier', 'period'] as const) {
      await page.getByLabel('Interior view').selectOption(view);
      await expect(page.locator('#explorer')).toHaveAttribute('data-render-stage', 'stable', {
        timeout: 20_000,
      });
      await expectNoHorizontalOverflow(page, `320px ${view} legend`);
      const legendBox = await page.locator('.legend').boundingBox();
      expect(legendBox).not.toBeNull();
      const box = legendBox!;
      await expect(page.locator('.legend__tick')).toHaveCount(expectedTicks[view]);
      if (view === 'period') {
        expect(
          await page.locator('.legend__item--period').count(),
          'period view lists at least two period entries',
        ).toBeGreaterThanOrEqual(2);
      }
      const parts = await page
        .locator('.legend__tick, .legend__bar, .legend__swatch')
        .evaluateAll((elements) =>
          elements.map((element) => {
            const rect = element.getBoundingClientRect();
            return { left: rect.left, right: rect.right };
          }),
        );
      expect(parts.length, `${view} legend renders measurable parts`).toBeGreaterThan(0);
      for (const part of parts) {
        expect(part.left).toBeGreaterThanOrEqual(box.x);
        expect(part.right).toBeLessThanOrEqual(box.x + box.width);
      }
    }
  });

  test('isolates a period from the legend by keyboard and restores it (MI-UX-018)', async ({
    page,
  }) => {
    await openPeriodView(page);
    const explorer = page.locator('#explorer');
    const legend = page.getByRole('region', { name: 'Semantic legend' });
    const periodOne = legend.locator('.legend__entry[data-period="1"]');
    await expect(periodOne).toHaveAttribute('aria-pressed', 'false');
    await expect(legend.getByText(/^Hover, focus or select a period/)).toBeVisible();
    // The hint explains the buttons to assistive technology.
    const hintId = await legend.locator('.legend__hint').getAttribute('id');
    expect(hintId).toBeTruthy();
    await expect(periodOne).toHaveAttribute('aria-describedby', hintId ?? '');
    await expect(legend.locator('.legend__dropped')).toBeEmpty();

    // Keyboard focus previews the isolation.
    await periodOne.focus();
    await expect(explorer).toHaveAttribute('data-isolated-period', '1');
    await expect(explorer).toHaveAttribute('data-render-stage', 'stable');
    const isolated = await isolationPixels(page, 1);
    expect(isolated.kept).toBeGreaterThan(0);
    expect(isolated.undimmed).toBe(0);

    // Activation keeps it; Escape restores the full view.
    await page.keyboard.press('Enter');
    await expect(periodOne).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    await expect(periodOne).toHaveAttribute('aria-pressed', 'false');
    await expect(explorer).not.toHaveAttribute('data-isolated-period');
    await expect(explorer).toHaveAttribute('data-render-stage', 'stable');
    expect((await isolationPixels(page, 1)).undimmed).toBeGreaterThan(0);

    // A second activation also restores it.
    await page.keyboard.press('Enter');
    await expect(explorer).toHaveAttribute('data-isolated-period', '1');
    await page.keyboard.press('Enter');
    await expect(periodOne).toHaveAttribute('aria-pressed', 'false');
    await expect(explorer).not.toHaveAttribute('data-isolated-period');

    // A pressed isolation ends when the interior view changes.
    await page.keyboard.press('Enter');
    await expect(explorer).toHaveAttribute('data-isolated-period', '1');
    await page.getByLabel('Interior view').selectOption('stability');
    await expect(explorer).not.toHaveAttribute('data-isolated-period');
    await page.getByLabel('Interior view').selectOption('period');
    await expect(explorer).toHaveAttribute('data-render-stage', 'stable');
    await expect(legend.locator('.legend__entry[data-period="1"]')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect(explorer).not.toHaveAttribute('data-isolated-period');

    // Mouse hover previews another period while it lasts, without touching
    // the render status live region (no announcement per hover).
    const renderStatus = page.getByRole('status', { name: 'Render status' });
    const statusBefore = await renderStatus.textContent();
    await renderStatus.evaluate((element) => {
      const observed = window as typeof window & { __statusMutations?: number };
      observed.__statusMutations = 0;
      new MutationObserver((records) => {
        observed.__statusMutations = (observed.__statusMutations ?? 0) + records.length;
      }).observe(element, { childList: true, characterData: true, subtree: true });
    });
    const periodTwo = legend.locator('.legend__entry[data-period="2"]');
    await periodTwo.hover();
    await expect(explorer).toHaveAttribute('data-isolated-period', '2');
    await expect(explorer).toHaveAttribute('data-render-stage', 'stable');
    await page.mouse.move(0, 0);
    await expect(explorer).not.toHaveAttribute('data-isolated-period');
    await expect(explorer).toHaveAttribute('data-render-stage', 'stable');
    expect(await renderStatus.textContent()).toBe(statusBefore);
    expect(
      await page.evaluate(
        () => (window as typeof window & { __statusMutations?: number }).__statusMutations,
      ),
    ).toBe(0);
  });

  test('keeps isolation silent in the address bar and ends it on Escape from the canvas', async ({
    page,
  }) => {
    await openPeriodView(page);
    await expect(page).toHaveURL(/view=period/);
    const search = await page.evaluate(() => location.search);
    await page.evaluate(() => {
      const observed = window as typeof window & { __addressWrites?: number };
      observed.__addressWrites = 0;
      const original = history.replaceState.bind(history);
      history.replaceState = (...args) => {
        observed.__addressWrites = (observed.__addressWrites ?? 0) + 1;
        original(...args);
      };
    });
    const explorer = page.locator('#explorer');
    const legend = page.getByRole('region', { name: 'Semantic legend' });
    const periodOne = legend.locator('.legend__entry[data-period="1"]');

    await periodOne.click();
    await expect(explorer).toHaveAttribute('data-isolated-period', '1');
    await expect(explorer).toHaveAttribute('data-render-stage', 'stable');
    // Escape on the canvas (no pointer session) restores the full view. The
    // mouse leaves first so a hover cannot isolate whatever lies under it.
    await page.mouse.move(0, 0);
    await expect(explorer).toHaveAttribute('data-render-stage', 'stable');
    await page.locator('.explorer__canvas').focus();
    await page.keyboard.press('Escape');
    await expect(periodOne).toHaveAttribute('aria-pressed', 'false');
    await expect(explorer).not.toHaveAttribute('data-isolated-period');
    await expect(explorer).toHaveAttribute('data-render-stage', 'stable');

    expect(await page.evaluate(() => location.search)).toBe(search);
    expect(
      await page.evaluate(
        () => (window as typeof window & { __addressWrites?: number }).__addressWrites,
      ),
    ).toBe(0);
  });

  test('sends one render request per hover change across legend entries', async ({ page }) => {
    await openPeriodView(page);
    const explorer = page.locator('#explorer');
    const legend = page.getByRole('region', { name: 'Semantic legend' });
    const requestId = async (): Promise<number> =>
      Number(await explorer.getAttribute('data-render-request-id'));
    const settled = async (period: string): Promise<void> => {
      await expect(explorer).toHaveAttribute('data-isolated-period', period);
      await expect(explorer).toHaveAttribute('data-render-stage', 'stable');
    };

    const start = await requestId();
    await legend.locator('.legend__entry[data-period="1"]').hover();
    await settled('1');
    expect(await requestId()).toBe(start + 1);
    await legend.locator('.legend__entry[data-period="2"]').hover();
    await settled('2');
    expect(await requestId()).toBe(start + 2);
    // Nothing else is queued behind the settled frame.
    await page.waitForTimeout(500);
    expect(await requestId()).toBe(start + 2);
  });

  test('keeps keyboard focus on the same legend entry across a redraw', async ({ page }) => {
    await openPeriodView(page);
    const explorer = page.locator('#explorer');
    const periodOne = page.locator('.legend__entry[data-period="1"]');
    await periodOne.focus();
    await expect(explorer).toHaveAttribute('data-isolated-period', '1');
    const before = Number(await explorer.getAttribute('data-render-request-id'));

    // A wheel zoom re-renders (coarse, then stable) without moving focus.
    const box = await page.locator('.explorer__canvas').boundingBox();
    if (!box) throw new Error('canvas has no box');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -120);
    await expect
      .poll(async () => Number(await explorer.getAttribute('data-render-request-id')))
      .toBeGreaterThan(before);
    await expect(explorer).toHaveAttribute('data-render-stage', 'stable', { timeout: 20_000 });
    await expect(periodOne).toBeFocused();
    await expect(explorer).toHaveAttribute('data-isolated-period', '1');
  });

  test.describe('touch', () => {
    test.use({ hasTouch: true });

    test('a tap toggles isolation once and leaves no sticky hover', async ({ page }) => {
      await openPeriodView(page);
      const explorer = page.locator('#explorer');
      const periodOne = page.locator('.legend__entry[data-period="1"]');

      await periodOne.tap();
      await expect(periodOne).toHaveAttribute('aria-pressed', 'true');
      await expect(explorer).toHaveAttribute('data-isolated-period', '1');
      // Tap elsewhere: only the pressed state may keep the isolation.
      await page.getByRole('heading', { name: 'Semantic legend' }).tap();
      await expect(periodOne).toHaveAttribute('aria-pressed', 'true');
      await periodOne.tap();
      await expect(periodOne).toHaveAttribute('aria-pressed', 'false');
      await page.getByRole('heading', { name: 'Semantic legend' }).tap();
      await expect(explorer).not.toHaveAttribute('data-isolated-period');
      await expect(explorer).toHaveAttribute('data-render-stage', 'stable');
    });
  });

  test('marks the isolated legend entry without colour in forced colours', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await openPeriodView(page);
    const legend = page.getByRole('region', { name: 'Semantic legend' });
    const periodOne = legend.locator('.legend__entry[data-period="1"]');
    const periodTwo = legend.locator('.legend__entry[data-period="2"]');

    await periodOne.click();
    await expect(periodOne).toHaveAttribute('aria-pressed', 'true');
    // Move focus away so only the pressed state remains.
    await page.getByLabel('Interior view').focus();
    await expect(page.locator('#explorer')).toHaveAttribute('data-isolated-period', '1');
    await expect(periodOne.locator('.legend__state')).toBeVisible();
    await expect(periodOne.locator('.legend__state')).toHaveText('Isolated');
    await expect(periodTwo.locator('.legend__state')).toBeHidden();
    const outline = await periodOne.evaluate((element) => {
      const style = getComputedStyle(element);
      return { style: style.outlineStyle, width: Number.parseFloat(style.outlineWidth) };
    });
    expect(outline.style).toBe('solid');
    expect(outline.width).toBeGreaterThanOrEqual(2);
    await expectNoAccessibilityViolations(page);
  });

  test('contains point evidence and renderer recovery controls on a narrow phone', async ({
    page,
  }) => {
    const viewport = { width: 320, height: 568 };
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.getByRole('button', { name: 'Explore', exact: true }).click();

    const periodTwo = page.getByRole('button', {
      name: 'Inspect Period-2 bulb, period 2',
    });
    await expect(periodTwo).toBeVisible({ timeout: 20_000 });
    await periodTwo.click();
    const pointEvidence = page.getByRole('region', { name: 'Point evidence' });
    await expect(pointEvidence.getByRole('heading', { name: 'Period-2 bulb' })).toBeVisible();
    await expect(pointEvidence.getByText('Angled address', { exact: true })).toBeVisible();
    await expect(pointEvidence.getByText('1 → 2 at 1/2', { exact: true })).toBeVisible();
    await expect(pointEvidence.getByText('Characteristic rays', { exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page, 'selected-point evidence state');

    const factValues = await pointEvidence.locator('.facts dd').evaluateAll((elements) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          left: rect.left,
          right: rect.right,
          scroll: element.scrollWidth,
          client: element.clientWidth,
        };
      }),
    );
    for (const value of factValues) {
      expect(value.left).toBeGreaterThanOrEqual(0);
      expect(value.right).toBeLessThanOrEqual(viewport.width);
      expect(value.scroll).toBeLessThanOrEqual(value.client);
    }

    await failRenderer(page, 2);
    await expect(page.getByRole('status', { name: 'Render status' })).toContainText(
      'Renderer could not recover. Controls remain available.',
    );
    const retry = page.getByRole('button', { name: 'Retry renderer' });
    await expect(retry).toBeVisible();
    const retryBox = await retry.boundingBox();
    expect(retryBox).not.toBeNull();
    if (retryBox) {
      expect(retryBox.height).toBeGreaterThanOrEqual(44);
      expect(retryBox.x).toBeGreaterThanOrEqual(0);
      expect(retryBox.x + retryBox.width).toBeLessThanOrEqual(viewport.width);
    }
    await expectNoHorizontalOverflow(page, 'persistent renderer-error state');

    await retry.click();
    await expect(page.getByRole('status', { name: 'Render status' })).toContainText(
      'Stable frame',
      { timeout: 20_000 },
    );
    await expect(pointEvidence.getByRole('heading', { name: 'Period-2 bulb' })).toBeVisible();
    await expectNoHorizontalOverflow(page, 'manual renderer-retry state');
  });

  test('starts nested tile workers after the first stable frame', async ({ page, browserName }) => {
    await page.goto('/');
    await expect(page.getByRole('status', { name: 'Render status' })).toContainText(
      'Stable frame',
      { timeout: 20_000 },
    );

    const fromPage = countFromPageWorkers(page);
    const counts = browserName === 'chromium' ? await countFromCdpTargets(page) : fromPage;

    expect(
      counts.tile,
      `${browserName} did not start nested tile.worker after Stable (${JSON.stringify({ counts, fromPage })}). Nested module workers are required; do not treat serial classify as tiled.`,
    ).toBeGreaterThanOrEqual(1);
    expect(counts.render, `${browserName} render-worker count: ${JSON.stringify(counts)}`).toBe(1);
    expect(
      counts.tile,
      `${browserName} tile-worker count: ${JSON.stringify(counts)}`,
    ).toBeGreaterThanOrEqual(1);
    expect(
      counts.tile,
      `${browserName} tile-worker count: ${JSON.stringify(counts)}`,
    ).toBeLessThanOrEqual(4);
    expect(counts.total).toBe(1 + counts.tile);
  });

  test('recovery_doesNotLeakNestedWorkers', async ({ page, browserName }) => {
    test.skip(
      browserName !== 'chromium',
      'CDP Target.getTargets is Chromium-only. Firefox nested-worker leak count is BLOCKED in this harness.',
    );

    await page.goto('/');
    await expect(page.getByRole('status', { name: 'Render status' })).toContainText(
      'Stable frame',
      { timeout: 20_000 },
    );

    const before = await countFromCdpTargets(page);
    expect(before.render, `before recovery: ${JSON.stringify(before)}`).toBe(1);
    expect(before.tile, `before recovery: ${JSON.stringify(before)}`).toBeGreaterThanOrEqual(1);
    expect(before.tile, `before recovery: ${JSON.stringify(before)}`).toBeLessThanOrEqual(4);
    expect(before.total).toBe(1 + before.tile);

    await failRenderer(page);
    await expect(page.getByRole('status', { name: 'Render status' })).toContainText(
      'Stable frame',
      { timeout: 20_000 },
    );

    const after = await countFromCdpTargets(page);
    expect(after.render, `after recovery: ${JSON.stringify({ before, after })}`).toBe(1);
    expect(after.tile, `after recovery: ${JSON.stringify({ before, after })}`).toBe(before.tile);
    expect(after.total, `leaked workers: ${JSON.stringify({ before, after })}`).toBe(before.total);
    expect(after.total).not.toBe(2 * before.total);
  });

  test('pans from a catalog marker, cancels pan with Escape, and stamps the build', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Explore' }).click();

    const canvas = page.getByLabel('Interactive Mandelbrot set');
    await expect(canvas).toHaveCSS('cursor', 'grab');
    await expect(page.getByLabel('Build revision')).toHaveText(/[0-9a-f]{7}|unknown|test/);

    const mainCardioid = page.getByRole('button', {
      name: 'Inspect Main cardioid, period 1',
    });
    await expect(mainCardioid).toBeVisible({ timeout: 20_000 });
    await expect(mainCardioid).toHaveCSS('cursor', 'grab');

    const markerBox = await mainCardioid.boundingBox();
    expect(markerBox).not.toBeNull();
    if (!markerBox) return;
    const startX = markerBox.x + markerBox.width / 2;
    const startY = markerBox.y + markerBox.height / 2;
    const beforeCenter = await page.getByLabel('Current view').textContent();

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 80, startY + 40, { steps: 8 });
    await expect(canvas).toHaveCSS('cursor', 'grabbing');
    await page.mouse.up();

    await expect.poll(() => page.getByLabel('Current view').textContent()).not.toBe(beforeCenter);
    await expect(page.getByRole('button', { name: 'Reset' })).toBeEnabled();
    await expect(page.getByRole('heading', { name: 'Main cardioid' })).not.toBeVisible();

    await page.getByRole('button', { name: 'Reset' }).click();
    await expect(page.getByRole('button', { name: 'Reset' })).toBeDisabled();

    const canvasBox = await canvas.boundingBox();
    expect(canvasBox).not.toBeNull();
    if (!canvasBox) return;
    const originX = canvasBox.x + canvasBox.width * 0.12;
    const originY = canvasBox.y + canvasBox.height * 0.18;
    const restored = await page.getByLabel('Current view').textContent();

    await page.mouse.move(originX, originY);
    await page.mouse.down();
    await page.mouse.move(originX + 70, originY + 30, { steps: 6 });
    await expect.poll(() => page.getByLabel('Current view').textContent()).not.toBe(restored);
    await page.keyboard.press('Escape');
    await expect(page.getByText('Pan cancelled.')).toBeVisible();
    await expect.poll(() => page.getByLabel('Current view').textContent()).toBe(restored);
    await page.mouse.up();
    await expect.poll(() => page.getByLabel('Current view').textContent()).toBe(restored);
  });
});

test.describe('Shareable links (MI-UX-019)', () => {
  const waitForStable = async (page: Page): Promise<void> => {
    await expect(page.locator('#explorer')).toHaveAttribute('data-render-stage', 'stable', {
      timeout: 30_000,
    });
  };
  const searchParam = (page: Page, key: string): string | null =>
    new URL(page.url()).searchParams.get(key);

  test('records a settled view in the address without adding history and reopens it', async ({
    page,
    context,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Explore' }).click();
    await waitForStable(page);
    const historyLength = await page.evaluate(() => history.length);

    const periodTwo = page.getByRole('button', { name: 'Inspect Period-2 bulb, period 2' });
    await expect(periodTwo).toBeVisible({ timeout: 20_000 });
    await periodTwo.click();
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await page.getByLabel('Interior view').selectOption('period');
    await page.getByLabel('Quality').selectOption('quick');
    await waitForStable(page);
    await expect.poll(() => searchParam(page, 'q')).toBe('quick');
    expect(searchParam(page, 'v')).toBe('1');
    expect(searchParam(page, 'view')).toBe('period');
    expect(searchParam(page, 'sel')).toBe('mi-p2-1-2');
    expect(await page.evaluate(() => history.length)).toBe(historyLength);

    const link = page.url();
    const magnification = (await page.getByLabel('Magnification').textContent()) ?? '';
    const center = (await page.locator('.coordinates__center').textContent()) ?? '';
    const reopened = await context.newPage();
    await reopened.goto(link);
    await waitForStable(reopened);
    await expect(reopened.getByLabel('Interior view')).toHaveValue('period');
    await expect(reopened.getByLabel('Quality')).toHaveValue('quick');
    await expect(reopened.getByLabel('Magnification')).toHaveText(magnification);
    await expect(reopened.locator('.coordinates__center')).toHaveText(center);
    await expect(
      reopened
        .getByRole('region', { name: 'Point evidence' })
        .getByRole('heading', { name: 'Period-2 bulb' }),
    ).toBeVisible();
    await expect(reopened.getByRole('status', { name: 'Link notice' })).toHaveText('');
    expect(reopened.url()).toBe(link);
  });

  test('restores a selection named by a v1 catalog id (ADR 0011)', async ({ page }) => {
    await page.goto('/?v=1&c=-1.3107026413368328,0&s=0.05&sel=mi-p4-02');
    await waitForStable(page);
    await expect(
      page
        .getByRole('region', { name: 'Point evidence' })
        .getByRole('heading', { name: 'Period-4 component 2' }),
    ).toBeVisible();
    await expect(page.getByRole('status', { name: 'Link notice' })).toHaveText('');
    await expect.poll(() => searchParam(page, 'sel'), { timeout: 10_000 }).toBe('mi-p4-6-9');
  });

  test('restores a selected point and inspects it again', async ({ page }) => {
    await page.goto('/?v=1&c=-0.75,0&s=2.5&view=stability&q=balanced&sel=-0.1,0.65');
    await expect(page.locator('#selected-point-status')).toContainText('Outcome:', {
      timeout: 10_000,
    });
    await expect(page.locator('.selected-point-marker')).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Point evidence' }).locator('.inspector__coordinate'),
    ).toHaveText('c = -0.1 + 0.65i');
    await expect(page.getByRole('status', { name: 'Link notice' })).toHaveText('');
  });

  test('falls back visibly from malformed fields and clamps an out-of-range zoom', async ({
    page,
  }) => {
    await page.goto('/?v=1&c=abc,0&s=2.5&view=sparkle&q=ultra&sel=mi-p9-nope');
    const notice = page.getByRole('status', { name: 'Link notice' });
    await expect(notice).toContainText(
      'This link was adjusted: the view position was not valid, so the full-set view is shown',
    );
    await expect(notice).toContainText('so nothing is selected.');
    await expect(page.getByLabel('Interior view')).toHaveValue('stability');
    await expect(page.getByLabel('Quality')).toHaveValue('balanced');
    await expect(page.getByRole('button', { name: /Reset/ })).toBeDisabled();
    await expect(page.locator('#selected-point-status')).toHaveText('No point selected.');
    await waitForStable(page);
    await expectNoAccessibilityViolations(page);
    // The view still equals the one the page opened with, so the link stays in the address.
    await page.waitForTimeout(1_500);
    expect(new URL(page.url()).search).toBe(
      '?v=1&c=abc,0&s=2.5&view=sparkle&q=ultra&sel=mi-p9-nope',
    );

    await page.getByRole('button', { name: 'Explore' }).click();
    await notice.getByRole('button', { name: 'Dismiss link notice' }).click();
    await expect(notice).toHaveText('');
    await expect(page.getByLabel('Interactive Mandelbrot set')).toBeFocused();

    await page.goto('/?v=1&c=-1.25,0&s=1e-12&view=multiplier');
    await expect(notice).toContainText('the nearest supported zoom is shown');
    await expect(page.getByLabel('Magnification')).toHaveText('6.00e6×');
    await expect(page.getByLabel('Interior view')).toHaveValue('multiplier');
    await expect(page.getByRole('button', { name: 'Zoom in' })).toBeDisabled();
  });

  test('keeps a refused link in the address bar until the view changes', async ({ page }) => {
    const refused = '?v=2&c=-1,0&s=0.5&view=period&q=quick';
    await page.goto(`/${refused}`);
    await expect(page.getByRole('status', { name: 'Link notice' })).toContainText(
      'format version 2',
    );
    await waitForStable(page);
    await page.waitForTimeout(1_500);
    expect(new URL(page.url()).search).toBe(refused);

    await page.getByRole('button', { name: 'Explore' }).click();
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await expect.poll(() => searchParam(page, 'v')).toBe('1');
    expect(searchParam(page, 'c')).not.toBeNull();
  });

  test('refuses an unknown or missing version with a notice instead of guessing', async ({
    page,
  }) => {
    const notice = page.getByRole('status', { name: 'Link notice' });
    for (const [search, message] of [
      [
        '/?v=2&c=-1,0&s=0.5&view=period&q=quick',
        'This link uses format version 2, which this explorer does not read.',
      ],
      ['/?v=0&c=-1,0&s=0.5', 'This link uses format version 0, which this explorer does not read.'],
      ['/?c=-1,0&s=0.5&view=period', 'This link has no format version, so it was not applied.'],
    ] as const) {
      await page.goto(search);
      await expect(notice).toContainText(message);
      await expect(notice).toContainText('Opening the default full-set view instead.');
      await expect(page.getByLabel('Interior view')).toHaveValue('stability');
      await expect(page.getByLabel('Quality')).toHaveValue('balanced');
      await expect(page.getByRole('button', { name: /Reset/ })).toBeDisabled();
    }
  });

  test('copies a link to the current view from the keyboard and announces it', async ({
    page,
    context,
  }) => {
    await page.addInitScript(() => {
      const copied: string[] = [];
      Object.defineProperty(window, '__copiedLinks', { value: copied });
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: (text: string): Promise<void> => {
            copied.push(text);
            return Promise.resolve();
          },
        },
      });
    });
    await page.goto('/?perf=1');
    await page.getByRole('button', { name: 'Explore' }).click();
    await waitForStable(page);
    await page.getByLabel('Interior view').selectOption('multiplier');
    const canvas = page.getByLabel('Interactive Mandelbrot set');
    await canvas.focus();
    await canvas.press('+');
    await waitForStable(page);

    const copy = page.getByRole('button', { name: 'Copy link to this view' });
    await copy.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status', { name: 'Interaction feedback' })).toHaveText(
      'Link to this view copied.',
    );
    const copied = await page.evaluate(
      () => (window as unknown as { __copiedLinks: string[] }).__copiedLinks,
    );
    expect(copied).toHaveLength(1);
    const link = new URL(copied[0] ?? '');
    expect(link.searchParams.get('perf')).toBeNull();
    expect(link.searchParams.get('v')).toBe('1');
    expect(link.searchParams.get('view')).toBe('multiplier');

    const magnification = (await page.getByLabel('Magnification').textContent()) ?? '';
    const reopened = await context.newPage();
    await reopened.goto(link.toString());
    await waitForStable(reopened);
    await expect(reopened.getByLabel('Interior view')).toHaveValue('multiplier');
    await expect(reopened.getByLabel('Magnification')).toHaveText(magnification);
  });

  test('explains a failed copy and puts the link in the address bar', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: (): Promise<void> => Promise.reject(new Error('denied')) },
      });
      // Suppress the settled address-bar writer (its 500 ms timer), so any
      // write in this test can only come from the failed-copy fallback.
      const nativeSetTimeout = window.setTimeout.bind(window);
      window.setTimeout = ((handler: TimerHandler, delay?: number, ...rest: unknown[]) =>
        nativeSetTimeout(
          delay === 500 ? () => undefined : handler,
          delay,
          ...rest,
        )) as typeof setTimeout;
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Explore' }).click();
    await waitForStable(page);
    await page.getByRole('button', { name: 'Zoom in' }).click();
    expect(searchParam(page, 'v')).toBeNull();
    await page.getByRole('button', { name: 'Copy link to this view' }).click();
    await expect(page.getByRole('status', { name: 'Interaction feedback' })).toHaveText(
      'Could not copy automatically. The address bar now shows the link to this view.',
    );
    expect(searchParam(page, 'v')).toBe('1');
  });

  test('keeps the link notice and copy control usable in forced colors at 320 px', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.emulateMedia({ forcedColors: 'active' });
    await page.goto('/?v=9');
    await page.getByRole('button', { name: 'Explore', exact: true }).click();
    const notice = page.getByRole('status', { name: 'Link notice' });
    await expect(notice).toContainText('This link uses format version 9');
    await expect(notice).toHaveCSS('border-top-style', 'solid');
    // Non-colour cue: the thick leading edge survives forced colours.
    expect(
      await notice.evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).borderLeftWidth),
      ),
    ).toBeGreaterThanOrEqual(4);
    await expectNoHorizontalOverflow(page, '320 px link notice');

    const copy = page.getByRole('button', { name: 'Copy link to this view' });
    for (const target of [notice.getByRole('button', { name: 'Dismiss link notice' }), copy]) {
      const box = await target.boundingBox();
      expect(box).not.toBeNull();
      if (box) {
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(320);
      }
    }

    for (let step = 0; step < 20; step += 1) {
      if (await copy.evaluate((element) => element === document.activeElement)) break;
      await page.keyboard.press('Tab');
    }
    await expect(copy).toBeFocused();
    await expect
      .poll(() => copy.evaluate((element) => element.matches(':focus-visible')))
      .toBe(true);
    const focusStyle = await copy.evaluate((element) => {
      const style = getComputedStyle(element);
      return { style: style.outlineStyle, width: Number.parseFloat(style.outlineWidth) };
    });
    expect(focusStyle.style).not.toBe('none');
    expect(focusStyle.width).toBeGreaterThanOrEqual(3);
  });

  test('keeps the benchmark harness view and quality parameters working', async ({ page }) => {
    await page.goto('/?view=-1,0,0.5&quality=quick');
    await expect(page.getByLabel('Quality')).toHaveValue('quick');
    await expect(page.getByLabel('Magnification')).toHaveText('5.00×');
    await expect(page.getByRole('status', { name: 'Link notice' })).toHaveText('');
    await waitForStable(page);
    await expect.poll(() => searchParam(page, 'v')).toBe('1');
    expect(searchParam(page, 'q')).toBe('quick');
    expect(searchParam(page, 'quality')).toBeNull();
  });
});

test.describe('Catalog panel (MI-UX-020)', () => {
  const ENTRY_ORDER = [
    'Main cardioid',
    'Period-2 bulb',
    'Douady rabbit',
    'Airplane',
    'Co-rabbit',
    'Period-4 component 6',
    'Period-4 component 4',
    'Period-4 component 2',
    'Period-4 component 1',
    'Period-4 component 3',
    'Period-4 component 5',
  ];

  const openExplorer = async (page: Page): Promise<void> => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Explore', exact: true }).click();
    await expect(page.locator('#explorer')).toHaveAttribute('data-render-stage', 'stable', {
      timeout: 20_000,
    });
  };

  test('zooms to an entry and selects it from the keyboard', async ({ page }) => {
    await openExplorer(page);
    const panel = page.getByRole('region', { name: 'Catalog' });
    const airplane = panel.getByRole('button', { name: 'Airplane', exact: true });
    await airplane.focus();
    await airplane.press('Enter');

    // zoomSpanFor: 2.5 × the size estimate 0.019036, so 2.5 / 0.047589 ≈ 53×.
    await expect(page.getByLabel('Magnification')).toHaveText('53×');
    await expect(page.getByText('Zoomed to Airplane.')).toBeVisible();
    await expect(airplane).toBeFocused();
    await expect(airplane).toHaveAttribute('aria-current', 'true');
    const pointEvidence = page.getByRole('region', { name: 'Point evidence' });
    await expect(pointEvidence.getByRole('heading', { name: 'Airplane' })).toBeVisible();
    await expect(pointEvidence.locator('.inspector__annotation')).toHaveText(
      "The period-3 component on the real axis, the main cardioid of a small copy of the Mandelbrot set; along the real line it is the logistic map's period-3 window. Rays 3/7 and 4/7 land at its cusp, c = −7/4.",
    );
    await expect(page.locator('#explorer')).toHaveAttribute('data-render-stage', 'stable', {
      timeout: 20_000,
    });
    await expect(page.getByRole('button', { name: 'Inspect Airplane, period 3' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    await expect
      .poll(() => new URL(page.url()).searchParams.get('sel'), { timeout: 10_000 })
      .toBe('mi-p3-3-4');

    // A placeholder entry has no annotation, so the inspector shows none.
    await panel.getByRole('button', { name: 'Period-4 component 2', exact: true }).click();
    await expect(
      pointEvidence.getByRole('heading', { name: 'Period-4 component 2' }),
    ).toBeVisible();
    await expect(pointEvidence.locator('.inspector__annotation')).toHaveCount(0);
  });

  test('reaches every entry by Tab, grouped by period in catalog order', async ({ page }) => {
    await openExplorer(page);
    const panel = page.getByRole('region', { name: 'Catalog' });
    await panel.locator('summary').first().focus();
    const visited: string[] = [];
    for (let step = 0; step < 40; step += 1) {
      const focused = await page.evaluate(() => {
        const active = document.activeElement;
        if (!active?.closest('.catalog-panel')) return undefined;
        return `${active.tagName.toLowerCase()}:${active.textContent}`;
      });
      // The last stop repeats in Firefox, where Tab then leaves the document.
      if (focused === undefined || focused === visited.at(-1)) break;
      visited.push(focused);
      await page.keyboard.press('Tab');
    }
    expect(visited).toEqual([
      'summary:Period 11 component',
      'button:Main cardioid',
      'summary:Period 21 component',
      'button:Period-2 bulb',
      'summary:Period 33 components',
      ...ENTRY_ORDER.slice(2, 5).map((label) => `button:${label}`),
      'summary:Period 46 components',
      ...ENTRY_ORDER.slice(5).map((label) => `button:${label}`),
      'summary:About periods, rays and addresses',
    ]);
  });

  test('opens and closes a period group from the keyboard', async ({ page }) => {
    await openExplorer(page);
    const panel = page.getByRole('region', { name: 'Catalog' });
    const group = panel.locator('details.catalog-group').nth(3);
    const entry = panel.getByRole('button', { name: 'Period-4 component 2', exact: true });
    await expect(entry).toBeVisible();
    await group.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(entry).toBeHidden();
    await page.keyboard.press('Enter');
    await expect(entry).toBeVisible();
  });

  test('marks a marker selection in the list, opening its group, and Reset clears it', async ({
    page,
  }) => {
    await openExplorer(page);
    const panel = page.getByRole('region', { name: 'Catalog' });
    const group = panel.locator('details.catalog-group').nth(2);
    await group.locator('summary').click();
    await expect(group).not.toHaveAttribute('open');

    await page.getByRole('button', { name: 'Inspect Douady rabbit, period 3' }).click();
    const rabbit = panel.getByRole('button', { name: 'Douady rabbit', exact: true });
    await expect(group).toHaveAttribute('open');
    await expect(rabbit).toHaveAttribute('aria-current', 'true');
    await expect(panel.locator('[aria-current="true"]')).toHaveCount(1);

    // Reset is enabled only away from the default view.
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await page.getByRole('button', { name: 'Reset' }).click();
    await expect(panel.locator('[aria-current="true"]')).toHaveCount(0);
  });

  test('marks the entry a shared link selects, also by a v1 alias', async ({ page }) => {
    await page.goto('/?v=1&c=-1.3107026413368328,0&s=0.05&sel=mi-p4-02');
    const panel = page.getByRole('region', { name: 'Catalog' });
    await expect(
      panel.getByRole('button', { name: 'Period-4 component 2', exact: true }),
    ).toHaveAttribute('aria-current', 'true');
    await expect(panel.locator('[aria-current="true"]')).toHaveCount(1);
  });

  test('has no automated WCAG violations with an entry selected and the glossary open', async ({
    page,
  }) => {
    await openExplorer(page);
    const panel = page.getByRole('region', { name: 'Catalog' });
    await panel.getByText('About periods, rays and addresses').click();
    await expect(panel.getByText('Angled internal address', { exact: true })).toBeVisible();
    await panel.getByRole('button', { name: 'Douady rabbit', exact: true }).click();
    await expect(page.locator('#explorer')).toHaveAttribute('data-render-stage', 'stable', {
      timeout: 20_000,
    });
    await expectNoAccessibilityViolations(page);
  });

  test('marks the selected entry and focus without colour in forced colours', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await openExplorer(page);
    const panel = page.getByRole('region', { name: 'Catalog' });
    const rabbit = panel.getByRole('button', { name: 'Douady rabbit', exact: true });
    await rabbit.click();
    await expect(rabbit).toHaveAttribute('aria-current', 'true');
    const cue = await rabbit.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        edge: Number.parseFloat(style.borderLeftWidth),
        weight: Number.parseInt(style.fontWeight, 10),
      };
    });
    expect(cue.edge).toBeGreaterThanOrEqual(4);
    expect(cue.weight).toBeGreaterThanOrEqual(700);

    // Keyboard focus draws a forced-colours outline on entries and on group toggles.
    const summary = panel.locator('summary').first();
    const entry = panel.getByRole('button', { name: 'Main cardioid', exact: true });
    await summary.focus();
    await page.keyboard.press('Tab');
    await expect(entry).toBeFocused();
    await expect
      .poll(() => entry.evaluate((element) => element.matches(':focus-visible')))
      .toBe(true);
    expect(await entry.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe(
      'none',
    );
    await page.keyboard.press('Shift+Tab');
    await expect(summary).toBeFocused();
    expect(await summary.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe(
      'none',
    );
    await expectNoAccessibilityViolations(page);
  });

  test('reflows below the canvas at 320 px with full-size entries', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await openExplorer(page);
    const panel = page.getByRole('region', { name: 'Catalog' });
    await panel.getByText('About periods, rays and addresses').click();
    await expectNoHorizontalOverflow(page, '320 px catalog panel');
    const canvas = await page.locator('.explorer__stack').boundingBox();
    const panelBox = await panel.boundingBox();
    if (!canvas || !panelBox) throw new Error('canvas or panel has no box');
    expect(canvas.width / canvas.height).toBeGreaterThan(1.3);
    expect(panelBox.y).toBeGreaterThanOrEqual(canvas.y + canvas.height);
    expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(320);
    const entries = await panel.locator('.catalog-entry').evaluateAll((buttons) =>
      buttons.map((entry) => {
        const { right, height } = entry.getBoundingClientRect();
        return { right, height };
      }),
    );
    const glossaryHeight = await panel
      .locator('.catalog-glossary summary')
      .evaluate((summary) => summary.getBoundingClientRect().height);
    expect(glossaryHeight).toBeGreaterThanOrEqual(44);
    // display: list-item keeps the native disclosure triangle (flex would remove it).
    await expect(panel.locator('.catalog-glossary summary')).toHaveCSS('display', 'list-item');
    expect(entries).toHaveLength(11);
    for (const entry of entries) {
      expect(entry.height).toBeGreaterThanOrEqual(44);
      expect(entry.right).toBeLessThanOrEqual(320);
    }
    await expectNoAccessibilityViolations(page);
  });
});
