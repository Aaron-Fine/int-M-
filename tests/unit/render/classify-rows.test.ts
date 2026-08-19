import { describe, expect, it } from 'vitest';

import { DEFAULT_VIEWPORT, type RenderQuality } from '../../../src/domain';
import { classifyRows } from '../../../src/render/classify-rows';
import { CpuRenderer, RenderCancelledError, type SemanticFrame } from '../../../src/render';
import { copyBandIntoFrame, splitRowBands } from '../../../src/render/row-bands';

const BALANCED: RenderQuality = { maxIterations: 512, maxPeriod: 32, coarseStride: 8 };

describe('classifyRows', () => {
  it('classifyRows_bandMatchesSerialSlice', async () => {
    const width = 8;
    const height = 11;
    const y0 = 3;
    const y1 = 7;
    const request = {
      viewport: DEFAULT_VIEWPORT,
      size: { width, height },
      quality: BALANCED,
    };
    const renderer = new CpuRenderer();
    const frames: SemanticFrame[] = [];

    await renderer.render(request, new AbortController().signal, (frame) => {
      frames.push(frame);
    });

    const serial = frames.find((frame) => frame.stage === 'stable');
    expect(serial).toBeDefined();

    const band = await classifyRows(request, BALANCED, 1, y0, y1, new AbortController().signal);

    const start = y0 * width;
    const end = y1 * width;
    expect(band.status).toEqual(serial!.status.subarray(start, end));
    expect(band.period).toEqual(serial!.period.subarray(start, end));
    expect(band.smoothIterationOrMultiplierMagnitude).toEqual(
      serial!.smoothIterationOrMultiplierMagnitude.subarray(start, end),
    );
    expect(band.multiplierAngle).toEqual(serial!.multiplierAngle.subarray(start, end));
  });

  it('classifyRows_abortsOnEveryRow', async () => {
    const y0 = 3;
    const y1 = 20;
    let checks = 0;
    const real = new AbortController().signal;
    const signal = new Proxy(real, {
      get(target, prop, receiver) {
        if (prop === 'aborted') {
          checks += 1;
          return checks > 1;
        }
        const value = Reflect.get(target, prop, receiver) as unknown;
        return typeof value === 'function'
          ? (value as (...args: never[]) => unknown).bind(target)
          : value;
      },
    });

    await expect(
      classifyRows(
        {
          viewport: DEFAULT_VIEWPORT,
          size: { width: 4, height: 20 },
          quality: BALANCED,
        },
        BALANCED,
        1,
        y0,
        y1,
        signal,
      ),
    ).rejects.toBeInstanceOf(RenderCancelledError);
    expect(checks).toBe(2);
  });

  it('stableFrame_matchesInProcessThreeBandMerge_atBalancedQuality_oddHeight', async () => {
    const quality: RenderQuality = { maxIterations: 512, maxPeriod: 32, coarseStride: 8 };
    const request = {
      viewport: DEFAULT_VIEWPORT,
      size: { width: 16, height: 9 },
      quality,
    };
    const signal = new AbortController().signal;
    const serial = await classifyRows(request, quality, 1, 0, request.size.height, signal);

    const bands = splitRowBands(request.size.height, 3);
    expect(bands).toHaveLength(3);
    const pixelCount = request.size.width * request.size.height;
    const merged = {
      size: request.size,
      status: new Uint8Array(pixelCount),
      period: new Uint32Array(pixelCount),
      smoothIterationOrMultiplierMagnitude: new Float64Array(pixelCount),
      multiplierAngle: new Float64Array(pixelCount),
    };
    for (const band of bands) {
      const classified = await classifyRows(request, quality, 1, band.y0, band.y1, signal);
      copyBandIntoFrame(merged, { ...classified, ...band });
    }

    expect(merged.status).toEqual(serial.status);
    expect(merged.period).toEqual(serial.period);
    expect(merged.smoothIterationOrMultiplierMagnitude).toEqual(
      serial.smoothIterationOrMultiplierMagnitude,
    );
    expect(merged.multiplierAngle).toEqual(serial.multiplierAngle);

    const renderer = new CpuRenderer();
    const frames: SemanticFrame[] = [];
    await renderer.render(request, new AbortController().signal, (frame) => {
      frames.push(frame);
    });
    const stable = frames.find((frame) => frame.stage === 'stable');
    expect(stable).toBeDefined();
    expect(stable!.status).toEqual(serial.status);
    expect(stable!.period).toEqual(serial.period);
    expect(stable!.smoothIterationOrMultiplierMagnitude).toEqual(
      serial.smoothIterationOrMultiplierMagnitude,
    );
    expect(stable!.multiplierAngle).toEqual(serial.multiplierAngle);
  });
});
