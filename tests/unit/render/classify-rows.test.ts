import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_VIEWPORT,
  OrbitClassifier,
  createViewportTransform,
  type RenderQuality,
} from '../../../src/domain';
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
    expect(band.multiplierUnitRe).toEqual(serial!.multiplierUnitRe.subarray(start, end));
    expect(band.multiplierUnitIm).toEqual(serial!.multiplierUnitIm.subarray(start, end));
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
      multiplierUnitRe: new Float32Array(pixelCount),
      multiplierUnitIm: new Float32Array(pixelCount),
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
    expect(merged.multiplierUnitRe).toEqual(serial.multiplierUnitRe);
    expect(merged.multiplierUnitIm).toEqual(serial.multiplierUnitIm);

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
    expect(stable!.multiplierUnitRe).toEqual(serial.multiplierUnitRe);
    expect(stable!.multiplierUnitIm).toEqual(serial.multiplierUnitIm);
  });
});

describe('raster coordinate and symmetry optimizations', () => {
  it.each([1, 8, 9])('classifies only the upper half at height %i', async (height) => {
    const classify = vi.spyOn(OrbitClassifier.prototype, 'classifyRaster');
    try {
      const request = { viewport: DEFAULT_VIEWPORT, size: { width: 7, height } };
      const band = await classifyRows(
        request,
        BALANCED,
        1,
        0,
        height,
        new AbortController().signal,
      );
      expect(classify).toHaveBeenCalledTimes(7 * Math.ceil(height / 2));
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < 7; x += 1) {
          const offset = y * 7 + x;
          const mirror = (height - 1 - y) * 7 + x;
          expect(band.status[offset]).toBe(band.status[mirror]);
          expect(band.period[offset]).toBe(band.period[mirror]);
          expect(band.smoothIterationOrMultiplierMagnitude[offset]).toBe(
            band.smoothIterationOrMultiplierMagnitude[mirror],
          );
          expect(band.multiplierUnitRe[offset]).toBe(band.multiplierUnitRe[mirror]);
          expect(band.multiplierUnitIm[offset]).toBeCloseTo(
            -(band.multiplierUnitIm[mirror] ?? 0),
            7,
          );
        }
      }
    } finally {
      classify.mockRestore();
    }
  });

  it.each([1, 4])(
    'uses canonical coordinates off-axis, including clipped stride %i samples',
    async (stride) => {
      const classify = vi.spyOn(OrbitClassifier.prototype, 'classifyRaster');
      try {
        const request = {
          viewport: { center: { re: -0.7435, im: 0.1314 }, spanY: 2.5 / 6_000_000 },
          size: { width: 7, height: 9 },
        };
        await classifyRows(request, BALANCED, stride, 0, 9, new AbortController().signal);
        const transform = createViewportTransform(request.viewport, request.size);
        const expected = [];
        for (let y = 0; y < 9; y += stride) {
          for (let x = 0; x < 7; x += stride) {
            const point = transform.pixelToComplex(
              Math.min(6, x + (stride - 1) / 2),
              Math.min(8, y + (stride - 1) / 2),
            );
            expected.push([point.re, point.im]);
          }
        }
        expect(classify.mock.calls).toEqual(expected);
      } finally {
        classify.mockRestore();
      }
    },
  );

  it('default raster retains exhaustive results and bounds Float32 direction error', async () => {
    const request = {
      viewport: { center: { re: -0.12, im: 0.74 }, spanY: 0.35 },
      size: { width: 64, height: 48 },
    };
    const band = await classifyRows(request, BALANCED, 1, 0, 48, new AbortController().signal);
    const classifier = new OrbitClassifier();
    const transform = createViewportTransform(request.viewport, request.size);
    for (let y = 0; y < 48; y += 1) {
      for (let x = 0; x < 64; x += 1) {
        const offset = y * 64 + x;
        const result = classifier.classify(transform.pixelToComplex(x, y));
        expect(band.status[offset]).toBe(
          result.status === 'escaped' ? 1 : result.status === 'attracting-cycle' ? 2 : 0,
        );
        if (result.status === 'attracting-cycle') {
          expect(band.period[offset]).toBe(result.period);
          expect(band.smoothIterationOrMultiplierMagnitude[offset]).toBe(
            result.multiplierMagnitude,
          );
          expect(
            Math.abs((band.multiplierUnitRe[offset] ?? 0) - Math.cos(result.multiplierAngle)),
          ).toBeLessThan(3e-8);
          expect(
            Math.abs((band.multiplierUnitIm[offset] ?? 0) - Math.sin(result.multiplierAngle)),
          ).toBeLessThan(3e-8);
        }
      }
    }
  });
});
