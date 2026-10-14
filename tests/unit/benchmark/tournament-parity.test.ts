import { describe, expect, it } from 'vitest';

import type {
  FieldTolerancePolicy,
  ParityPolicy,
  SemanticFields,
} from '../../../tools/benchmark/candidates/types';
import { aggregateCandidate } from '../../../tools/benchmark/judge/aggregate';
import {
  compareFrames,
  type CompareResult,
  type RgbaViews,
} from '../../../tools/benchmark/judge/parity';

const WIDTH = 4;
const HEIGHT = 3;
const PIXELS = WIDTH * HEIGHT;

/** pixel 0..3 escaped, 4..7 attracting, 8..11 unresolved */
const baselineFields = (): SemanticFields => {
  const status = new Uint8Array(PIXELS);
  const period = new Uint32Array(PIXELS);
  const smoothIteration = new Float64Array(PIXELS);
  const multiplierMagnitude = new Float64Array(PIXELS);
  const multiplierAngle = new Float64Array(PIXELS);
  for (let i = 0; i < PIXELS; i += 1) {
    if (i < 4) {
      status[i] = 1;
      smoothIteration[i] = 3.25 + i;
    } else if (i < 8) {
      status[i] = 2;
      period[i] = 3;
      multiplierMagnitude[i] = 0.5;
      multiplierAngle[i] = 0.1 * i;
    }
  }
  return { status, period, smoothIteration, multiplierMagnitude, multiplierAngle };
};

const copy = (fields: SemanticFields): SemanticFields => ({
  status: fields.status.slice(),
  period: fields.period.slice(),
  smoothIteration: fields.smoothIteration.slice(),
  multiplierMagnitude: fields.multiplierMagnitude.slice(),
  multiplierAngle: fields.multiplierAngle.slice(),
});

const rgbaFor = (fields: SemanticFields): RgbaViews => {
  const buffer = new Uint8ClampedArray(PIXELS * 4);
  for (let i = 0; i < PIXELS; i += 1) {
    buffer[i * 4] = (fields.status[i] ?? 0) * 50;
    buffer[i * 4 + 1] = (fields.period[i] ?? 0) * 10;
    buffer[i * 4 + 3] = 255;
  }
  return { stability: buffer, multiplier: buffer.slice(), period: buffer.slice() };
};

interface Options {
  readonly policy?: ParityPolicy;
  readonly tolerance?: FieldTolerancePolicy;
  readonly certificates?: ReadonlyMap<number, unknown>;
  readonly candRgba?: RgbaViews;
  readonly mismatchLimit?: number;
}

const run = (
  cand: SemanticFields,
  options: Options = {},
  base: SemanticFields = baselineFields(),
): CompareResult =>
  compareFrames({
    caseId: 'unit',
    raster: `${WIDTH}x${HEIGHT}`,
    width: WIDTH,
    height: HEIGHT,
    policy: options.policy ?? 'bit-identical',
    tolerance: options.tolerance,
    base,
    cand,
    baseRgba: rgbaFor(base),
    candRgba: options.candRgba ?? rgbaFor(cand),
    pixelToComplex: (x, y) => ({ re: x, im: -y }),
    certificates: options.certificates,
    ...(options.mismatchLimit === undefined ? {} : { mismatchLimit: options.mismatchLimit }),
  });

