import { describe, expect, it, vi } from 'vitest';

import {
  computedPrefixRows,
  createViewportTransform,
  DEFAULT_VIEWPORT,
  OrbitClassifier,
  planConjugateMirror,
  type RenderQuality,
  type SemanticView,
  type Viewport,
} from '../../../src/domain';
import {
  CpuRenderer,
  RenderCancelledError,
  semanticRequestKey,
  type DynamicsRenderRequest,
  type SemanticBand,
  type SemanticFrame,
  type TilePool,
} from '../../../src/render';
import { parseBenchmarkParams } from '../../../src/ui/benchmark-params';
import { classifyRows } from '../../../src/render/classify-rows';
import { createTileHandler } from '../../../src/worker/tile-handler';
import { createTilePool } from '../../../src/worker/tile-pool';
import type {
  SupervisorToTileMessage,
  TileClassifyMessage,
  TileMessageEvent,
  TileWorkerHandle,
} from '../../../src/worker/tile-protocol';

const BALANCED: RenderQuality = { maxIterations: 512, maxPeriod: 32, coarseStride: 8 };
const SEMANTIC_VIEWS: readonly SemanticView[] = ['period', 'multiplier', 'stability'];

interface NamedView {
  readonly name: string;
  readonly viewport: Viewport;
  readonly size: { readonly width: number; readonly height: number };
  /** Expected mirrored rows (undefined = do not assert an exact count). */
  readonly mirroredRows?: number;
}

/**
 * Views chosen so the exactness argument is exercised in every regime:
 * centered on the axis (full pair coverage, odd and even heights), center.im
 * !== 0 with exactly representable arithmetic (partial pair coverage), and
 * views that do not contain the axis (no pairs).
 */
const VIEWS: readonly NamedView[] = [
  {
    name: 'full set (default view)',
    viewport: { center: { re: -0.75, im: 0 }, spanY: 2.5 },
    size: { width: 96, height: 64 },
    mirroredRows: 32,
  },
  {
    name: 'full set, odd height (self-conjugate row present)',
    viewport: { center: { re: -0.75, im: 0 }, spanY: 2.5 },
    size: { width: 80, height: 51 },
    mirroredRows: 25,
  },
  {
    name: 'period-2 bulb region on the axis',
    viewport: { center: { re: -1, im: 0 }, spanY: 0.3 },
    size: { width: 96, height: 64 },
    mirroredRows: 32,
  },
  {
    name: 'period-3 window on the axis',
    viewport: { center: { re: -1.75, im: 0 }, spanY: 0.1 },
    size: { width: 96, height: 64 },
    mirroredRows: 32,
  },
  {
    // u = 0.5 / 64 = 2^-7 and center.im = 3 * 2^-7 are exact, so rows
    // y + y' = 69 pair exactly while rows 0..5 have no partner.
    name: 'straddles the axis asymmetrically (partial exact pairs)',
    viewport: { center: { re: -0.75, im: 3 / 128 }, spanY: 0.5 },
    size: { width: 96, height: 64 },
  },
  {
    name: 'straddles the axis asymmetrically (inexact center, any pairs are exact)',
    viewport: { center: { re: 0.1, im: 0.05 }, spanY: 0.2 },
    size: { width: 96, height: 64 },
  },
  {
    name: 'does not contain the axis',
    viewport: { center: { re: -0.75, im: 1 }, spanY: 0.5 },
    size: { width: 96, height: 64 },
    mirroredRows: 0,
  },
];

/** First index where two typed arrays differ bitwise-ish (Object.is), or -1. */
const firstMismatch = (a: ArrayLike<number>, b: ArrayLike<number>): number => {
  if (a.length !== b.length) return 0;
  for (let index = 0; index < a.length; index += 1) {
    if (!Object.is(a[index], b[index])) return index;
  }
  return -1;
};

const stableFrame = async (
  request: DynamicsRenderRequest,
  renderer: CpuRenderer = new CpuRenderer(),
): Promise<SemanticFrame> => {
  const frames: SemanticFrame[] = [];
  await renderer.render(request, new AbortController().signal, (frame) => {
    frames.push(frame);
  });
  const stable = frames.find((frame) => frame.stage === 'stable');
  if (stable === undefined) throw new Error('no stable frame');
  return stable;
};

