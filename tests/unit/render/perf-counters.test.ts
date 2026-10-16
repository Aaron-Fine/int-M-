import { describe, expect, it } from 'vitest';

import type { RenderQuality } from '../../../src/domain';
import { classifyRows } from '../../../src/render/classify-rows';
import { CpuRenderer } from '../../../src/render/cpu-renderer';
import { unpackStatus } from '../../../src/render/packed-semantic';
import type { SemanticFrame } from '../../../src/render';

const BALANCED: RenderQuality = { maxIterations: 512, maxPeriod: 32, coarseStride: 8 };

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
    classifierMode?: 'legacy-scan' | 'checkpoint' | 'differential' | 'triggered-scan';
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
    options.perfCounters ? { perfCounters: true } : undefined,
  );

describe('classifyRows diagnostics counters (plan §8, offline)', () => {
  it('attaches no counters unless the caller opted in', async () => {
    const result = await classifyBand(MAIN_CARDIOID_VIEWPORT, 24, 16);
    expect('counters' in result).toBe(false);
    expect(result.counters).toBeUndefined();
  });

  it('rejects triggered-scan combined with perfCounters instead of reporting legacy counters', async () => {
    await expect(
      classifyBand(MAIN_CARDIOID_VIEWPORT, 8, 8, {
        classifierMode: 'triggered-scan',
        perfCounters: true,
      }),
    ).rejects.toBeInstanceOf(RangeError);
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

describe('offline counters with a tile pool', () => {
  it('classifies a counted render in process instead of fanning out to tile workers', async () => {
    let poolCalls = 0;
    const renderer = new CpuRenderer({
      size: 4,
      classifyStable: () => {
        poolCalls += 1;
        return Promise.reject(new Error('counted renders must not use the tile pool'));
      },
      dispose: () => undefined,
    });
    const frames: SemanticFrame[] = [];
    await renderer.render(
      {
        viewport: MAIN_CARDIOID_VIEWPORT,
        size: { width: 24, height: 16 },
        quality: BALANCED,
        perfCounters: true,
      },
      new AbortController().signal,
      (frame) => {
        frames.push(frame);
      },
    );
    expect(poolCalls).toBe(0);
    expect(frames.at(-1)?.counters?.attracting).toBe(24 * 16);
  });
});
