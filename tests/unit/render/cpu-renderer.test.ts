import { describe, expect, it } from 'vitest';

import { DEFAULT_VIEWPORT } from '../../../src/domain';
import { CpuRenderer, RenderCancelledError, type SemanticFrame } from '../../../src/render';

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
});