const expectFramesIdentical = (mirrored: SemanticFrame, direct: SemanticFrame): void => {
  expect(mirrored.bands.length).toBe(direct.bands.length);
  mirrored.bands.forEach((band: SemanticBand, index) => {
    const reference = direct.bands[index]!;
    expect(band.y0).toBe(reference.y0);
    expect(band.y1).toBe(reference.y1);
    expect(firstMismatch(band.packedStatusPeriod, reference.packedStatusPeriod)).toBe(-1);
    expect(
      firstMismatch(
        band.smoothIterationOrMultiplierMagnitude,
        reference.smoothIterationOrMultiplierMagnitude,
      ),
    ).toBe(-1);
    expect(firstMismatch(band.multiplierAngle, reference.multiplierAngle)).toBe(-1);
  });
};

/** In-process stand-in for a tile worker: runs the production tile handler. */
class LoopbackTileWorker implements TileWorkerHandle {
  public readonly classifyPosts: TileClassifyMessage[] = [];
  /** Snapshots of each band result's packed words taken at post time (before any supervisor fill). */
  public readonly postedBands: { y0: number; y1: number; packed: Uint32Array }[] = [];
  readonly #listeners = new Set<(event: TileMessageEvent) => void>();
  readonly #handle = createTileHandler({
    postMessage: (message) => {
      if (message.type === 'tile-result') {
        this.postedBands.push({
          y0: message.y0,
          y1: message.y1,
          packed: message.packedStatusPeriod.slice(),
        });
      }
      queueMicrotask(() => {
        for (const listener of this.#listeners) listener({ data: message });
      });
    },
  });

  public postMessage(message: SupervisorToTileMessage): void {
    if (message.type === 'tile-classify') this.classifyPosts.push(message);
    void this.#handle(message);
  }

  public addEventListener(_type: 'message', listener: (event: TileMessageEvent) => void): void {
    this.#listeners.add(listener);
  }

  public removeEventListener(_type: 'message', listener: (event: TileMessageEvent) => void): void {
    this.#listeners.delete(listener);
  }

  public terminate(): void {
    this.#listeners.clear();
  }
}

const loopbackPool = (workerCount: number): { pool: TilePool; workers: LoopbackTileWorker[] } => {
  const workers: LoopbackTileWorker[] = [];
  const pool = createTilePool({
    workerCount,
    factory: () => {
      const worker = new LoopbackTileWorker();
      workers.push(worker);
      return worker;
    },
  });
  return { pool, workers };
};

