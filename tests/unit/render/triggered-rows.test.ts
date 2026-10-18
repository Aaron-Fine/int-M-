import { describe, expect, it } from 'vitest';

import {
  createOrbitSample,
  createViewportTransform,
  OrbitClassifier,
  type OrbitOptions,
  type Viewport,
} from '../../../src/domain';
import { packStatusPeriod } from '../../../src/render/packed-semantic';
import { prepareRealColumns, preparedRowImaginary } from '../../../src/render/classify-rows';
import { TriggeredRowKernel } from '../../../src/render/triggered-rows';

/**
 * The two-lane row kernel must reproduce the scalar triggered kernel bit for
 * bit: same packed word, same smooth-iteration or multiplier-magnitude bits,
 * same multiplier-angle bits, for every pixel.
 */
const VIEWS: readonly Viewport[] = [
  { center: { re: -0.75, im: 0.0001 }, spanY: 2.5 },
  { center: { re: -0.1225611668766535, im: 0.7448617666197435 }, spanY: 0.3 },
  { center: { re: -0.1205, im: 0.8268 }, spanY: 0.005 },
  { center: { re: -1.401155189092, im: 0 }, spanY: 0.001 },
  { center: { re: -1.25, im: 0 }, spanY: 4.1666666666666667e-7 },
  { center: { re: 0.3, im: 0.008 }, spanY: 0.02 },
  { center: { re: 0.1, im: 0.05 }, spanY: 0.2 },
];

const OPTION_SETS: readonly Partial<OrbitOptions>[] = [
  { maxIterations: 512, maxPeriod: 32 },
  { maxIterations: 256, maxPeriod: 16 },
  { maxIterations: 1024, maxPeriod: 64 },
  { maxIterations: 100, maxPeriod: 7, cycleWarmup: 0 },
  { maxIterations: 30, maxPeriod: 3, cycleWarmup: 40 },
  { maxIterations: 1, maxPeriod: 1 },
  { maxIterations: 33, maxPeriod: 1, cycleWarmup: 2 },
  { maxIterations: 512, maxPeriod: 32, cycleTolerance: 1e-6 },
];

const compareRow = (
  view: Viewport,
  options: Partial<OrbitOptions>,
  width: number,
  height: number,
): number => {
  const size = { width, height };
  const transform = createViewportTransform(view, size);
  const columns = new Float64Array(width);
  prepareRealColumns(transform, width, 1, columns);
  const kernel = new TriggeredRowKernel(options);
  const scalar = new OrbitClassifier(options);
  const sample = createOrbitSample();
  const packed = new Uint32Array(width * height);
  const primary = new Float64Array(width * height);
  const angle = new Float64Array(width * height);
  let mismatches = 0;
  for (let y = 0; y < height; y += 1) {
    const cIm = preparedRowImaginary(transform, height, 1, y);
    kernel.classifyRow(
      columns,
      cIm,
      width,
      {
        packedStatusPeriod: packed,
        smoothIterationOrMultiplierMagnitude: primary,
        multiplierAngle: angle,
      },
      y * width,
    );
    for (let x = 0; x < width; x += 1) {
      scalar.classifyInto(columns[x] ?? Number.NaN, cIm, sample);
      const o = y * width + x;
      const status = sample.status;
      const word = packStatusPeriod(status, status === 2 ? sample.period : 0);
      const expectedPrimary =
        status === 1 ? sample.smoothIteration : status === 2 ? sample.multiplierMagnitude : 0;
      const expectedAngle = status === 2 ? sample.multiplierAngle : 0;
      if (
        packed[o] !== word ||
        !Object.is(primary[o], expectedPrimary) ||
        !Object.is(angle[o], expectedAngle)
      ) {
        mismatches += 1;
      }
    }
  }
  return mismatches;
};

describe('TriggeredRowKernel', () => {
  it('matches the scalar triggered kernel bit for bit across views and options', () => {
    for (const view of VIEWS) {
      for (const options of OPTION_SETS) {
        expect(compareRow(view, options, 61, 9)).toBe(0);
      }
    }
  });

  it('never writes outside its row when a parked lane would escape (offset > 0)', () => {
    // A lane parked at z = 0 would iterate c = i * cIm (the shared row
    // imaginary part); for these rows that orbit escapes. Rows are written at
    // a nonzero offset with sentinels on both sides.
    for (const cIm of [0.7652, -0.7652, 0.687, 1.3]) {
      for (const width of [1, 2, 3, 37]) {
        const kernel = new TriggeredRowKernel({ maxIterations: 256, maxPeriod: 32 });
        const columns = new Float64Array(width);
        for (let x = 0; x < width; x += 1) columns[x] = -0.5 + 0.01 * x;
        const length = width + 2;
        const packed = new Uint32Array(length).fill(0xdeadbeef);
        const primary = new Float64Array(length).fill(-7);
        const angle = new Float64Array(length).fill(-7);
        kernel.classifyRow(
          columns,
          cIm,
          width,
          {
            packedStatusPeriod: packed,
            smoothIterationOrMultiplierMagnitude: primary,
            multiplierAngle: angle,
          },
          1,
        );
        for (const sentinel of [0, length - 1]) {
          expect(packed[sentinel]).toBe(0xdeadbeef);
          expect(primary[sentinel]).toBe(-7);
          expect(angle[sentinel]).toBe(-7);
        }
      }
    }
  });

  it('handles single-pixel and two-pixel rows', () => {
    for (const view of VIEWS) {
      expect(compareRow(view, { maxIterations: 512, maxPeriod: 32 }, 1, 3)).toBe(0);
      expect(compareRow(view, { maxIterations: 512, maxPeriod: 32 }, 2, 3)).toBe(0);
    }
  });
});
