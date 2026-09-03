import { describe, expect, it } from 'vitest';

import type { RenderQuality } from '../../../src/domain';
import { classifyRows } from '../../../src/render/classify-rows';
import { CpuRenderer } from '../../../src/render/cpu-renderer';
import { unpackStatus } from '../../../src/render/packed-semantic';
import type { PerfCounters } from '../../../src/render/perf-counters';
import type { SemanticFrame } from '../../../src/render';
import { createTilePool } from '../../../src/worker/tile-pool';
import type {
  SupervisorToTileMessage,
  TileClassifyMessage,
  TileMessageEvent,
  TileResultMessage,
  TileWorkerHandle,
} from '../../../src/worker/tile-protocol';

const BALANCED: RenderQuality = { maxIterations: 512, maxPeriod: 32, coarseStride: 8 };
const SMALL_QUALITY: RenderQuality = { maxIterations: 48, maxPeriod: 8, coarseStride: 8 };

const MAIN_CARDIOID_VIEWPORT = {
  center: { re: 0.1, im: 0.05 },
  spanY: 0.08,
};

const RABBIT_VIEWPORT = {
  center: { re: -0.1225611668766535, im: 0.7448617666197435 },
  spanY: 0.3,
};

// Exact decimal string per the corpus convention (binary64 literals must not
// round-trip the recorded view).
const SUPPLIED_126X_SPAN_Y = Number('0.019841269841269841269');

const classifyBand = async (
  viewport: { center: { re: number; im: number }; spanY: number },
  width: number,
  height: number,
  options: {
    classifierMode?: 'legacy-scan' | 'checkpoint' | 'differential';
    stride?: number;
    perfCounters?: boolean;
  } = {},
) =>
  classifyRows(
    { viewport, size: { width, height }, quality: BALANCED },
    BALANCED,
    options.stride ?? 1,
    0,
    height,
    new AbortController().signal,
    options.classifierMode,
    undefined,
    undefined,
    ...(options.perfCounters ? [true as const] : []),
  );

describe('classifyRows diagnostics counters (plan §8 opt-in)', () => {
  it('attaches no counters unless the caller opted in', async () => {
    const result = await classifyBand(MAIN_CARDIOID_VIEWPORT, 24, 16);
    expect('counters' in result).toBe(false);
    expect(result.counters).toBeUndefined();
  });

  it('produces correct totals on a small analytic raster (legacy-scan)', async () => {
    const width = 32;
    const height = 24;
    const result = await classifyBand(MAIN_CARDIOID_VIEWPORT, width, height, {
      perfCounters: true,
    });
    const counters = result.counters;
    expect(counters).toBeDefined();
    // The whole rect is inside the main cardioid: every pixel is an analytic
    // period-1 acceptance, so the scan never runs.
    expect(counters?.escaped).toBe(0);
    expect(counters?.attracting).toBe(width * height);
    expect(counters?.unresolved).toBe(0);
    expect(counters?.analyticPathHits).toBe(width * height);
    expect(counters?.lagComparisons).toBe(0);
    expect(counters?.systematic1to4).toBe(0);
  });

  it('aggregates checkpoint-mode counters from the kernel metrics', async () => {
    const width = 24;
    const height = 24;
    const result = await classifyBand(RABBIT_VIEWPORT, width, height, {
      classifierMode: 'checkpoint',
      perfCounters: true,
    });
    const counters = result.counters;
    expect(counters).toBeDefined();
    expect(
      (counters?.escaped ?? 0) + (counters?.attracting ?? 0) + (counters?.unresolved ?? 0),
    ).toBe(width * height);
    // The rabbit neighborhood exercises the walk schedule and its verifier.
    expect(counters?.lagComparisons).toBeGreaterThan(0);
    expect(counters?.systematic1to4).toBeGreaterThan(0);
  });

  it('counts stride-folded cells as classified cells on the coarse pass', async () => {
    const width = 32;
    const height = 24;
    const stride = 4;
    const cells = Math.ceil(height / stride) * Math.ceil(width / stride);
    const result = await classifyBand(MAIN_CARDIOID_VIEWPORT, width, height, {
      stride,
      perfCounters: true,
    });
    expect(result.counters?.attracting).toBe(cells);
    expect(result.counters?.unresolved).toBe(0);
  });

  it('status totals agree with the band words (cross-check on a mixed view)', async () => {
    const width = 48;
    const height = 32;
    const result = await classifyBand(
      { center: { re: -0.158902249, im: -1.034028 }, spanY: SUPPLIED_126X_SPAN_Y },
      width,
      height,
      { perfCounters: true },
    );
    const counters = result.counters;
    expect(counters).toBeDefined();
    let escaped = 0;
    let attracting = 0;
    let unresolved = 0;
    for (const word of result.packedStatusPeriod) {
      const status = unpackStatus(word);
      if (status === 1) escaped += 1;
      else if (status === 2) attracting += 1;
      else unresolved += 1;
    }
    expect(counters?.escaped).toBe(escaped);
    expect(counters?.attracting).toBe(attracting);
    expect(counters?.unresolved).toBe(unresolved);
    // The 126x view mixes escape, interior, and unresolved strata.
    expect(escaped).toBeGreaterThan(0);
    expect(attracting).toBeGreaterThan(0);
  });
});