describe('planConjugateMirror: the exact-conjugate pixel-center property', () => {
  it('conjugatePixelCenters_axisCentered_rowsMirrorAreExactNegations', () => {
    const cases: readonly (readonly [number, number, number, number])[] = [
      // width, height, center.re, spanY
      [1024, 640, -0.75, 2.5],
      [1024, 640, -1.25, 0.00000041666666666666667],
      [768, 768, -1.401155189092, 0.001],
      [51, 51, 0.3, 0.1],
      [7, 8, -0.7436438870371587, 0.01984126984126984],
      [33, 1023, 2.5, 3.999999],
      [5, 6, 0, 2.5 / 6_000_000],
    ];
    for (const [width, height, re, spanY] of cases) {
      const transform = createViewportTransform(
        { center: { re, im: 0 }, spanY },
        { width, height },
      );
      for (const x of [0, Math.floor(width / 2), width - 1]) {
        for (let y = 0; y < height; y += 1) {
          const a = transform.pixelToComplex(x, y);
          const b = transform.pixelToComplex(x, height - 1 - y);
          expect(b.re).toBe(a.re);
          // Exact binary64 negation (Object.is so +0/-0 would be caught too,
          // except the self-conjugate row where both are the same pixel).
          if (y === height - 1 - y) {
            expect(a.im).toBe(0);
          } else {
            expect(Object.is(b.im, -a.im)).toBe(true);
          }
        }
      }
      const plan = planConjugateMirror({ center: { re, im: 0 }, spanY }, { width, height });
      expect(plan?.mirroredRows).toBe(Math.floor(height / 2));
      for (let y = 0; y < height; y += 1) {
        const mirrorSource = plan?.sourceRow[y];
        // The lower index of each pair is the computed source.
        expect(mirrorSource).toBe(y > height - 1 - y ? height - 1 - y : -1);
      }
    }
  });

  it('conjugatePixelCenters_imaginaryIsColumnIndependentAndRealRowIndependent', () => {
    const size = { width: 37, height: 29 };
    const viewport: Viewport = { center: { re: -0.123456789, im: 0.00375 }, spanY: 0.07 };
    const transform = createViewportTransform(viewport, size);
    for (let y = 0; y < size.height; y += 1) {
      for (let x = 0; x < size.width; x += 1) {
        expect(transform.pixelToComplex(x, y).im).toBe(transform.pixelToComplex(0, y).im);
        expect(transform.pixelToComplex(x, y).re).toBe(transform.pixelToComplex(x, 0).re);
      }
    }
  });

  it('conjugatePixelCenters_neverMirrorsAnInexactPair_fuzz', () => {
    // Deterministic LCG; arbitrary centers (mostly NOT symmetric) and sizes.
    let state = 0x2545f491;
    const next = (): number => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 0x100000000;
    };
    let mirroredViews = 0;
    for (let trial = 0; trial < 400; trial += 1) {
      const spanY = 10 ** (-6 + 6 * next()) * 0.5;
      const height = 2 + Math.floor(next() * 90);
      const width = 3;
      // A third of trials pin center.im to 0; a third to a multiple of the
      // pixel pitch; the rest are arbitrary reals near the axis.
      const pitch = spanY / height;
      const mode = trial % 3;
      const im =
        mode === 0
          ? 0
          : mode === 1
            ? Math.round((next() - 0.5) * 20) * pitch
            : (next() - 0.5) * spanY;
      const viewport: Viewport = { center: { re: next() * 2 - 1, im }, spanY };
      const size = { width, height };
      const plan = planConjugateMirror(viewport, size);
      if (plan === undefined) continue;
      mirroredViews += 1;
      const transform = createViewportTransform(viewport, size);
      for (let y = 0; y < height; y += 1) {
        const source = plan.sourceRow[y]!;
        if (source < 0) continue;
        expect(source).toBeLessThan(y);
        expect(plan.sourceRow[source]).toBe(-1);
        for (let x = 0; x < width; x += 1) {
          const dest = transform.pixelToComplex(x, y);
          const src = transform.pixelToComplex(x, source);
          expect(dest.re).toBe(src.re);
          expect(dest.im).toBe(-src.im);
          expect(dest.im).not.toBe(0);
        }
      }
    }
    expect(mirroredViews).toBeGreaterThan(100);
  });

  it('conjugatePixelCenters_partialPairsOnlyWhereArithmeticIsExact', () => {
    const plan = planConjugateMirror(
      { center: { re: -0.75, im: 3 / 128 }, spanY: 0.5 },
      { width: 4, height: 64 },
    );
    expect(plan).toBeDefined();
    // y + y' = 69: rows 0..5 have no partner, rows 6..34 are computed and
    // rows 35..63 copy from 69 - y.
    for (let y = 0; y < 64; y += 1) {
      const expected = y >= 35 ? 69 - y : -1;
      expect(plan!.sourceRow[y]).toBe(expected);
    }
  });

  it('conjugatePixelCenters_viewWithoutAxisHasNoPlan', () => {
    expect(
      planConjugateMirror({ center: { re: -0.75, im: 1 }, spanY: 0.5 }, { width: 8, height: 8 }),
    ).toBeUndefined();
    expect(
      planConjugateMirror({ center: { re: -0.75, im: 0 }, spanY: 0.5 }, { width: 8, height: 1 }),
    ).toBeUndefined();
  });
});

