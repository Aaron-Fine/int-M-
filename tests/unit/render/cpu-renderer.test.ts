import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_VIEWPORT, type RenderQuality } from '../../../src/domain';
import {
  CpuRenderer,
  RenderCancelledError,
  type DynamicsRenderRequest,
  type SemanticFrame,
} from '../../../src/render';
import type { TilePool } from '../../../src/render';

const STABLE_QUALITY: RenderQuality = { maxIterations: 512, maxPeriod: 32, coarseStride: 8 };

const emptyStableFrame = (request: DynamicsRenderRequest): SemanticFrame => {
  const pixelCount = request.size.width * request.size.height;
  return {
    stage: 'stable',
    size: request.size,
    sampleStride: 1,
    status: new Uint8Array(pixelCount),
    period: new Uint32Array(pixelCount),
    smoothIterationOrMultiplierMagnitude: new Float64Array(pixelCount),
    multiplierAngle: new Float64Array(pixelCount),
    progress: 1,
  };
};

describe('CpuRenderer', () => {
  it('emits complete coarse and stable semantic frames that can be recolored', async () => {
    const renderer = new CpuRenderer();
    const frames: SemanticFrame[] = [];

    await renderer.render(
      {
        viewport: DEFAULT_VIEWPORT,
        size: { width: 12, height: 8 },
        quality: { maxIterations: 32, maxPeriod: 4, coarseStride: 4 },
      },
      new AbortController().signal,
      (frame) => {
        frames.push(frame);
        expect(frame.status).toHaveLength(12 * 8);
        expect(frame.period).toHaveLength(12 * 8);
        expect(frame.smoothIterationOrMultiplierMagnitude).toHaveLength(12 * 8);
        expect(frame.multiplierAngle).toHaveLength(12 * 8);
      },
    );

    expect(frames.map((frame) => frame.stage)).toEqual(['coarse', 'stable']);
    for (const frame of frames) {
      const raster = renderer.colorize(frame, 'period');
      expect(raster.rgba).toHaveLength(12 * 8 * 4);
      for (let alpha = 3; alpha < raster.rgba.length; alpha += 4) {
        expect(raster.rgba[alpha]).toBe(255);
      }
    }
  });

  it('honors cancellation before doing work', async () => {
    const renderer = new CpuRenderer();
    const controller = new AbortController();
    controller.abort();

    await expect(
      renderer.render(
        {
          viewport: DEFAULT_VIEWPORT,
          size: { width: 4, height: 4 },
        },
        controller.signal,
        () => undefined,
      ),
    ).rejects.toBeInstanceOf(RenderCancelledError);
  });

  it('textures unresolved regions during colorization without relying on hue', async () => {
    const renderer = new CpuRenderer();
    const frames: SemanticFrame[] = [];

    await renderer.render(
      {
        viewport: { center: { re: 0, im: 1 }, spanY: 0.1 },
        size: { width: 8, height: 4 },
        quality: { maxIterations: 1, maxPeriod: 4, coarseStride: 2 },
      },
      new AbortController().signal,
      (frame) => {
        frames.push(frame);
      },
    );

    const coarse = frames[0] === undefined ? undefined : renderer.colorize(frames[0], 'stability');
    const stable = frames[1] === undefined ? undefined : renderer.colorize(frames[1], 'stability');
    expect(coarse?.rgba[0]).not.toBe(coarse?.rgba[2 * 4]);
    expect(stable?.rgba[0]).not.toBe(stable?.rgba[4 * 4]);
    expect(coarse?.rgba[0]).toBe(coarse?.rgba[1]);
    expect(coarse?.rgba[1]).toBe(coarse?.rgba[2]);
  });

  it('encodes multiplier angle as oriented lightness stripes', () => {
    const renderer = new CpuRenderer();
    const pixelCount = 8;
    const status = new Uint8Array(pixelCount);
    const period = new Uint32Array(pixelCount);
    status.fill(2);
    period.fill(1);
    const frame: SemanticFrame = {
      stage: 'stable',
      size: { width: 8, height: 1 },
      sampleStride: 1,
      status,
      period,
      smoothIterationOrMultiplierMagnitude: new Float64Array(pixelCount).fill(0.2),
      multiplierAngle: new Float64Array(pixelCount),
      progress: 1,
    };
    const raster = renderer.colorize(frame, 'multiplier');
    const luma = (index: number): number => {
      const red = raster.rgba[index * 4] ?? 0;
      const green = raster.rgba[index * 4 + 1] ?? 0;
      const blue = raster.rgba[index * 4 + 2] ?? 0;
      return red + green + blue;
    };
    expect(new Set([0, 1, 2, 3, 4, 5, 6, 7].map((index) => luma(index))).size).toBeGreaterThan(1);
  });

  it('records classify time and yield-wait counts without changing yield cadence', async () => {
    const renderer = new CpuRenderer();
    const frames: SemanticFrame[] = [];

    await renderer.render(
      {
        viewport: DEFAULT_VIEWPORT,
        size: { width: 16, height: 64 },
        quality: { maxIterations: 32, maxPeriod: 4, coarseStride: 8 },
      },
      new AbortController().signal,
      (frame) => {
        frames.push(frame);
      },
    );

    expect(frames).toHaveLength(2);
    const coarse = frames[0];
    const stable = frames[1];
    expect(coarse?.timing).toEqual(
      expect.objectContaining({
        yieldCount: 1,
      }),
    );
    expect(stable?.timing).toEqual(
      expect.objectContaining({
        yieldCount: 8,
      }),
    );
    expect(coarse?.timing?.classifyMs).toBeGreaterThan(0);
    expect(stable?.timing?.classifyMs).toBeGreaterThan(0);
    expect(coarse?.timing?.yieldWaitMs).toBeGreaterThanOrEqual(0);
    expect(stable?.timing?.yieldWaitMs).toBeGreaterThanOrEqual(0);
  });

  it('runtime_coarseDoesNotCallPool', async () => {
    const qualities: RenderQuality[] = [];
    let coarseEmitted = false;
    const classifyStable = vi.fn(
      (request: DynamicsRenderRequest, quality: RenderQuality): Promise<SemanticFrame> => {
        if (!coarseEmitted) {
          return Promise.reject(new Error('classifyStable must not run during coarse'));
        }
        qualities.push(quality);
        return Promise.resolve(emptyStableFrame(request));
      },
    );
    const pool: TilePool = {
      size: 2,
      classifyStable,
      dispose: () => undefined,
    };
    const renderer = new CpuRenderer(pool);
    const frames: SemanticFrame[] = [];

    await renderer.render(
      {
        viewport: DEFAULT_VIEWPORT,
        size: { width: 8, height: 4 },
        quality: STABLE_QUALITY,
      },
      new AbortController().signal,
      (frame) => {
        frames.push(frame);
        if (frame.stage === 'coarse') {
          expect(classifyStable).not.toHaveBeenCalled();
          coarseEmitted = true;
        }
      },
    );

    expect(frames.map((frame) => frame.stage)).toEqual(['coarse', 'stable']);
    expect(classifyStable).toHaveBeenCalledOnce();
    expect(qualities).toEqual([STABLE_QUALITY]);
  });

  it('cpuRenderer_poolSize1_doesNotCallClassifyStable', async () => {
    const classifyStable = vi.fn((request: DynamicsRenderRequest) =>
      Promise.resolve(emptyStableFrame(request)),
    );
    const renderer = new CpuRenderer({
      size: 1,
      classifyStable,
      dispose: () => undefined,
    });
    const frames: SemanticFrame[] = [];

    await renderer.render(
      {
        viewport: DEFAULT_VIEWPORT,
        size: { width: 8, height: 4 },
        quality: { maxIterations: 16, maxPeriod: 4, coarseStride: 4 },
      },
      new AbortController().signal,
      (frame) => {
        frames.push(frame);
      },
    );

    expect(frames.map((frame) => frame.stage)).toEqual(['coarse', 'stable']);
    expect(classifyStable).not.toHaveBeenCalled();
  });

  it('runtime_cancelAfterCoarse_doesNotStartTiles', async () => {
    const classifyStable = vi.fn((request: DynamicsRenderRequest) =>
      Promise.resolve(emptyStableFrame(request)),
    );
    const renderer = new CpuRenderer({
      size: 2,
      classifyStable,
      dispose: () => undefined,
    });
    const controller = new AbortController();

    await expect(
      renderer.render(
        {
          viewport: DEFAULT_VIEWPORT,
          size: { width: 8, height: 4 },
          quality: { maxIterations: 16, maxPeriod: 4, coarseStride: 4 },
        },
        controller.signal,
        (frame) => {
          if (frame.stage === 'coarse') controller.abort();
        },
      ),
    ).rejects.toBeInstanceOf(RenderCancelledError);
    expect(classifyStable).not.toHaveBeenCalled();
  });
});