describe('tournament parity: bit-identical policy', () => {
  it('identicalFrames_haveNoViolations', () => {
    const result = run(baselineFields());
    expect(result.violationCount).toBe(0);
    expect(result.changedPixels).toBe(0);
    expect(result.fieldStats['status']?.identical).toBe(PIXELS);
  });

  it('periodPlusOne_isReportedWithCaseRasterPixelFieldAndValues', () => {
    const cand = copy(baselineFields());
    cand.period[5] = 4;
    const result = run(cand);
    expect(result.violationCount).toBeGreaterThanOrEqual(1);
    expect(result.mismatches[0]).toEqual({
      caseId: 'unit',
      raster: '4x3',
      pixel: 5,
      x: 1,
      y: 1,
      field: 'period',
      baseline: 3,
      candidate: 4,
    });
  });

  it('declaredMagnitudeTolerance_allowsSmallDeviationAndReportsMax', () => {
    const cand = copy(baselineFields());
    cand.multiplierMagnitude[5] = 0.5 + 2e-9;
    const tolerated = run(cand, { tolerance: { multiplierMagnitude: { absolute: 1e-8 } } });
    expect(tolerated.violationCount).toBe(1 - 1);
    expect(tolerated.fieldStats['multiplierMagnitude']?.withinTolerance).toBe(1);
    expect(tolerated.fieldStats['multiplierMagnitude']?.maxAbs).toBeCloseTo(2e-9, 15);
    expect(run(cand).violationCount).toBeGreaterThan(0);
    expect(
      run(cand, { tolerance: { multiplierMagnitude: { absolute: 1e-10 } } }).violationCount,
    ).toBe(2 - 1);
  });

  it('statusAndPeriodAreNeverTolerated', () => {
    const cand = copy(baselineFields());
    cand.status[4] = 0;
    const result = run(cand, {
      tolerance: {
        multiplierMagnitude: { absolute: 1e-7 },
        smoothIteration: { relative: 1e-9 },
      },
    });
    expect(result.mismatches.some((m) => m.field === 'status' && m.pixel === 4)).toBe(true);
    const periodOnly = copy(baselineFields());
    periodOnly.period[6] = 99;
    const periodResult = run(periodOnly, {
      tolerance: { multiplierMagnitude: { absolute: 1e-7 } },
      candRgba: rgbaFor(baselineFields()),
    });
    expect(periodResult.violationCount).toBe(1);
    expect(periodResult.mismatches[0]?.field).toBe('period');
  });

  it('directionTolerance_isWrapSafeAndDeclaredOnly', () => {
    const base = baselineFields();
    base.multiplierAngle[5] = Math.PI;
    const cand = copy(base);
    cand.multiplierAngle[5] = -Math.PI + 1e-9;
    expect(run(cand, {}, base).violationCount).toBeGreaterThan(0);
    const tolerated = run(cand, { tolerance: { multiplierDirection: { absolute: 3e-8 } } }, base);
    expect(tolerated.violationCount).toBe(0);
    expect(tolerated.fieldStats['multiplierDirection']?.withinTolerance).toBe(1);
  });

  it('mismatchList_isCappedButCountIsComplete', () => {
    const cand = copy(baselineFields());
    for (let i = 0; i < 4; i += 1) cand.smoothIteration[i] = (cand.smoothIteration[i] ?? 0) + 1;
    for (let i = 4; i < 8; i += 1) cand.multiplierMagnitude[i] = 0.25;
    const result = run(cand, { mismatchLimit: 3 });
    expect(result.mismatches).toHaveLength(3);
    expect(result.violationCount).toBeGreaterThan(3);
  });

  it('rgbaDifference_failsUnlessWithinDeclaredByteDelta', () => {
    const cand = baselineFields();
    const rgba = rgbaFor(cand);
    const stability = rgba.stability;
    if (stability === undefined) throw new Error('unreachable');
    stability[0] = (stability[0] ?? 0) + 1;
    expect(run(cand, { candRgba: rgba }).mismatches[0]?.field).toBe('rgba:stability');
    const tolerated = run(cand, { candRgba: rgba, tolerance: { rgbaMaxChannelDelta: 1 } });
    expect(tolerated.violationCount).toBe(0);
    expect(tolerated.fieldStats['rgba:stability']?.maxAbs).toBe(1);
  });

  it('rejectedToleranceDeclaration_failsEvenIfPixelsMatch', () => {
    const result = run(baselineFields(), { tolerance: { smoothIteration: { relative: 1e-3 } } });
    expect(result.mismatches[0]?.field).toBe('tolerance-declaration');
  });
});