describe('conjugate mirroring: bitwise semantic parity', () => {
  for (const view of VIEWS) {
    it(`parity_cpuRenderer_${view.name}`, async () => {
      const plan = planConjugateMirror(view.viewport, view.size);
      if (view.mirroredRows !== undefined) {
        expect(plan?.mirroredRows ?? 0).toBe(view.mirroredRows);
      } else {
        expect(plan?.mirroredRows ?? 0).toBeGreaterThan(0);
      }
      const base: DynamicsRenderRequest = {
        viewport: view.viewport,
        size: view.size,
        quality: BALANCED,
      };
      const renderer = new CpuRenderer();
      const direct = await stableFrame(base, renderer);
      const mirrored = await stableFrame({ ...base, conjugateMirror: true }, renderer);
      expectFramesIdentical(mirrored, direct);
      for (const semanticView of SEMANTIC_VIEWS) {
        const a = renderer.colorize(mirrored, semanticView).rgba;
        const b = renderer.colorize(direct, semanticView).rgba;
        expect(firstMismatch(a, b)).toBe(-1);
      }
    });
  }

  it('parity_checkpointClassifierMode', async () => {
    const view = VIEWS[0]!;
    const base: DynamicsRenderRequest = {
      viewport: view.viewport,
      size: view.size,
      quality: BALANCED,
      classifierMode: 'checkpoint',
    };
    const direct = await stableFrame(base);
    const mirrored = await stableFrame({ ...base, conjugateMirror: true });
    expectFramesIdentical(mirrored, direct);
  });

  it('parity_perfCountersCountOnlyComputedRows', async () => {
    const view = VIEWS[0]!;
    const base: DynamicsRenderRequest = {
      viewport: view.viewport,
      size: view.size,
      quality: BALANCED,
      perfCounters: true,
    };
    const direct = await stableFrame(base);
    const mirrored = await stableFrame({ ...base, conjugateMirror: true });
    expectFramesIdentical(mirrored, direct);
    const total = (frame: SemanticFrame): number =>
      frame.counters!.escaped + frame.counters!.attracting + frame.counters!.unresolved;
    expect(total(direct)).toBe(view.size.width * view.size.height);
    expect(total(mirrored)).toBe(view.size.width * (view.size.height / 2));
  });

  const flatten = (frame: SemanticFrame, size: { width: number; height: number }): SemanticBand => {
    const length = size.width * size.height;
    const out = {
      y0: 0,
      y1: size.height,
      packedStatusPeriod: new Uint32Array(length),
      smoothIterationOrMultiplierMagnitude: new Float64Array(length),
      multiplierAngle: new Float64Array(length),
    };
    for (const band of frame.bands) {
      const offset = band.y0 * size.width;
      out.packedStatusPeriod.set(band.packedStatusPeriod, offset);
      out.smoothIterationOrMultiplierMagnitude.set(
        band.smoothIterationOrMultiplierMagnitude,
        offset,
      );
      out.multiplierAngle.set(band.multiplierAngle, offset);
    }
    return out;
  };

  const comparePoolWithDirect = async (
    viewport: Viewport,
    size: { width: number; height: number },
    workerCount: number,
  ): Promise<{ workers: LoopbackTileWorker[]; frame: SemanticFrame }> => {
    const base: DynamicsRenderRequest = { viewport, size, quality: BALANCED };
    const direct = await stableFrame(base);
    const { pool, workers } = loopbackPool(workerCount);
    const frame = await pool.classifyStable(
      { ...base, conjugateMirror: true },
      BALANCED,
      new AbortController().signal,
    );
    pool.dispose();
    expectFramesIdentical(
      { ...frame, bands: [flatten(frame, size)] },
      { ...direct, bands: [flatten(direct, size)] },
    );
    return { workers, frame };
  };

  // Scheduling reused from PR #15 (138a31b): bands cover only the ceil(h/2)
  // computed rows; the mirrored tail is filled by the supervisor.
  it.each([
    { height: 1, im: 0 },
    { height: 3, im: 0 },
    { height: 8, im: 0 },
    { height: 9, im: 0 },
    { height: 9, im: 0.74 },
  ])('parity_tilePool_prefixScheduling_height$height_im$im', async ({ height, im }) => {
    const size = { width: 24, height };
    const { workers, frame } = await comparePoolWithDirect(
      { center: { re: -0.12, im }, spanY: 0.35 },
      size,
      4,
    );
    const posts = workers.flatMap((worker) => worker.classifyPosts);
    const rows = im === 0 ? Math.ceil(height / 2) : height;
    expect(posts.reduce((sum, post) => sum + post.y1 - post.y0, 0)).toBe(rows);
    expect(posts.every((post) => post.y1 <= rows)).toBe(true);
    // Workers never see mirrored rows in prefix mode, so no flag is sent.
    for (const post of posts) expect(post).not.toHaveProperty('conjugateMirror');
    // Dispatched bands plus one undispatched mirror tail band.
    expect(frame.bands.length).toBe(posts.length + (rows < height ? 1 : 0));
  });

  for (const view of [VIEWS[0]!, VIEWS[2]!, VIEWS[4]!]) {
    for (const workerCount of [2, 3]) {
      it(`parity_tilePool_${workerCount}workers_${view.name}`, async () => {
        const { workers } = await comparePoolWithDirect(view.viewport, view.size, workerCount);
        const plan = planConjugateMirror(view.viewport, view.size)!;
        const R = computedPrefixRows(plan)!;
        const posts = workers.flatMap((worker) => worker.classifyPosts);
        expect(posts.reduce((sum, post) => sum + post.y1 - post.y0, 0)).toBe(R);
        expect(R).toBe(view.size.height - plan.mirroredRows);
      });
    }
  }

  it('parity_tilePool_inPlaceFallback_unpairedRowsAtBottom', async () => {
    // center.im = -3/128: pairs y + y' = 57, rows 58..63 have no partner, so
    // the computed rows are NOT a prefix and every band is dispatched; the
    // workers (told via the flag) skip their mirrored rows in place.
    const viewport: Viewport = { center: { re: -0.75, im: -3 / 128 }, spanY: 0.5 };
    const size = { width: 96, height: 64 };
    const plan = planConjugateMirror(viewport, size)!;
    expect(plan.mirroredRows).toBeGreaterThan(0);
    expect(computedPrefixRows(plan)).toBeUndefined();
    const { workers } = await comparePoolWithDirect(viewport, size, 3);
    const posts = workers.flatMap((worker) => worker.classifyPosts);
    expect(posts.reduce((sum, post) => sum + post.y1 - post.y0, 0)).toBe(size.height);
    for (const post of posts) expect(post.conjugateMirror).toBe(true);
    // Result words captured at post time (before any supervisor fill): the
    // workers computed every non-mirrored row and wrote no mirrored row.
    let skipped = 0;
    for (const worker of workers) {
      for (const posted of worker.postedBands) {
        for (let y = posted.y0; y < posted.y1; y += 1) {
          const row = posted.packed.subarray(
            (y - posted.y0) * size.width,
            (y - posted.y0 + 1) * size.width,
          );
          if (plan.sourceRow[y]! < 0) {
            expect(row.every((word) => word !== 0)).toBe(true);
          } else {
            expect(row.every((word) => word === 0)).toBe(true);
            skipped += 1;
          }
        }
      }
    }
    expect(skipped).toBe(plan.mirroredRows);
  });

  it.each([1, 8, 9])('classifyRows_classifiesOnlyTheUpperHalf_height%i', async (height) => {
    const classify = vi.spyOn(OrbitClassifier.prototype, 'classifyInto');
    try {
      const size = { width: 7, height };
      const viewport = DEFAULT_VIEWPORT;
      const plan = planConjugateMirror(viewport, size);
      await classifyRows(
        { viewport, size, quality: BALANCED },
        BALANCED,
        1,
        0,
        height,
        new AbortController().signal,
        undefined,
        undefined,
        undefined,
        false,
        plan,
      );
      expect(classify).toHaveBeenCalledTimes(7 * Math.ceil(height / 2));
    } finally {
      classify.mockRestore();
    }
  });
});

