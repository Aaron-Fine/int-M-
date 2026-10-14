import { describe, expect, it } from 'vitest';

import { createOrbitSample, ORBIT_EVIDENCE_CODE } from '../../../src/domain';
import { verifyCycleInto } from '../../../src/domain/verifier';
import { referenceVerifyCycleInto } from './verifier-reference';

/**
 * The production verifier reads each proper divisor's residual and
 * derivative off its forward walk over the full period; the frozen reference
 * re-walks every divisor from the cycle start. The two must agree on the
 * verdict code and, on acceptance, on every output bit.
 */
describe('verifier divisor reduction from the walk prefix', () => {
  it('matches the separate-walk reference on orbit states near and off cycles', () => {
    const production = createOrbitSample();
    const reference = createOrbitSample();
    const perturbations = [0, 1e-12, 1e-9, 4e-9, 3e-8, 1e-7, 6e-7, 2e-6, 1e-4];
    const verdicts = new Map<number, number>();
    let compared = 0;
    let reduced = 0;
    // Deterministic grid over the parameter plane plus the hard corpus centers.
    const points: { re: number; im: number }[] = [];
    for (let re = -2; re <= 0.5; re += 0.0625) {
      for (let im = 0; im <= 1.25; im += 0.0625) {
        points.push({ re: re + 0.003 * im, im: im + 0.0017 });
      }
    }
    points.push(
      { re: -0.1225611668766535, im: 0.7448617666197435 },
      { re: -1.75, im: 0 },
      { re: -1.7548776662466927, im: 0 },
      { re: -1.3107026413368328, im: 0 },
      { re: -0.1205, im: 0.8268 },
      { re: -1.401155189092, im: 0 },
      { re: -1.25, im: 0 },
      { re: -1, im: 0 },
      { re: 0.25, im: 0 },
    );
    for (const c of points) {
      let zRe = 0;
      let zIm = 0;
      let escaped = false;
      for (let iteration = 0; iteration < 600; iteration += 1) {
        const nextRe = zRe * zRe - zIm * zIm + c.re;
        zIm = 2 * zRe * zIm + c.im;
        zRe = nextRe;
        if (zRe * zRe + zIm * zIm > 4) {
          escaped = true;
          break;
        }
      }
      if (escaped) continue;
      for (const delta of perturbations) {
        const startRe = zRe + delta;
        const startIm = zIm - 0.5 * delta;
        for (let period = 1; period <= 48; period += 1) {
          production.status = 0;
          reference.status = 0;
          const code = verifyCycleInto(
            c.re,
            c.im,
            startRe,
            startIm,
            period,
            7,
            ORBIT_EVIDENCE_CODE.convergedCycle,
            production,
          );
          const expected = referenceVerifyCycleInto(
            c.re,
            c.im,
            startRe,
            startIm,
            period,
            7,
            ORBIT_EVIDENCE_CODE.convergedCycle,
            reference,
          );
          expect(code).toBe(expected);
          verdicts.set(code, (verdicts.get(code) ?? 0) + 1);
          compared += 1;
          if (code === 5) {
            expect(production.period).toBe(reference.period);
            if (production.period < period) reduced += 1;
            expect(Object.is(production.multiplierRe, reference.multiplierRe)).toBe(true);
            expect(Object.is(production.multiplierIm, reference.multiplierIm)).toBe(true);
            expect(production.multiplierMagnitude).toBe(reference.multiplierMagnitude);
            expect(production.multiplierAngle).toBe(reference.multiplierAngle);
          }
        }
      }
    }
    // The sample must exercise acceptance with reduction, divisor ambiguity,
    // closure ambiguity, and plain rejection.
    expect(compared).toBeGreaterThan(10_000);
    expect(reduced).toBeGreaterThan(0);
    for (const code of [1, 3, 4, 5]) {
      expect(verdicts.get(code) ?? 0).toBeGreaterThan(0);
    }
  });
});
