import { describe, expect, it } from 'vitest';

import { classifyOrbit, inPeriodThreeGate } from '../../../src/domain';

/**
 * Where the period-3 closed form runs (ADR 0010): once per pixel, at the
 * first scanning iteration max(cycleWarmup, 2), before that iteration's
 * scan. Pixels that escape earlier never reach it.
 */
const RABBIT = { re: -0.12256116687665362, im: 0.7448617666197442 };
const ANALYTIC = {
  status: 'attracting-cycle',
  period: 3,
  iterations: 0,
  evidence: ['analytic-period-3-component'],
  evidenceSource: 'analytic',
};

describe('placement of the period-3 closed form', () => {
  it('runs at the first scanning iteration', () => {
    // scanStart = max(0, 2) = 2.
    expect(classifyOrbit(RABBIT, { maxIterations: 2, maxPeriod: 3, cycleWarmup: 0 })).toMatchObject(
      ANALYTIC,
    );
    // scanStart = 40, reached exactly at the end of the budget.
    expect(
      classifyOrbit(RABBIT, { maxIterations: 40, maxPeriod: 3, cycleWarmup: 40 }),
    ).toMatchObject(ANALYTIC);
  });

  it('does not run when the budget ends before the first scanning iteration', () => {
    expect(classifyOrbit(RABBIT, { maxIterations: 30, maxPeriod: 3, cycleWarmup: 40 })).toEqual({
      status: 'unresolved',
      iterations: 30,
      evidence: ['iteration-limit'],
    });
  });

  it('never answers for a pixel inside the gate that escapes first', () => {
    for (const [c, escapeIteration] of [
      [{ re: -0.03, im: 0.84 }, 13],
      // Escapes at iteration 24 itself: the escape test comes first.
      [{ re: -0.2, im: 0.66 }, 24],
      [{ re: -1.768, im: 0.012 }, 21],
    ] as const) {
      expect(inPeriodThreeGate(c.re, c.im)).toBe(true);
      expect(classifyOrbit(c)).toMatchObject({
        status: 'escaped',
        escapeIteration,
        evidence: ['escape-radius'],
      });
    }
  });
});