describe('conjugate mirroring: signed zero in deep on-axis cardioid views', () => {
  // The multiplier angle of an attracting pixel with a real multiplier is
  // +0 or -0 depending on the sign of the imaginary zero, and the copy must
  // reproduce that sign exactly (Object.is), not just the magnitude.
  it.each([0.1, 0.2])('parity_deepOnAxisCardioid_re%s_angleSignOfZeroMatchesDirect', async (re) => {
    const viewport: Viewport = { center: { re, im: 0 }, spanY: 4e-7 };
    const size = { width: 6, height: 1000 };
    const plan = planConjugateMirror(viewport, size);
    expect(plan?.mirroredRows).toBe(500);
    const base: DynamicsRenderRequest = { viewport, size, quality: BALANCED };
    const direct = await stableFrame(base);
    const mirrored = await stableFrame({ ...base, conjugateMirror: true });
    expectFramesIdentical(mirrored, direct);
  });
});

describe('conjugate mirroring: experiment flag defaults OFF', () => {
  it('flagDefault_queryParserOmitsTheFlag', () => {
    expect(parseBenchmarkParams('').conjugateMirror).toBeUndefined();
    expect(
      parseBenchmarkParams('?perf=1&classifierMode=checkpoint').conjugateMirror,
    ).toBeUndefined();
    expect(parseBenchmarkParams('?conjugateMirror=0').conjugateMirror).toBeUndefined();
    expect(parseBenchmarkParams('?conjugateMirror=true').conjugateMirror).toBeUndefined();
    expect(parseBenchmarkParams('?conjugateMirror=1').conjugateMirror).toBeUndefined();
    expect(parseBenchmarkParams('?perf=0&conjugateMirror=1').conjugateMirror).toBeUndefined();
    expect(parseBenchmarkParams('?perf=1&conjugateMirror=1').conjugateMirror).toBe(true);
    expect(Object.keys(parseBenchmarkParams(''))).toEqual(['perfEnabled']);
  });

  it('flagDefault_semanticKeyUnchangedUnlessEnabled', () => {
    const base: DynamicsRenderRequest = {
      viewport: VIEWS[0]!.viewport,
      size: VIEWS[0]!.size,
      quality: BALANCED,
    };
    const key = semanticRequestKey(base);
    expect(semanticRequestKey({ ...base, conjugateMirror: false })).toBe(key);
    expect(semanticRequestKey({ ...base, conjugateMirror: true })).not.toBe(key);
    expect(key).not.toContain('cj:');
  });

  it('flagDefault_tileMessagesCarryNoMirrorFieldAndWorkersComputeEveryRow', async () => {
    const view = VIEWS[0]!;
    const { pool, workers } = loopbackPool(2);
    const frame = await pool.classifyStable(
      { viewport: view.viewport, size: view.size, quality: BALANCED },
      BALANCED,
      new AbortController().signal,
    );
    pool.dispose();
    const posts = workers.flatMap((worker) => worker.classifyPosts);
    expect(posts.length).toBeGreaterThan(0);
    for (const post of posts) expect(post).not.toHaveProperty('conjugateMirror');
    // Every pixel was classified (a zero packed word is never valid).
    for (const band of frame.bands) {
      expect(band.packedStatusPeriod.every((word) => word !== 0)).toBe(true);
    }
  });

  it('flagDefault_flagWithoutPlanSendsNoMirrorFieldEither', async () => {
    const view = VIEWS[VIEWS.length - 1]!; // does not contain the axis
    const { pool, workers } = loopbackPool(2);
    await pool.classifyStable(
      { viewport: view.viewport, size: view.size, quality: BALANCED, conjugateMirror: true },
      BALANCED,
      new AbortController().signal,
    );
    pool.dispose();
    for (const post of workers.flatMap((worker) => worker.classifyPosts)) {
      expect(post).not.toHaveProperty('conjugateMirror');
    }
  });
});

