import { describe, expect, it } from 'vitest';

import { verifyCycle, VERIFIER_REVISION, VERIFIER_THRESHOLDS } from './verifier.ts';

/** Plain binary64 orbit walk used only to place test cycle starts. */
const orbitAt = (cRe: number, cIm: number, iterations: number): [number, number] => {
  let zRe = 0;
  let zIm = 0;
  for (let index = 0; index < iterations; index += 1) {
    const nextRe = zRe * zRe - zIm * zIm + cRe;
    zIm = 2 * zRe * zIm + cIm;
    zRe = nextRe;
  }
  return [zRe, zIm];
};

const RABBIT_NEIGHBORHOOD = [-0.1205, 0.7438] as const;
const RABBIT_CENTER = [-0.1225611668766535, 0.7448617666197435] as const;

describe('common verifier', () => {
  it('reduces a true period-3 cycle proposed as 6 and 12 back to period 3', () => {
    const [zRe, zIm] = orbitAt(RABBIT_NEIGHBORHOOD[0], RABBIT_NEIGHBORHOOD[1], 200);
    for (const proposed of [3, 6, 12]) {
      const verdict = verifyCycle(
        RABBIT_NEIGHBORHOOD[0],
        RABBIT_NEIGHBORHOOD[1],
        zRe,
        zIm,
        proposed,
      );
      expect(verdict).toMatchObject({ verdict: 'accepted', period: 3 });
    }
  });

  it('emits |lambda|, arg lambda, kappa, and the verifier revision on acceptance', () => {
    const [zRe, zIm] = orbitAt(RABBIT_NEIGHBORHOOD[0], RABBIT_NEIGHBORHOOD[1], 200);
    const verdict = verifyCycle(RABBIT_NEIGHBORHOOD[0], RABBIT_NEIGHBORHOOD[1], zRe, zIm, 3);

    expect(verdict.verdict).toBe('accepted');
    if (verdict.verdict === 'accepted') {
      expect(verdict.multiplierMagnitude).toBeGreaterThan(0);
      expect(verdict.multiplierMagnitude).toBeLessThan(1);
      expect(verdict.multiplierAngle).toBeGreaterThanOrEqual(-Math.PI);
      expect(verdict.multiplierAngle).toBeLessThanOrEqual(Math.PI);
      expect(verdict.kappa).toBeGreaterThan(0);
      expect(verdict.residualScaled).toBeLessThanOrEqual(
        VERIFIER_THRESHOLDS.tauAccept * VERIFIER_THRESHOLDS.closureRelaxation,
      );
      expect(verdict.verifierRevision).toBe(VERIFIER_REVISION);
    }
  });

  it('returns unresolved when a divisor residual sits in the ambiguity gap', () => {
    // c = -0.3125 has the attracting fixed point z* = -0.25 with lambda = -0.5.
    // For z = z* + 1e-8: the proposed period-2 closure residual is |lambda^2-1|
    // * eps = 7.5e-9 (accepted), while divisor-1 closure is |lambda-1| * eps =
    // 1.5e-8, inside the (1e-8, 1e-6) gap, so primitivity is undecidable.
    const verdict = verifyCycle(-0.3125, 0, -0.25 + 1e-8, 0, 2);

    expect(verdict).toMatchObject({ verdict: 'unresolved', reason: 'divisor-ambiguous' });
  });

  it('returns unresolved when the proposed closure residual sits in the ambiguity gap', () => {
    // At the superattracting rabbit center the multiplier vanishes, so a
    // perturbation epsilon of a cycle point gives f^6(z) - z ~ epsilon.
    // epsilon = 5e-7 lands inside the (1e-8, 1e-6) gap.
    const [zRe, zIm] = orbitAt(RABBIT_CENTER[0], RABBIT_CENTER[1], 30);
    const verdict = verifyCycle(RABBIT_CENTER[0], RABBIT_CENTER[1], zRe + 5e-7, zIm, 6);

    expect(verdict).toMatchObject({ verdict: 'unresolved', reason: 'closure-ambiguous' });
  });

  it('reduces a period-2 proposal at a fixed point to period 1', () => {
    // Without the perturbation, closure holds at divisor 1 exactly, so the
    // period-2 proposal must reduce rather than emit a false primitive 2.
    const verdict = verifyCycle(-0.3125, 0, -0.25, 0, 2);

    expect(verdict).toMatchObject({ verdict: 'accepted', period: 1, multiplierMagnitude: 0.5 });
  });

  it('rejects a repelling fixed point on the attraction margin', () => {
    // z = (1 + sqrt(1.4))/2 is the repelling fixed point of z^2 - 0.1 with
    // |lambda| = 2|z| ~ 2.18; closure holds exactly, attraction does not.
    const repellingFixedPoint = (1 + Math.sqrt(1.4)) / 2;
    const verdict = verifyCycle(-0.1, 0, repellingFixedPoint, 0, 1);

    expect(verdict).toMatchObject({ verdict: 'rejected', reason: 'not-attracting' });
  });

  it('rejects non-finite states from overflowing walks', () => {
    const verdict = verifyCycle(1e308, 1e308, 1, 1, 4);

    expect(verdict).toMatchObject({ verdict: 'rejected', reason: 'non-finite' });
  });

  it('rejects cycle starts that do not close at the proposed period', () => {
    const verdict = verifyCycle(0.5, 0.5, 0.3, 0.3, 7);

    expect(verdict).toMatchObject({ verdict: 'rejected', reason: 'no-closure' });
  });

  it('treats a vanishing multiplier at c = 0 by identity', () => {
    const verdict = verifyCycle(0, 0, 0, 0, 1);

    expect(verdict).toMatchObject({
      verdict: 'accepted',
      period: 1,
      multiplierMagnitude: 0,
      multiplierAngle: 0,
      kappa: Number.POSITIVE_INFINITY,
    });
  });
});
