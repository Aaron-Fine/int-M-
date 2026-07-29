import { describe, expect, it } from 'vitest';

import { DEFAULT_VIEWPORT } from '../../../src/domain';
import { CpuRenderer, RenderCancelledError } from '../../../src/render';

describe('CpuRenderer', () => {
  it('emits a complete coarse preview followed by a stable raster', async () => {
    const renderer = new CpuRenderer();
    const frames: string[] = [];

    await renderer.render(
      {
        viewport: DEFAULT_VIEWPORT,
        size: { width: 12, height: 8 },
        semanticView: 'period',
        quality: { maxIterations: 32, maxPeriod: 4, coarseStride: 4 },
      },
      new AbortController().signal,
      (frame) => {
        frames.push(frame.stage);
        expect(frame.rgba).toHaveLength(12 * 8 * 4);
        for (let alpha = 3; alpha < frame.rgba.length; alpha += 4) {
          expect(frame.rgba[alpha]).toBe(255);
        }
      },
    );

    expect(frames).toEqual(['coarse', 'stable']);
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
          semanticView: 'stability',
        },
        controller.signal,
        () => undefined,
      ),
    ).rejects.toBeInstanceOf(RenderCancelledError);
  });

  it('textures unresolved regions without relying on hue', async () => {
    const renderer = new CpuRenderer();
    const frames: Uint8ClampedArray<ArrayBuffer>[] = [];

    await renderer.render(
      {
        viewport: { center: { re: 0, im: 1 }, spanY: 0.1 },
        size: { width: 8, height: 4 },
        semanticView: 'stability',
        quality: { maxIterations: 1, maxPeriod: 4, coarseStride: 2 },
      },
      new AbortController().signal,
      (frame) => {
        frames.push(frame.rgba);
      },
    );

    const coarse = frames[0];
    const stable = frames[1];
    expect(coarse?.[0]).not.toBe(coarse?.[2 * 4]);
    expect(stable?.[0]).not.toBe(stable?.[4 * 4]);
    expect(coarse?.[0]).toBe(coarse?.[1]);
    expect(coarse?.[1]).toBe(coarse?.[2]);
  });
});
