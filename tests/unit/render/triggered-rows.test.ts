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
import { PERIOD_FOUR_BOXES } from '../../../src/domain/period-four-gate';
import { PERIOD_THREE_BOXES } from '../../../src/domain/period-three-gate';
import { TriggeredRowKernel } from '../../../src/render/triggered-rows';
import { stepUlps } from '../domain/analytic-test-helpers';

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
  // Period-3 gate boxes (ADR 0010): the airplane, its cusp, and the rabbit rim.
  { center: { re: -1.7548776662466927, im: 0 }, spanY: 0.03 },
  { center: { re: -1.75, im: 0 }, spanY: 1e-6 },
  { center: { re: -0.0458, im: 0.6923 }, spanY: 0.002 },
  // The corabbit (Im c < 0): the row window must use |Im c|.
  { center: { re: -0.1225611668766535, im: -0.7448617666197435 }, spanY: 0.3 },
  // Period-4 gate boxes (ADR 0013): the cardioid satellite and its
  // conjugate, the complex primitive, the real primitive and its cusp, and
  // the axis band where both axis windows apply.
  { center: { re: 0.2822713907669139, im: 0.5300606175785253 }, spanY: 0.1 },
  { center: { re: 0.2822713907669139, im: -0.5300606175785253 }, spanY: 0.1 },
  { center: { re: -0.15652016683375508, im: 1.0322471089228318 }, spanY: 0.012 },
  { center: { re: -1.9407998065294847, im: 0 }, spanY: 0.0014 },
  { center: { re: -1.9405507889761495, im: 0 }, spanY: 1e-6 },
  { center: { re: -1.6, im: 0 }, spanY: 0.0012 },
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

const compareOneRow = (
  kernel: TriggeredRowKernel,
  scalar: OrbitClassifier,
  sample: ReturnType<typeof createOrbitSample>,
  columns: Float64Array,
  cIm: number,
): { mismatches: number; period3: number; period4: number } => {
  const width = columns.length;
  const packed = new Uint32Array(width);
  const primary = new Float64Array(width);
  const angle = new Float64Array(width);
  kernel.classifyRow(
    columns,
    cIm,
    width,
    {
      packedStatusPeriod: packed,
      smoothIterationOrMultiplierMagnitude: primary,
      multiplierAngle: angle,
    },
    0,
  );
  let mismatches = 0;
  let period3 = 0;
  let period4 = 0;
  for (let x = 0; x < width; x += 1) {
    scalar.classifyInto(columns[x] ?? Number.NaN, cIm, sample);
    const status = sample.status;
    const word = packStatusPeriod(status, status === 2 ? sample.period : 0);
    const expectedPrimary =
      status === 1 ? sample.smoothIteration : status === 2 ? sample.multiplierMagnitude : 0;
    const expectedAngle = status === 2 ? sample.multiplierAngle : 0;
    if (status === 2 && sample.period === 3) period3 += 1;
    if (status === 2 && sample.period === 4) period4 += 1;
    if (
      packed[x] !== word ||
      !Object.is(primary[x], expectedPrimary) ||
      !Object.is(angle[x], expectedAngle)
    ) {
      mismatches += 1;
    }
  }
  return { mismatches, period3, period4 };
};

describe('TriggeredRowKernel', () => {
  it('matches the scalar triggered kernel bit for bit across views and options', () => {
    for (const view of VIEWS) {
      for (const options of OPTION_SETS) {
        expect(compareRow(view, options, 61, 9)).toBe(0);
      }
    }
  });

  for (const gate of [
    { period: 3, boxes: PERIOD_THREE_BOXES },
    { period: 4, boxes: PERIOD_FOUR_BOXES },
  ] as const) {
    it(`matches the scalar kernel at every period-${String(gate.period)} gate box edge (rows and columns)`, () => {
      // Calls classifyRow directly with row imaginary parts and columns at
      // each box's |Im c| band and Re c window edges, +-0 and +-1 ulp, in both
      // half-planes, plus each box's Re c midpoint: bit identity with the
      // scalar kernel on those rows and columns. The edge pixels themselves
      // are not accepted by the solve (the gate contains every acceptance
      // with room to spare), so a wrong window at an edge would change no
      // answer; the acceptances counted below are box midpoints. The exact
      // window-versus-gate equivalence is checked in
      // tests/unit/domain/period-three-gate.test.ts and
      // period-four-gate.test.ts.
      const around = (value: number): number[] => [stepUlps(value, -1), value, stepUlps(value, 1)];
      const rows = new Set<number>([0, -0]);
      const columnSet = new Set<number>();
      for (const box of gate.boxes) {
        for (const edge of [box.absImMin, box.absImMax]) {
          for (const v of around(edge)) {
            rows.add(v);
            rows.add(-v);
          }
        }
        for (const edge of [box.reMin, box.reMax]) for (const v of around(edge)) columnSet.add(v);
        columnSet.add((box.reMin + box.reMax) / 2);
      }
      const columns = Float64Array.from(columnSet);
      for (const options of [
        { maxIterations: 512, maxPeriod: 32 },
        { maxIterations: 100, maxPeriod: 7, cycleWarmup: 0 },
        { maxIterations: 33, maxPeriod: 1, cycleWarmup: 2 },
      ] satisfies Partial<OrbitOptions>[]) {
        const kernel = new TriggeredRowKernel(options);
        const scalar = new OrbitClassifier(options);
        const sample = createOrbitSample();
        let mismatches = 0;
        let accepted = 0;
        for (const cIm of rows) {
          const result = compareOneRow(kernel, scalar, sample, columns, cIm);
          mismatches += result.mismatches;
          accepted += gate.period === 3 ? result.period3 : result.period4;
        }
        expect(mismatches).toBe(0);
        if (options.maxIterations === 512) expect(accepted).toBeGreaterThan(0);
      }
    });
  }

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