describe('conjugate mirroring: cancellation', () => {
  it.each([2, 3])('cancelMidRender_%sWorkers_rejectsAndDeliversNoFrame', async (workerCount) => {
    const view = VIEWS[0]!;
    const controller = new AbortController();
    const workers: LoopbackTileWorker[] = [];
    const pool = createTilePool({
      workerCount,
      factory: () => {
        const worker = new LoopbackTileWorker();
        const original = worker.postMessage.bind(worker);
        // Abort as soon as the first band is dispatched, so the render is
        // cancelled while tiles are still in flight.
        worker.postMessage = (message: SupervisorToTileMessage): void => {
          original(message);
          if (message.type === 'tile-classify') controller.abort();
        };
        workers.push(worker);
        return worker;
      },
    });
    let delivered = 0;
    const frame = pool
      .classifyStable(
        { viewport: view.viewport, size: view.size, quality: BALANCED, conjugateMirror: true },
        BALANCED,
        controller.signal,
      )
      .then((result) => {
        delivered += 1;
        return result;
      });
    await expect(frame).rejects.toBeInstanceOf(RenderCancelledError);
    // Let the loopback workers reply; late results must not deliver a frame.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(delivered).toBe(0);
    expect(workers.length).toBe(workerCount);
    expect(workers.flatMap((worker) => worker.classifyPosts).length).toBeGreaterThan(0);
    pool.dispose();
  });
});