describe('tournament parity: semantic-revision policy', () => {
  const policy = 'semantic-revision' as const;
  const tolerance: FieldTolerancePolicy = { multiplierMagnitude: { absolute: 1e-6 } };

  it('acceptedLambdaMayMoveWithinToleranceButNotBeyond', () => {
    const cand = copy(baselineFields());
    cand.multiplierMagnitude[4] = 0.5 + 5e-7;
    expect(run(cand, { policy, tolerance }).violationCount).toBe(0);
    cand.multiplierMagnitude[4] = 0.5 + 5e-5;
    expect(run(cand, { policy, tolerance }).violationCount).toBeGreaterThan(0);
  });

  it('acceptedPixelChangingPeriodOrBecomingUnresolvedFails', () => {
    const periodChange = copy(baselineFields());
    periodChange.period[4] = 6;
    expect(run(periodChange, { policy, tolerance }).mismatches[0]?.field).toBe('period');
    const lost = copy(baselineFields());
    lost.status[5] = 0;
    lost.period[5] = 0;
    expect(run(lost, { policy, tolerance }).mismatches[0]).toMatchObject({
      field: 'status',
      pixel: 5,
    });
  });

  it('escapedPixelsMustBeBitIdentical', () => {
    const cand = copy(baselineFields());
    cand.smoothIteration[1] = (cand.smoothIteration[1] ?? 0) + 1e-15;
    const result = run(cand, { policy, tolerance });
    expect(result.mismatches[0]).toMatchObject({ field: 'smoothIteration', pixel: 1 });
  });

  it('unresolvedPixelMayStayUnresolved', () => {
    expect(run(baselineFields(), { policy, tolerance }).conversionCount).toBe(0);
  });

  it('unresolvedToAccepted_isCountedListedAndNeedsACertificate', () => {
    const cand = copy(baselineFields());
    cand.status[9] = 2;
    cand.period[9] = 5;
    cand.multiplierMagnitude[9] = 0.7;
    cand.multiplierAngle[9] = 1.25;
    const withCert = run(cand, {
      policy,
      tolerance,
      certificates: new Map([[9, { disk: 'r=1e-3' }]]),
    });
    expect(withCert.violationCount).toBe(0);
    expect(withCert.conversionCount).toBe(1);
    expect(withCert.conversions[0]).toMatchObject({
      caseId: 'unit',
      pixel: 9,
      x: 1,
      y: 2,
      c: { re: 1, im: -2 },
      period: 5,
      multiplierMagnitude: 0.7,
      certificate: { disk: 'r=1e-3' },
    });
    const without = run(cand, { policy, tolerance });
    expect(without.conversionCount).toBe(1);
    expect(without.mismatches[0]?.field).toBe('conversion.certificate');
  });

  it('unresolvedToEscaped_isAlwaysAFailure', () => {
    const cand = copy(baselineFields());
    cand.status[10] = 1;
    cand.smoothIteration[10] = 4;
    const result = run(cand, { policy, tolerance, certificates: new Map([[10, {}]]) });
    expect(result.mismatches[0]).toMatchObject({ field: 'status', pixel: 10 });
  });

  it('conversionWithPeriodZeroOrLambdaAtLeastOneFails', () => {
    const cand = copy(baselineFields());
    cand.status[9] = 2;
    cand.multiplierMagnitude[9] = 1;
    const result = run(cand, { policy, certificates: new Map([[9, {}]]) });
    expect(result.mismatches.map((m) => m.field)).toEqual([
      'conversion.period',
      'conversion.multiplierMagnitude',
    ]);
  });

  it('rgbaMustMatchOnUnchangedPixelsButMayDifferOnChangedOnes', () => {
    const cand = copy(baselineFields());
    cand.multiplierMagnitude[4] = 0.5 + 5e-7;
    const rgba = rgbaFor(cand);
    const multiplier = rgba.multiplier;
    if (multiplier === undefined) throw new Error('unreachable');
    multiplier[4 * 4 + 2] = 200; // changed pixel: exempt
    expect(run(cand, { policy, tolerance, candRgba: rgba }).violationCount).toBe(0);
    multiplier[0] = 99; // unchanged escaped pixel: must match
    expect(run(cand, { policy, tolerance, candRgba: rgba }).mismatches[0]?.field).toBe(
      'rgba:multiplier',
    );
  });

  it('iterationDistribution_isReportedWithoutGating', () => {
    const base = { ...baselineFields(), iterations: new Uint32Array(PIXELS).fill(100) };
    const cand = { ...copy(baselineFields()), iterations: new Uint32Array(PIXELS).fill(100) };
    cand.iterations[4] = 40;
    cand.iterations[5] = 60;
    const result = run(cand, { policy, tolerance }, base);
    expect(result.violationCount).toBe(0);
    expect(result.iterationDeltas?.['attracting']).toMatchObject({
      compared: 4,
      differing: 2,
      min: -60,
      max: -40,
    });
  });
});

describe('tournament parity: candidate aggregation', () => {
  it('toleranceReport_listsDeclaredToleranceWithMaxObservedDeviation', () => {
    const cand = copy(baselineFields());
    cand.multiplierMagnitude[4] = 0.5 + 3e-9;
    cand.multiplierMagnitude[5] = 0.5 + 1e-9;
    const tolerance: FieldTolerancePolicy = {
      multiplierMagnitude: { absolute: 1e-8 },
      note: 'unit',
    };
    const result = run(cand, { tolerance });
    const aggregate = aggregateCandidate({
      id: 'x',
      description: 'x',
      policy: 'bit-identical',
      tolerance,
      cases: [{ caseId: 'unit', raster: '4x3', result, error: undefined }],
      oracle: undefined,
    });
    expect(aggregate.passed).toBe(true);
    expect(aggregate.declaredTolerances).toHaveLength(1);
    expect(aggregate.declaredTolerances[0]?.maxObservedAbs).toBeCloseTo(3e-9, 15);
    expect(aggregate.declaredTolerances[0]?.pixelsWithinTolerance).toBe(2);
  });

  it('threwWhileRendering_failsTheCandidate', () => {
    const aggregate = aggregateCandidate({
      id: 'x',
      description: 'x',
      policy: 'bit-identical',
      tolerance: undefined,
      cases: [{ caseId: 'unit', raster: '4x3', result: undefined, error: 'boom' }],
      oracle: undefined,
    });
    expect(aggregate.passed).toBe(false);
  });
});
