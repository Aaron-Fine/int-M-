import { describe, expect, it } from 'vitest';

import {
  classifyOrbit,
  classifyPeriodThreeInto,
  createOrbitSample,
  ORBIT_EVIDENCE_CODE,
  PERIOD_THREE_ALLOWANCE_COEFFICIENT,
  PERIOD_THREE_ANALYTIC_REVISION,
  type OrbitSample,
} from '../../../src/domain';

/**
 * Analytic period-3 fast path (ADR 0010). Expected multipliers are mpmath
 * values (50 digits) of the closed form at the binary64 parameter shown,
 * computed for docs/superpowers/plans/2026-10-16-analytic-period-three.md;
 * the boundary points come from the inverse map lambda = r e^{i}, continued
 * from the rabbit centre.
 */

const SENTINEL = -7;

const sentinelSample = (): OrbitSample => ({
  ...createOrbitSample(),
  status: 0,
  period: SENTINEL,
  multiplierMagnitude: SENTINEL,
});

const accept = (re: number, im: number): OrbitSample => {
  const sample = sentinelSample();
  expect(classifyPeriodThreeInto(re, im, sample)).toBe(true);
  expect(sample.status).toBe(2);
  expect(sample.period).toBe(3);
  expect(sample.iterations).toBe(0);
  expect(sample.evidence).toBe(ORBIT_EVIDENCE_CODE.analyticPeriod3Component);
  return sample;
};

const refuse = (re: number, im: number): void => {
  const sample = sentinelSample();
  expect(classifyPeriodThreeInto(re, im, sample)).toBe(false);
  // A refusal leaves the record untouched.
  expect(sample.period).toBe(SENTINEL);
  expect(sample.multiplierMagnitude).toBe(SENTINEL);
};

describe('classifyPeriodThreeInto', () => {
  it('accepts the three superattracting centres (roots of c^3 + 2c^2 + c + 1)', () => {
    const airplane = accept(-1.7548776662466927, 0);
    expect(airplane.multiplierMagnitude).toBeLessThan(1e-13);
    const rabbit = accept(-0.12256116687665362, 0.7448617666197442);
    expect(rabbit.multiplierMagnitude).toBeLessThan(1e-13);
    const corabbit = accept(-0.12256116687665362, -0.7448617666197442);
    expect(corabbit.multiplierMagnitude).toBeLessThan(1e-13);
    // Superattracting identity: |lambda| = 0 means arg lambda = 0.
    if (rabbit.multiplierMagnitude === 0) {
      expect(rabbit.multiplierAngle).toBe(0);
    }
  });

  it('refuses the airplane cusp c = -7/4 exactly, where lambda = 1', () => {
    refuse(-1.75, 0);
  });

  it('accepts just inside the cusp and refuses just outside it', () => {
    // c = -7/4 - delta (inside the airplane): lambda = 1 - 4 delta - 14 sqrt(delta).
    expect(Math.abs(accept(-1.750001, 0).multiplierMagnitude - 0.9859959920005762)).toBeLessThan(
      1e-13,
    );
    expect(
      Math.abs(accept(-1.750000000001, 0).multiplierMagnitude - 0.9999859993737094),
    ).toBeLessThan(1e-13);
    // c = -7/4 + delta: |lambda| > 1 on both roots.
    refuse(-1.749999, 0);
    refuse(-1.749999999999, 0);
  });

  it('accepts down to the margin near the rabbit boundary and refuses inside it', () => {
    // |lambda| = 1 - 1e-3, 1 - 1e-9 and 1 - 1e-11 at arg lambda = 1.
    const far = accept(-0.04585527427169738, 0.6923152138236197);
    expect(Math.abs(far.multiplierMagnitude - 0.9989999999999998)).toBeLessThan(1e-13);
    expect(Math.abs(far.multiplierAngle - 1)).toBeLessThan(1e-12);
    const near = accept(-0.04577863707377464, 0.692264905409385);
    expect(Math.abs(near.multiplierMagnitude - 0.9999999990000003)).toBeLessThan(1e-13);
    const nearer = accept(-0.045778636997903986, 0.6922649053595819);
    expect(Math.abs(nearer.multiplierMagnitude - 0.99999999999)).toBeLessThan(1e-13);
    // |lambda| = 1 - 1e-13 is inside the 1e-12 attraction margin.
    refuse(-0.04577863699714528, 0.6922649053590838);
  });

  it('matches the high-precision multiplier at the weak-attraction corpus centre', () => {
    const sample = accept(-0.1205, 0.8268);
    expect(Math.abs(sample.multiplierRe - -0.8746775181866886)).toBeLessThan(1e-14);
    expect(Math.abs(sample.multiplierIm - -0.04004509961793429)).toBeLessThan(1e-14);
  });

  it('refuses a period-6 satellite of the rabbit inside the gate box', () => {
    // On the segment from the rabbit's 1/2 root to the period-6 centre:
    // |lambda_3| = 1.0246 (repelling), |lambda_6| = 0.9015.
    const satellite = { re: -0.1155037469844854, im: 0.8402560718860035 };
    refuse(satellite.re, satellite.im);
    const result = classifyOrbit(satellite, { maxIterations: 4096, maxPeriod: 8 });
    expect(result).toMatchObject({ status: 'attracting-cycle', period: 6 });
    // The period-6 centre itself.
    refuse(-0.11341865594943658, 0.860569472501573);
    expect(classifyOrbit({ re: -0.11341865594943658, im: 0.860569472501573 })).toMatchObject({
      status: 'attracting-cycle',
      period: 6,
    });
  });

  it('gives the conjugate parameter the conjugate multiplier, bit for bit', () => {
    for (const [re, im] of [
      [-0.1205, 0.8268],
      [-0.04585527427169738, 0.6923152138236197],
      [-1.755, 0.003],
    ] as const) {
      const direct = accept(re, im);
      const conjugate = accept(re, -im);
      expect(conjugate.multiplierRe).toBe(direct.multiplierRe);
      expect(conjugate.multiplierIm).toBe(-direct.multiplierIm);
      expect(conjugate.multiplierMagnitude).toBe(direct.multiplierMagnitude);
      expect(Math.abs(conjugate.multiplierAngle + direct.multiplierAngle)).toBeLessThan(1e-15);
    }
  });

  it('refuses NaN and infinite parameters', () => {
    for (const [re, im] of [
      [Number.NaN, 0],
      [0, Number.NaN],
      [Number.POSITIVE_INFINITY, 0],
      [Number.NEGATIVE_INFINITY, 0.5],
      [-0.12, Number.POSITIVE_INFINITY],
      [-1.75, Number.NEGATIVE_INFINITY],
    ] as const) {
      refuse(re, im);
    }
  });

  it('keeps the classifier honest on NaN and infinite parameters', () => {
    expect(classifyOrbit({ re: Number.NaN, im: 0 }).status).toBe('unresolved');
    expect(classifyOrbit({ re: Number.POSITIVE_INFINITY, im: 0 }).status).toBe('escaped');
  });

  it('documents the allowance coefficient (2^-46 = 128 u) and the revision', () => {
    expect(PERIOD_THREE_ALLOWANCE_COEFFICIENT).toBe(128 * 2 ** -53);
    expect(PERIOD_THREE_ANALYTIC_REVISION).toBe('src-analytic-p3-1.0.0');
  });
});
