import { describe, expect, it } from 'vitest';

import {
  createOrbitSample,
  ORBIT_EVIDENCE_CODE,
  TAU_CLOSURE_SCALED,
  VERIFIER_REVISION,
  VERIFIER_THRESHOLDS,
  VERIFIER_VERDICT,
  verifyCycle,
  verifyCycleInto,
} from '../../../src/domain';
import type { VerifierVerdict } from '../../../src/domain';

/**
 * Unit tests for the common numerical verifier (plan section 3, PR 3):
 * three-way proper-divisor reduction, closure ambiguity, attraction margin,
 * superattracting identity, and non-finite refusal. The differential that
 * pins the classifyInto lag-scan inline mirror to this canonical body lives
 * in orbit-scalar-parity.test.ts.
 */

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

/**
 * Exact period-1 multiplier map: for lambda with magnitude m and angle theta
 * the attracting fixed point is z* = lambda/2 and c = z* - z*^2, so |lambda|
 * is fixed by construction and the closure residual is rounding noise.
 */
const fixedPointCase = (
  magnitude: number,
  theta: number,
): { readonly cRe: number; readonly cIm: number; readonly zRe: number; readonly zIm: number } => {
  const lambdaRe = magnitude * Math.cos(theta);
  const lambdaIm = magnitude * Math.sin(theta);
  const zRe = lambdaRe / 2;
  const zIm = lambdaIm / 2;
  return {
    cRe: zRe - (zRe * zRe - zIm * zIm),
    cIm: zIm - 2 * zRe * zIm,
    zRe,
    zIm,
  };
};

