import { describe, expect, it } from 'vitest';

import { classifyOrbit, OrbitScratch } from '../../../src/domain';

describe('orbit classification', () => {
  it('proves escape using the escape radius', () => {
    const result = classifyOrbit({ re: 1, im: 1 });

    expect(result.status).toBe('escaped');
    expect(result.evidence).toEqual(['escape-radius']);
    if (result.status === 'escaped') {
      expect(result.escapeIteration).toBeGreaterThan(0);
      expect(result.magnitudeSquared).toBeGreaterThan(4);
    }
  });

  it('recognizes the main cardioid and period-two bulb analytically', () => {
    const fixed = classifyOrbit({ re: 0, im: 0 });
    const periodTwo = classifyOrbit({ re: -1, im: 0 });

    expect(fixed).toMatchObject({
      status: 'attracting-cycle',
      period: 1,
      evidence: ['analytic-main-cardioid'],
    });
    expect(periodTwo).toMatchObject({
      status: 'attracting-cycle',
      period: 2,
      evidence: ['analytic-period-2-bulb'],
    });
    if (fixed.status === 'attracting-cycle' && periodTwo.status === 'attracting-cycle') {
      expect(fixed.multiplierMagnitude).toBe(0);
      expect(fixed.multiplierAngle).toBe(0);
      expect(fixed.stabilityExponent).toBe(Number.POSITIVE_INFINITY);
      expect(periodTwo.multiplierMagnitude).toBe(0);
      expect(periodTwo.multiplierAngle).toBe(0);
      expect(periodTwo.stabilityExponent).toBe(Number.POSITIVE_INFINITY);
    }
  });

  it('detects an attracting period-three component numerically', () => {
    const result = classifyOrbit(
      { re: -0.1225611668766536, im: 0.7448617666197442 },
      { maxIterations: 256, maxPeriod: 8, cycleWarmup: 6 },
    );

    expect(result.status).toBe('attracting-cycle');
    if (result.status === 'attracting-cycle') {
      expect(result.period).toBe(3);
      expect(result.evidence).toEqual(['converged-cycle']);
      expect(result.multiplierMagnitude).toBeLessThan(1);
      expect(result.multiplierAngle).toBeGreaterThanOrEqual(-Math.PI);
      expect(result.multiplierAngle).toBeLessThanOrEqual(Math.PI);
      expect(result.stabilityExponent).toBeGreaterThan(0);
    }
  });

  it('detects an ordinary off-center point in the period-three component', () => {
    const result = classifyOrbit(
      { re: -0.1205, im: 0.7438 },
      { maxIterations: 512, maxPeriod: 8, cycleWarmup: 12 },
    );

    expect(result.status).toBe('attracting-cycle');
    if (result.status === 'attracting-cycle') {
      expect(result.period).toBe(3);
      expect(result.multiplierMagnitude).toBeGreaterThan(0);
      expect(result.multiplierMagnitude).toBeLessThan(1);
    }
  });

  it('reuses fixed scratch storage without leaking state between points', () => {
    const scratch = new OrbitScratch(8);
    const options = { maxIterations: 512, maxPeriod: 8, cycleWarmup: 12 };
    const periodThreePoint = { re: -0.1205, im: 0.7438 };

    const first = classifyOrbit(periodThreePoint, options, scratch);
    expect(classifyOrbit({ re: 1, im: 1 }, options, scratch).status).toBe('escaped');
    const second = classifyOrbit(periodThreePoint, options, scratch);

    expect(second).toEqual(first);
  });

  it('does not describe iteration-limited boundary points as inside', () => {
    const result = classifyOrbit({ re: 0.25, im: 0 }, { maxIterations: 48, maxPeriod: 8 });

    expect(result).toEqual({
      status: 'unresolved',
      iterations: 48,
      evidence: ['iteration-limit'],
    });
  });
});