describe('CpuRenderer frame-level counters', () => {
  it('attaches counters to frames only when requested', async () => {
    const renderer = new CpuRenderer();
    for (const perfCounters of [undefined, true] as const) {
      const frames: SemanticFrame[] = [];
      await renderer.render(
        {
          viewport: MAIN_CARDIOID_VIEWPORT,
          size: { width: 24, height: 16 },
          quality: BALANCED,
          ...(perfCounters === undefined ? {} : { perfCounters }),
        },
        new AbortController().signal,
        (frame) => {
          frames.push(frame);
        },
      );
      const stable = frames.at(-1);
      expect(stable?.stage).toBe('stable');
      if (perfCounters === true) {
        expect(stable?.counters?.attracting).toBe(24 * 16);
        expect(stable?.counters?.analyticPathHits).toBe(24 * 16);
      } else {
        expect(stable?.counters).toBeUndefined();
        expect('counters' in (stable ?? {})).toBe(false);
      }
    }
  });
});

class CountersFakeTileWorker implements TileWorkerHandle {
  public readonly posts: SupervisorToTileMessage[] = [];
  readonly #listeners = new Set<(event: TileMessageEvent) => void>();

  public postMessage(message: SupervisorToTileMessage): void {
    this.posts.push(message);
  }

  public addEventListener(_type: 'message', listener: (event: TileMessageEvent) => void): void {
    this.#listeners.add(listener);
  }

  public removeEventListener(_type: 'message', listener: (event: TileMessageEvent) => void): void {
    this.#listeners.delete(listener);
  }

  public terminate(): void {
    // no-op
  }

  /** Runs the real per-band classification and answers with its counters. */
  public async emitResult(classify: TileClassifyMessage): Promise<void> {
    const result = await classifyRows(
      { viewport: classify.viewport, size: classify.size, quality: classify.quality },
      classify.quality,
      1,
      classify.y0,
      classify.y1,
      new AbortController().signal,
      classify.classifierMode,
      undefined,
      undefined,
      ...(classify.perfCounters === true ? [true as const] : []),
    );
    const message: TileResultMessage = {
      type: 'tile-result',
      generation: classify.generation,
      jobId: classify.jobId,
      y0: classify.y0,
      y1: classify.y1,
      packedStatusPeriod: result.packedStatusPeriod,
      smoothIterationOrMultiplierMagnitude: result.smoothIterationOrMultiplierMagnitude,
      multiplierAngle: result.multiplierAngle,
      outputRevision: 'poc-packed-1.0.0',
      yieldWaitMs: 0,
      yieldCount: 0,
      ...(result.counters === undefined ? {} : { counters: result.counters }),
    };
    for (const listener of this.#listeners) listener({ data: message });
  }
}

/**
 * Drives a tiled classifyStable through the fake workers: answers every
 * classify post as it appears (the pool dispatches the next wave
 * synchronously from the result handler, so this converges) and resolves
 * with the settled frame.
 */
const drainTileClassifies = async (
  workers: readonly CountersFakeTileWorker[],
  framePromise: Promise<SemanticFrame>,
  onClassify?: (message: TileClassifyMessage) => void,
): Promise<SemanticFrame> => {
  let settled: SemanticFrame | undefined;
  let failure: unknown;
  const done = framePromise.then(
    (value) => {
      settled = value;
    },
    (error: unknown) => {
      failure = error;
    },
  );
  for (;;) {
    let answered = 0;
    for (const worker of workers) {
      for (const post of worker.posts.splice(0)) {
        if (post.type === 'tile-classify') {
          answered += 1;
          onClassify?.(post);
          await worker.emitResult(post);
        }
      }
    }
    if (settled !== undefined) return settled;
    if (failure !== undefined) {
      throw failure instanceof Error ? failure : new Error('tiled classify failed');
    }
    if (answered === 0) await done;
  }
};

describe('tile-pool per-band sum consistency (plan §8)', () => {
  it('frame counters equal the sum of the per-band counters', async () => {
    const width = 64;
    const height = 64;
    const workers: CountersFakeTileWorker[] = [];
    const pool = createTilePool({
      workerCount: 2,
      factory: () => {
        const worker = new CountersFakeTileWorker();
        workers.push(worker);
        return worker;
      },
    });
    const frame = await drainTileClassifies(
      workers,
      pool.classifyStable(
        {
          viewport: RABBIT_VIEWPORT,
          size: { width, height },
          quality: SMALL_QUALITY,
          perfCounters: true,
        },
        SMALL_QUALITY,
        new AbortController().signal,
        undefined,
        true,
      ),
    );
    pool.dispose();
    expect(frame.stage).toBe('stable');

    const counters: PerfCounters | undefined = frame.counters;
    expect(counters).toBeDefined();
    expect(
      (counters?.escaped ?? 0) + (counters?.attracting ?? 0) + (counters?.unresolved ?? 0),
    ).toBe(width * height);
    // The rabbit view has interior, exterior, and unresolved strata at this
    // budget, so the totals are non-trivial.
    expect(counters?.escaped).toBeGreaterThan(0);
    expect(counters?.attracting).toBeGreaterThan(0);
  });

  it('attaches no counters when the request did not opt in', async () => {
    const workers: CountersFakeTileWorker[] = [];
    const pool = createTilePool({
      workerCount: 2,
      factory: () => {
        const worker = new CountersFakeTileWorker();
        workers.push(worker);
        return worker;
      },
    });
    const classifyPostsWithCounters: TileClassifyMessage[] = [];
    const frame = await drainTileClassifies(
      workers,
      pool.classifyStable(
        {
          viewport: RABBIT_VIEWPORT,
          size: { width: 32, height: 32 },
          quality: SMALL_QUALITY,
        },
        SMALL_QUALITY,
        new AbortController().signal,
      ),
      (message) => {
        if (message.perfCounters === true) classifyPostsWithCounters.push(message);
      },
    );
    pool.dispose();
    expect(frame.counters).toBeUndefined();
    expect('counters' in frame).toBe(false);
    // The classify messages on the default path carry no perfCounters field.
    expect(classifyPostsWithCounters).toHaveLength(0);
  });
});
