import { describe, expect, it } from 'vitest';

import { DEFAULT_VIEWPORT, type RenderQuality } from '../../../src/domain';
import { classifyRows } from '../../../src/render/classify-rows';
import {
  CpuRenderer,
  RenderCancelledError,
  type SemanticBand,
  type SemanticFrame,
} from '../../../src/render';
import { splitRowBands } from '../../../src/render/row-bands';

const BALANCED: RenderQuality = { maxIterations: 512, maxPeriod: 32, coarseStride: 8 };

/** Returns the frame band covering row y (bands partition [0, height)). */
const bandAt = (frame: SemanticFrame, y: number): SemanticBand => {
  const band = frame.bands.find((candidate) => y >= candidate.y0 && y < candidate.y1);
  if (band === undefined) throw new Error(`no band covers row ${y}`);
  return band;
};

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

    const serialBand = bandAt(serial!, y0);
    const start = y0 * width;
    const end = y1 * width;
    expect(band.packedStatusPeriod).toEqual(serialBand.packedStatusPeriod.subarray(start, end));
    expect(band.smoothIterationOrMultiplierMagnitude).toEqual(
      serialBand.smoothIterationOrMultiplierMagnitude.subarray(start, end),
    );
    expect(band.multiplierAngle).toEqual(serialBand.multiplierAngle.subarray(start, end));
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
    const assembled: SemanticBand[] = [];
    for (const band of bands) {
      const classified = await classifyRows(request, quality, 1, band.y0, band.y1, signal);
      assembled.push({
        y0: band.y0,
        y1: band.y1,
        packedStatusPeriod: classified.packedStatusPeriod,
        smoothIterationOrMultiplierMagnitude: classified.smoothIterationOrMultiplierMagnitude,
        multiplierAngle: classified.multiplierAngle,
      });
    }

    const mergedBandWords = (y: number, x: number): number => {
      const band = assembled.find((candidate) => y >= candidate.y0 && y < candidate.y1)!;
      return band.packedStatusPeriod[(y - band.y0) * request.size.width + x]!;
    };
    // Every assembled pixel equals the serial classification.
    for (let y = 0; y < request.size.height; y += 1) {
      for (let x = 0; x < request.size.width; x += 1) {
        expect(mergedBandWords(y, x)).toBe(serial.packedStatusPeriod[y * request.size.width + x]);
      }
    }

    const renderer = new CpuRenderer();
    const frames: SemanticFrame[] = [];
    await renderer.render(request, new AbortController().signal, (frame) => {
      frames.push(frame);
    });
    const stable = frames.find((frame) => frame.stage === 'stable');
    expect(stable).toBeDefined();
    const stableBand = bandAt(stable!, 0);
    expect(stableBand.packedStatusPeriod).toEqual(serial.packedStatusPeriod);
    expect(stableBand.smoothIterationOrMultiplierMagnitude).toEqual(
      serial.smoothIterationOrMultiplierMagnitude,
    );
    expect(stableBand.multiplierAngle).toEqual(serial.multiplierAngle);
  });

  it('classifyRows_classifiesIntoCallerProvidedOutputBuffers', async () => {
    const width = 8;
    const height = 4;
    const request = {
      viewport: DEFAULT_VIEWPORT,
      size: { width, height },
      quality: BALANCED,
    };
    const allocated = {
      packedStatusPeriod: new Uint32Array(width * height),
      smoothIterationOrMultiplierMagnitude: new Float64Array(width * height),
      multiplierAngle: new Float64Array(width * height),
    };
    const band = await classifyRows(
      request,
      BALANCED,
      1,
      0,
      height,
      new AbortController().signal,
      undefined,
      undefined,
      allocated,
    );
    expect(band.packedStatusPeriod).toBe(allocated.packedStatusPeriod);
    expect(band.smoothIterationOrMultiplierMagnitude).toBe(
      allocated.smoothIterationOrMultiplierMagnitude,
    );
    expect(band.multiplierAngle).toBe(allocated.multiplierAngle);
    // A zero word is never valid (status code 0 is reserved).
    expect(allocated.packedStatusPeriod.every((word) => word !== 0)).toBe(true);
  });

  it('classifyRows_rejectsOutputBuffersOfTheWrongLength', async () => {
    const request = {
      viewport: DEFAULT_VIEWPORT,
      size: { width: 8, height: 4 },
      quality: BALANCED,
    };
    await expect(
      classifyRows(request, BALANCED, 1, 0, 4, new AbortController().signal, undefined, undefined, {
        packedStatusPeriod: new Uint32Array(3),
        smoothIterationOrMultiplierMagnitude: new Float64Array(3),
        multiplierAngle: new Float64Array(3),
      }),
    ).rejects.toBeInstanceOf(RangeError);
  });
});
