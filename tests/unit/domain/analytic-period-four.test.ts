import { describe, expect, it } from 'vitest';

import {
  classifyOrbit,
  classifyPeriodFourInto,
  createOrbitSample,
  ORBIT_EVIDENCE_CODE,
  PERIOD_FOUR_ANALYTIC_REVISION,
  PERIOD_FOUR_EVALUATION_BOUND,
  type OrbitSample,
  type PeriodFourCertificate,
} from '../../../src/domain';

/**
 * Analytic period-4 fast path (ADR 0013). Expected multipliers are mpmath
 * values (50 digits) of the smallest root of the exact cubic at the binary64
 * parameter shown, computed for
 * docs/superpowers/plans/2026-10-17-analytic-period-four.md; the boundary
 * points come from the inverse map lambda = r e^{i}, continued from the
 * cardioid satellite's centre.
 */

const SENTINEL = -7;

const sentinelSample = (): OrbitSample => ({
  ...createOrbitSample(),
  status: 0,
  period: SENTINEL,
  multiplierMagnitude: SENTINEL,
});

const emptyCertificate = (): PeriodFourCertificate => ({
  productRe: Number.NaN,
  productIm: Number.NaN,
  residualBound: Number.NaN,
  derivativeBound: Number.NaN,
  curvatureBound: Number.NaN,
  radiusRatio: Number.NaN,
  allowance: Number.NaN,
  certified: false,
});

const accept = (re: number, im: number): OrbitSample => {
  const sample = sentinelSample();
  expect(classifyPeriodFourInto(re, im, sample)).toBe(true);
  expect(sample.status).toBe(2);
  expect(sample.period).toBe(4);
  expect(sample.iterations).toBe(0);
  expect(sample.evidence).toBe(ORBIT_EVIDENCE_CODE.analyticPeriod4Component);
  return sample;
};

const refuse = (re: number, im: number): PeriodFourCertificate => {
  const sample = sentinelSample();
  const certificate = emptyCertificate();
  expect(classifyPeriodFourInto(re, im, sample, certificate)).toBe(false);
  // A refusal leaves the record untouched.
  expect(sample.period).toBe(SENTINEL);
  expect(sample.multiplierMagnitude).toBe(SENTINEL);
  return certificate;
};

