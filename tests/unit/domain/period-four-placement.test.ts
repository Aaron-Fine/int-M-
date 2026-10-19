import { describe, expect, it } from 'vitest';

import { classifyOrbit, inPeriodFourGate } from '../../../src/domain';

/**
 * Where the period-4 cubic solve runs (ADR 0013): once per pixel, at the
 * first scanning iteration max(cycleWarmup, 2), before that iteration's
 * scan, exactly where the period-3 closed form runs. Pixels that escape
 * earlier never reach it.
 */
const CENTRE = { re: -1.310702641336833, im: 0 };
const ANALYTIC = {
  status: 'attracting-cycle',
  period: 4,
  iterations: 0,
  evidence: ['analytic-period-4-component'],
  evidenceSource: 'analytic',
};

describe('placement of the period-4 cubic solve', () => {
  it('runs at the first scanning iteration', () => {
    // scanStart = max(0, 2) = 2.
    expect(classifyOrbit(CENTRE, { maxIterations: 2, maxPeriod: 4, cycleWarmup: 0 })).toMatchObject(
      ANALYTIC,
    );
    // scanStart = 40, reached exactly at the end of the budget.
    expect(
      classifyOrbit(CENTRE, { maxIterations: 40, maxPeriod: 4, cycleWarmup: 40 }),
    ).toMatchObject(ANALYTIC);
  });

  it('does not run when the budget ends before the first scanning iteration', () => {
    expect(classifyOrbit(CENTRE, { maxIterations: 30, maxPeriod: 4, cycleWarmup: 40 })).toEqual({
      status: 'unresolved',
      iterations: 30,
      evidence: ['iteration-limit'],
    });
  });

  it('a gate pixel that escapes keeps its escape record', () => {
    for (const [c, escapeIteration] of [
      [{ re: 0.235528, im: 0.570191 }, 18],
      [{ re: -0.152875, im: 1.02712 }, 21],
      [{ re: -1.37015, im: 0.0605981 }, 19],
      // Escapes at iteration 24 itself. An escaping c is exterior and the
      // solve would refuse it anyway, so this pins the escape record, not the
      // order of the two tests.
      [{ re: 0.239189, im: 0.567903 }, 24],
    ] as const) {
      expect(inPeriodFourGate(c.re, c.im)).toBe(true);
      expect(classifyOrbit(c)).toMatchObject({
        status: 'escaped',
        escapeIteration,
        evidence: ['escape-radius'],
      });
    }
  });
});
