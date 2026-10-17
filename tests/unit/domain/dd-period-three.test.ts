import { describe, expect, it } from 'vitest';

import { ddPeriodThreeCycle } from './dd-oracle';

/**
 * The dd period-3 adjudicator (ADR 0010) uses no closed form: a binary64
 * orbit seed, dd Newton on f_c^3(z) - z, dd divisor and attraction checks.
 * Expected moduli are mpmath values of the closed form at the same binary64
 * parameters (docs/superpowers/plans/2026-10-16-analytic-period-three.md).
 */
const certifiedMagnitude = (re: number, im: number): number => {
  const verdict = ddPeriodThreeCycle(re, im);
  if (verdict.status !== 'attracting-cycle') {
    throw new Error(`not certified at ${re} + ${im}i: ${verdict.status}`);
  }
  expect(verdict.cycle.primitive).toBe(3);
  return verdict.cycle.magnitude;
};

describe('ddPeriodThreeCycle', () => {
  it('certifies period 3 at the superattracting centres', () => {
    expect(certifiedMagnitude(-0.12256116687665362, 0.7448617666197442)).toBeLessThan(1e-12);
    expect(certifiedMagnitude(-1.7548776662466927, 0)).toBeLessThan(1e-12);
  });

  it('agrees with the closed-form modulus near the cusp and the rabbit boundary', () => {
    const cases: readonly (readonly [number, number, number])[] = [
      [-0.1205, 0.8268, 0.8755937247517454],
      [-1.750001, 0, 0.9859959920005762],
      [-0.04585527427169738, 0.6923152138236197, 0.9989999999999998],
      [-0.04577863707377464, 0.692264905409385, 0.9999999990000003],
      [-0.045778636997903986, 0.6922649053595819, 0.99999999999],
    ];
    for (const [re, im, magnitude] of cases) {
      expect(Math.abs(certifiedMagnitude(re, im) - magnitude)).toBeLessThan(1e-12);
    }
  });

  it('does not certify period 3 inside the period-6 satellite of the rabbit', () => {
    for (const [re, im] of [
      [-0.1155037469844854, 0.8402560718860035],
      [-0.11341865594943658, 0.860569472501573],
    ] as const) {
      const verdict = ddPeriodThreeCycle(re, im);
      expect(verdict.status === 'attracting-cycle' && verdict.cycle.primitive === 3).toBe(false);
    }
  });

  it('reports the escape of an exterior parameter', () => {
    expect(ddPeriodThreeCycle(2.5, 1)).toEqual({ status: 'escaped', escapeIteration: 1 });
  });

  it('reduces a fixed point to period 1 through the dd divisor test', () => {
    const verdict = ddPeriodThreeCycle(0, 0);
    expect(verdict.status).toBe('attracting-cycle');
    if (verdict.status === 'attracting-cycle') {
      expect(verdict.cycle.primitive).toBe(1);
    }
  });
});