describe('classifyPeriodFourInto', () => {
  it('accepts the six superattracting centres (roots of G4)', () => {
    for (const [re, im] of [
      [-1.9407998065294847, 0],
      [-1.3107026413368328, 0],
      [0.2822713907669139, 0.5300606175785253],
      [0.2822713907669139, -0.5300606175785253],
      [-0.15652016683375505, 1.0322471089228318],
      [-0.15652016683375505, -1.0322471089228318],
    ] as const) {
      expect(accept(re, im).multiplierMagnitude).toBeLessThan(1e-11);
    }
    // |lambda| = 0 exactly gives arg lambda = 0 (superattracting identity).
    const satellite = accept(0.2822713907669139, 0.5300606175785253);
    expect(satellite.multiplierMagnitude).toBe(0);
    expect(satellite.multiplierAngle).toBe(0);
  });

  it('refuses the two satellite roots, where lambda = 1 is a simple root', () => {
    expect(refuse(-1.25, 0).certified).toBe(true);
    expect(refuse(0.25, 0.5).certified).toBe(true);
  });

  it('resolves the 6,000,000x view: inside the 1/2 satellite of the period-2 bulb', () => {
    // c = -5/4 - delta: lambda = 1 - 16 delta + O(delta^2), real.
    expect(Math.abs(accept(-1.250000001, 0).multiplierMagnitude - 0.9999999839999987)).toBeLessThan(
      1e-11,
    );
    expect(Math.abs(accept(-1.2500001, 0).multiplierMagnitude - 0.9999983999999223)).toBeLessThan(
      1e-11,
    );
    // c = -5/4 + delta lies in the period-2 bulb: the 4-cycle repels.
    refuse(-1.249999999, 0);
    refuse(-1.2499999, 0);
  });

  it('falls through within 1e-12 of the real primitive cusp although the cycle attracts', () => {
    // The cusp -1.9405507889761495 (a root of (4c + 3)^3 + 108): the cubic has
    // a double root at lambda = 1, so |M'| -> 0 and the certificate fails.
    const cusp = -1.9405507889761495;
    // 1e-10 inside: |lambda| = 0.99936903026224, allowance 1.3e-6.
    expect(Math.abs(accept(cusp - 1e-10, 0).multiplierMagnitude - 0.9993690302622427)).toBeLessThan(
      2e-6,
    );
    // 1e-12 inside: |lambda| = 0.99993690302937 (attracting) but no certificate.
    expect(refuse(cusp - 1e-12, 0).certified).toBe(false);
    expect(refuse(cusp - 1e-14, 0).certified).toBe(false);
    // Outside the component: the attracting candidate is missing (|lambda| > 1).
    refuse(cusp + 1e-6, 0);
  });

  it('accepts down to the margin near the cardioid satellite boundary and refuses inside it', () => {
    // |lambda| = 1 - 1e-3, 1 - 1e-9 and 1 - 1e-11 at arg lambda = 1.
    const far = accept(0.28932280353135603, 0.48787017199586313);
    expect(Math.abs(far.multiplierMagnitude - 0.9990000000000003)).toBeLessThan(1e-12);
    expect(Math.abs(far.multiplierAngle - 1)).toBeLessThan(1e-12);
    const near = accept(0.2893305340939819, 0.48782915322182385);
    expect(Math.abs(near.multiplierMagnitude - 0.9999999989999996)).toBeLessThan(1e-12);
    const nearer = accept(0.28933053410163573, 0.4878291531812164);
    expect(Math.abs(nearer.multiplierMagnitude - 0.9999999999899993)).toBeLessThan(1e-12);
    // |lambda| = 1 - 1e-13 is inside the 1e-12 attraction margin.
    expect(refuse(0.2893305341017123, 0.48782915318081027).certified).toBe(true);
  });

  it('matches the high-precision multiplier at the three hard corpus centres', () => {
    const cases: readonly (readonly [number, number, number, number])[] = [
      [-0.158902249, -1.034028, -0.5583390470795281, 0.00021966886371906636],
      [-1.94130973, -0.0000974722949, -0.7553327603774783, -0.1131888566758074],
      [0.305376533, 0.552677981, -0.7353829376901141, -0.06370106478279645],
    ];
    for (const [re, im, lambdaRe, lambdaIm] of cases) {
      const sample = accept(re, im);
      expect(Math.abs(sample.multiplierRe - lambdaRe)).toBeLessThan(1e-11);
      expect(Math.abs(sample.multiplierIm - lambdaIm)).toBeLessThan(1e-11);
    }
  });

  it('refuses period-8 satellites inside the gate boxes; the orbit path finds period 8', () => {
    for (const [re, im] of [
      // The 1/2 satellite of the 6,000,000x component, inside its box.
      [-1.369, 0],
      [-1.3695, 0.001],
      // The 1/2 satellite of the cardioid's 1/4 satellite, inside its box.
      [0.3177311315746825, 0.5587291937376531],
    ] as const) {
      expect(refuse(re, im).certified).toBe(true);
      expect(classifyOrbit({ re, im }, { maxIterations: 4096, maxPeriod: 16 })).toMatchObject({
        status: 'attracting-cycle',
        period: 8,
      });
    }
  });

  it('gives the conjugate parameter the conjugate multiplier, bit for bit', () => {
    for (const [re, im] of [
      [-0.158902249, -1.034028],
      [0.305376533, 0.552677981],
      [-1.94130973, -0.0000974722949],
      [-1.3, 0.02],
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
      [-1.3, Number.POSITIVE_INFINITY],
      [0.28, Number.NEGATIVE_INFINITY],
    ] as const) {
      refuse(re, im);
    }
  });

  it('reports its certificate when asked, and the kernels never need it', () => {
    const certificate = emptyCertificate();
    const sample = sentinelSample();
    expect(classifyPeriodFourInto(-1.250000001, 0, sample, certificate)).toBe(true);
    expect(certificate.certified).toBe(true);
    expect(certificate.residualBound).toBeGreaterThan(0);
    expect(certificate.derivativeBound).toBeGreaterThan(0);
    expect(certificate.allowance).toBe(64 * certificate.radiusRatio + 2 ** -50);
    expect(16 * certificate.productRe).toBe(sample.multiplierRe);
    expect(16 * certificate.productIm).toBe(sample.multiplierIm);
    expect(certificate.allowance).toBeLessThan(1e-11);
  });

  it('documents the evaluation bound (2^-47 = 64 u) and the revision', () => {
    expect(PERIOD_FOUR_EVALUATION_BOUND).toBe(64 * 2 ** -53);
    expect(PERIOD_FOUR_ANALYTIC_REVISION).toBe('src-analytic-p4-1.0.0');
  });
});
