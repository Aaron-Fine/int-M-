import { describe, expect, it } from 'vitest';

import { classifyDD } from './classify-dd.ts';

// Catalog-provenance centers (catalog/components.v1.json, independently
// validated roots of f_c^p(0) = 0).
const RABBIT_CENTER = { re: -0.1225611668766535, im: 0.7448617666197435 };
const PERIOD4_CENTER = { re: -0.1565201668337543, im: 1.0322471089228327 };
const AIRPLANE_CENTER = { re: -1.7548776662466907, im: 0 };

describe('double-double oracle', () => {
  it('classifies c = 0 as the superattracting fixed point by identity', () => {
    const result = classifyDD(0, 0);

    expect(result).toMatchObject({ status: 'attracting-cycle', period: 1 });
    if (result.status === 'attracting-cycle') {
      expect(result.multiplierMagnitude).toBe(0);
      expect(result.multiplierAngle).toBe(0);
      expect(result.kappa).toBe(Number.POSITIVE_INFINITY);
    }
  });

  it('finds primitive period 3 at the rabbit and airplane centers', () => {
    for (const center of [RABBIT_CENTER, AIRPLANE_CENTER]) {
      const result = classifyDD(center.re, center.im);
      expect(result).toMatchObject({ status: 'attracting-cycle', period: 3 });
      if (result.status === 'attracting-cycle') {
        expect(result.multiplierMagnitude).toBeLessThan(1e-12);
      }
    }
  });

  it('finds primitive period 4 at a period-4 center', () => {
    const result = classifyDD(PERIOD4_CENTER.re, PERIOD4_CENTER.im);

    expect(result).toMatchObject({ status: 'attracting-cycle', period: 4 });
    if (result.status === 'attracting-cycle') {
      expect(result.multiplierMagnitude).toBeLessThan(1e-12);
    }
  });

  it('finds period 2 with vanishing multiplier at the basilica center', () => {
    const result = classifyDD(-1, 0);

    expect(result).toMatchObject({ status: 'attracting-cycle', period: 2 });
    if (result.status === 'attracting-cycle') {
      expect(result.multiplierMagnitude).toBeLessThan(1e-12);
    }
  });

  it('detects an attracting cycle with 0 < |lambda| < 1 off-center', () => {
    const result = classifyDD(-0.1205, 0.7438);

    expect(result).toMatchObject({ status: 'attracting-cycle', period: 3 });
    if (result.status === 'attracting-cycle') {
      expect(result.multiplierMagnitude).toBeGreaterThan(0);
      expect(result.multiplierMagnitude).toBeLessThan(1);
      expect(result.kappa).toBeGreaterThan(0);
    }
  });

  it('reports escape for an exterior point', () => {
    const result = classifyDD(1, 0);

    expect(result).toEqual({ status: 'escaped', escapeIteration: 3 });
  });

  it('stays unresolved on the repelling fixed-point orbit of c = -2', () => {
    // The orbit lands exactly on z = 2 with |lambda| = 4; the attraction test
    // must refuse it rather than emit a false cycle.
    const result = classifyDD(-2, 0);

    expect(result).toEqual({ status: 'unresolved' });
  });

  it('stays unresolved at the parabolic cusp c = 0.25', () => {
    const result = classifyDD(0.25, 0);

    expect(result).toEqual({ status: 'unresolved' });
  });
});