describe('common verifier (src policy src-verifier-1.0.0)', () => {
  it('reduces a true period-3 cycle proposed at lag 6, 9, and 12 to period 3', () => {
    const [cRe, cIm] = RABBIT_NEIGHBORHOOD;
    const [zRe, zIm] = orbitAt(cRe, cIm, 400);
    for (const proposed of [3, 6, 9, 12]) {
      const verdict = verifyCycle(cRe, cIm, zRe, zIm, proposed);
      expect(verdict).toMatchObject({ verdict: 'accepted', period: 3 });
    }
  });

  it('emits identical multiplier bits for every proposal that reduces to the same primitive', () => {
    const [cRe, cIm] = RABBIT_NEIGHBORHOOD;
    const [zRe, zIm] = orbitAt(cRe, cIm, 400);
    const verdicts = [3, 6, 9, 12].map((proposed) => verifyCycle(cRe, cIm, zRe, zIm, proposed));
    const first = verdicts[0];
    expect(first?.verdict).toBe('accepted');
    if (first?.verdict !== 'accepted') {
      return;
    }
    for (const verdict of verdicts.slice(1)) {
      expect(verdict.verdict).toBe('accepted');
      if (verdict.verdict === 'accepted') {
        expect(verdict.multiplierMagnitude).toBe(first.multiplierMagnitude);
        expect(verdict.multiplierAngle).toBe(first.multiplierAngle);
        expect(verdict.kappa).toBe(first.kappa);
      }
    }
  });

  it('reduces a period-2 proposal at an exact fixed point to period 1', () => {
    // c = -0.3125 has the attracting fixed point z* = -0.25 with
    // lambda = -0.5; closure holds at divisor 1 exactly, so the period-2
    // proposal must reduce rather than emit a false primitive 2.
    const verdict = verifyCycle(-0.3125, 0, -0.25, 0, 2);

    expect(verdict).toMatchObject({ verdict: 'accepted', period: 1, multiplierMagnitude: 0.5 });
  });

  it('returns unresolved when a divisor residual sits in the ambiguity gap', () => {
    // c = -0.3125, z* = -0.25, lambda = -0.5. For z = z* + 1e-8: the
    // proposed period-2 closure residual is |lambda^2 - 1| * eps = 7.5e-9
    // (accepted), while divisor-1 closure is |lambda - 1| * eps = 1.5e-8,
    // inside the (1e-8, 1e-6) gap, so primitivity is undecidable.
    const verdict = verifyCycle(-0.3125, 0, -0.25 + 1e-8, 0, 2);

    expect(verdict).toMatchObject({ verdict: 'unresolved', reason: 'divisor-ambiguous' });
  });

  it('returns unresolved when the proposed closure residual sits in the ambiguity gap', () => {
    // At the superattracting rabbit center the multiplier vanishes, so a
    // perturbation epsilon of a cycle point gives f^6(z) - z ~ epsilon.
    // epsilon = 5e-7 lands inside the (1e-8, 1e-6) gap.
    const [cRe, cIm] = RABBIT_CENTER;
    const [zRe, zIm] = orbitAt(cRe, cIm, 30);
    const verdict = verifyCycle(cRe, cIm, zRe + 5e-7, zIm, 6);

    expect(verdict).toMatchObject({ verdict: 'unresolved', reason: 'closure-ambiguous' });
  });

  it('rejects margin-adjacent attraction and accepts clearly attracting cycles', () => {
    for (const theta of [0, Math.PI / 2, Math.PI, 2.3]) {
      // |lambda| = 1 - 1e-13 is inside the margin band [1 - 1e-12, 1):
      // refused on attraction after closure holds.
      const marginal = fixedPointCase(1 - 1e-13, theta);
      const marginalVerdict = verifyCycle(
        marginal.cRe,
        marginal.cIm,
        marginal.zRe,
        marginal.zIm,
        1,
      );
      expect(marginalVerdict).toMatchObject({ verdict: 'rejected', reason: 'not-attracting' });

      // Exactly parabolic |lambda| = 1 is refused as well.
      const parabolic = fixedPointCase(1, theta);
      const parabolicVerdict = verifyCycle(
        parabolic.cRe,
        parabolic.cIm,
        parabolic.zRe,
        parabolic.zIm,
        1,
      );
      expect(parabolicVerdict).toMatchObject({ verdict: 'rejected', reason: 'not-attracting' });

      // |lambda| = 1 - 1e-6 is far from the margin band: accepted.
      const weak = fixedPointCase(1 - 1e-6, theta);
      const weakVerdict = verifyCycle(weak.cRe, weak.cIm, weak.zRe, weak.zIm, 1);
      expect(weakVerdict).toMatchObject({ verdict: 'accepted', period: 1 });
    }
  });

  it('scales the acceptance bound with the cycle-start magnitude', () => {
    // Period-1 synthetic states with closure residual delta = 1.5e-8.
    // At scale 1 the residual is inside the (1e-8, 1e-6) ambiguity gap;
    // at scale 1.9 the scaled acceptance bound 1.9e-8 covers it, so the
    // candidate passes closure and is refused only on attraction
    // (|2z| > 1) instead of being closed-ambiguous.
    const delta = 1.5 * TAU_CLOSURE_SCALED;
    expect(delta).toBeGreaterThan(TAU_CLOSURE_SCALED);
    expect(delta).toBeLessThanOrEqual(1.9 * TAU_CLOSURE_SCALED);

    const unitScaleStart = 0.9;
    const unitScaleC = unitScaleStart - unitScaleStart * unitScaleStart + delta;
    const unitScale = verifyCycle(unitScaleC, 0, unitScaleStart, 0, 1);
    expect(unitScale).toMatchObject({ verdict: 'unresolved', reason: 'closure-ambiguous' });

    const largeScaleStart = 1.9;
    const largeScaleC = largeScaleStart - largeScaleStart * largeScaleStart + delta;
    const largeScale = verifyCycle(largeScaleC, 0, largeScaleStart, 0, 1);
    expect(largeScale).toMatchObject({ verdict: 'rejected', reason: 'not-attracting' });
  });

  it('treats a vanishing multiplier by identity: |lambda| = 0, angle 0, kappa = +Infinity', () => {
    // c = 0: the fixed point z* = 0 has lambda = 0 exactly.
    const cardioid = verifyCycle(0, 0, 0, 0, 1);
    expect(cardioid).toMatchObject({
      verdict: 'accepted',
      period: 1,
      multiplierMagnitude: 0,
      multiplierAngle: 0,
      kappa: Number.POSITIVE_INFINITY,
    });

    // c = -1: the period-2 cycle {-1, 0} contains the critical point, so the
    // derivative product vanishes exactly.
    const bulb = verifyCycle(-1, 0, -1, 0, 2);
    expect(bulb).toMatchObject({
      verdict: 'accepted',
      period: 2,
      multiplierMagnitude: 0,
      multiplierAngle: 0,
      kappa: Number.POSITIVE_INFINITY,
    });
  });

  it('rejects repelling cycles that close exactly', () => {
    // z = (1 + sqrt(1.4))/2 is the repelling fixed point of z^2 - 0.1 with
    // |lambda| = 2|z| ~ 2.18; closure holds exactly, attraction does not.
    const repellingFixedPoint = (1 + Math.sqrt(1.4)) / 2;
    const verdict = verifyCycle(-0.1, 0, repellingFixedPoint, 0, 1);

    expect(verdict).toMatchObject({ verdict: 'rejected', reason: 'not-attracting' });
  });

  it('rejects non-finite states, residuals, and derivatives', () => {
    const overflow = verifyCycle(1e308, 1e308, 1, 1, 4);
    expect(overflow).toMatchObject({ verdict: 'rejected', reason: 'non-finite' });

    const nanStart = verifyCycle(-0.3125, 0, Number.NaN, 0, 1);
    expect(nanStart).toMatchObject({ verdict: 'rejected', reason: 'non-finite' });

    const infiniteStart = verifyCycle(-0.3125, 0, Number.POSITIVE_INFINITY, 0, 1);
    expect(infiniteStart).toMatchObject({ verdict: 'rejected', reason: 'non-finite' });

    const nanParameter = verifyCycle(Number.NaN, 0, -0.25, 0, 1);
    expect(nanParameter).toMatchObject({ verdict: 'rejected', reason: 'non-finite' });
  });

  it('rejects degenerate proposals without closure', () => {
    expect(verifyCycle(0.5, 0.5, 0.3, 0.3, 7)).toMatchObject({
      verdict: 'rejected',
      reason: 'no-closure',
    });
    expect(verifyCycle(-0.3125, 0, -0.25, 0, 0)).toMatchObject({
      verdict: 'rejected',
      reason: 'no-closure',
    });
    expect(verifyCycle(-0.3125, 0, -0.25, 0, 2.5)).toMatchObject({
      verdict: 'rejected',
      reason: 'no-closure',
    });
    expect(verifyCycle(-0.3125, 0, -0.25, 0, -3)).toMatchObject({
      verdict: 'rejected',
      reason: 'no-closure',
    });
  });

  it('stamps every verdict with the verifier revision', () => {
    const verdicts: VerifierVerdict[] = [
      verifyCycle(-0.1205, 0.7438, -0.1205, 0.7438, 3),
      verifyCycle(0.5, 0.5, 0.3, 0.3, 7),
      verifyCycle(-0.3125, 0, -0.25 + 1e-8, 0, 2),
      verifyCycle(1e308, 1e308, 1, 1, 4),
    ];
    for (const verdict of verdicts) {
      expect(verdict.verifierRevision).toBe(VERIFIER_REVISION);
    }
  });

  it('leaves the target record untouched on non-accepted verdicts', () => {
    const sample = createOrbitSample();
    const pristine = { ...sample };

    expect(
      verifyCycleInto(0.5, 0.5, 0.3, 0.3, 7, 12, ORBIT_EVIDENCE_CODE.convergedCycle, sample),
    ).toBe(VERIFIER_VERDICT.rejectedNoClosure);
    expect(
      verifyCycleInto(
        -0.3125,
        0,
        -0.25 + 1e-8,
        0,
        2,
        12,
        ORBIT_EVIDENCE_CODE.convergedCycle,
        sample,
      ),
    ).toBe(VERIFIER_VERDICT.unresolvedDivisorAmbiguous);
    expect(sample).toEqual(pristine);

    expect(
      verifyCycleInto(-0.3125, 0, -0.25, 0, 2, 17, ORBIT_EVIDENCE_CODE.convergedCycle, sample),
    ).toBe(VERIFIER_VERDICT.accepted);
    expect(sample.status).toBe(2);
    expect(sample.period).toBe(1);
    expect(sample.iterations).toBe(17);
    expect(sample.multiplierMagnitude).toBe(0.5);
  });

  it('exposes the frozen policy values with their documented provenance', () => {
    expect(VERIFIER_THRESHOLDS.tauAccept).toBe(1e-10);
    expect(VERIFIER_THRESHOLDS.closureRelaxation).toBe(100);
    expect(VERIFIER_THRESHOLDS.tauExclude).toBe(1e-6);
    expect(VERIFIER_THRESHOLDS.attractMargin).toBe(1e-12);
    expect(TAU_CLOSURE_SCALED).toBe(1e-8);
    expect(Object.isFrozen(VERIFIER_THRESHOLDS)).toBe(true);
  });
});
