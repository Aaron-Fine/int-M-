import { describe, expect, it } from 'vitest';

import { ddPeriodFourCycle, ddPeriodThreeCycle } from './dd-oracle';

/**
 * The dd period-4 adjudicator (ADR 0013) uses no cubic: a binary64 orbit
 * seed, dd Newton on f_c^4(z) - z, dd divisor and attraction checks.
 * Expected moduli are mpmath values of the smallest root of the exact cubic
 * at the same binary64 parameters
 * (docs/superpowers/plans/2026-10-17-analytic-period-four.md).
 */
const certifiedMagnitude = (re: number, im: number): number => {
  const verdict = ddPeriodFourCycle(re, im);
  if (verdict.status !== 'attracting-cycle') {
    throw new Error(`not certified at ${re} + ${im}i: ${verdict.status}`);
  }
  expect(verdict.cycle.primitive).toBe(4);
  return verdict.cycle.magnitude;
};

describe('ddPeriodFourCycle', () => {
  it('certifies period 4 at the superattracting centres', () => {
    expect(certifiedMagnitude(-1.310702641336833, 0)).toBeLessThan(1e-12);
    expect(certifiedMagnitude(0.2822713907669139, 0.5300606175785253)).toBeLessThan(1e-12);
    expect(certifiedMagnitude(-0.15652016683375505, -1.0322471089228318)).toBeLessThan(1e-12);
  });

  it('agrees with the cubic near the satellite root, the cusp and a component boundary', () => {
    const cases: readonly (readonly [number, number, number])[] = [
      [-1.250000001, 0, 0.9999999839999987],
      [-1.2500001, 0, 0.9999983999999223],
      [-1.9405507890761495, 0, 0.9993690302622427],
      [0.2893305340939819, 0.48782915322182385, 0.9999999989999996],
      [-0.158902249, -1.034028, 0.5583390902919884],
    ];
    for (const [re, im, magnitude] of cases) {
      expect(Math.abs(certifiedMagnitude(re, im) - magnitude)).toBeLessThan(1e-12);
    }
  });

  it('does not certify period 4 inside period-8 satellites', () => {
    for (const [re, im] of [
      [-1.369, 0],
      [0.32484, 0.56386],
    ] as const) {
      const verdict = ddPeriodFourCycle(re, im);
      expect(verdict.status === 'attracting-cycle' && verdict.cycle.primitive === 4).toBe(false);
    }
  });

  it('reports the escape of an exterior parameter', () => {
    expect(ddPeriodFourCycle(2.5, 1)).toEqual({ status: 'escaped', escapeIteration: 1 });
  });

  it('reduces a fixed point and a 2-cycle through the dd divisor test', () => {
    for (const [re, primitive] of [
      [0, 1],
      [-1, 2],
    ] as const) {
      const verdict = ddPeriodFourCycle(re, 0);
      expect(verdict.status).toBe('attracting-cycle');
      if (verdict.status === 'attracting-cycle') {
        expect(verdict.cycle.primitive).toBe(primitive);
      }
    }
  });

  it('leaves the period-3 adjudicator unchanged', () => {
    const verdict = ddPeriodThreeCycle(-0.1205, 0.8268);
    expect(verdict.status === 'attracting-cycle' && verdict.cycle.primitive).toBe(3);
  });
});
