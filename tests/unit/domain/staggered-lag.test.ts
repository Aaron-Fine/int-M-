import { describe, expect, it } from 'vitest';

import { classifyOrbit } from '../../../src/domain';
import { STAGGERED_CANDIDATE_BUDGET } from '../../../src/domain/staggered-lag';
import type { Complex, OrbitOptions, OrbitResult } from '../../../src/domain';

/**
 * Staggered harmonic lag schedule (classifierMode 'staggered-lag') against the
 * legacy lag scan. The judge's semantic-revision contract for this candidate:
 * status and period identical on every pixel, escapes bit-identical, and no
 * unresolved pixel converted.
 */

const BASE: Pick<OrbitOptions, 'maxIterations' | 'maxPeriod'> = {
  maxIterations: 512,
  maxPeriod: 32,
};

const classify = (c: Complex, classifierMode: 'legacy-scan' | 'staggered-lag'): OrbitResult =>
  classifyOrbit(c, { ...BASE, classifierMode });

const RABBIT: Complex = { re: -0.1225611668766535, im: 0.7448617666197435 };
const MAIN_CARDIOID_INTERIOR: Complex = { re: 0.1, im: 0.05 };
const ESCAPE: Complex = { re: 1, im: 1 };

describe('staggered-lag classifier mode', () => {
  it('keeps the frozen budget value', () => {
    expect(STAGGERED_CANDIDATE_BUDGET).toBe(64);
  });

  it('matches the legacy status and period on named pixels', () => {
    for (const c of [RABBIT, MAIN_CARDIOID_INTERIOR, ESCAPE]) {
      const legacy = classify(c, 'legacy-scan');
      const staggered = classify(c, 'staggered-lag');
      expect(staggered.status).toBe(legacy.status);
      if (legacy.status === 'attracting-cycle') {
        expect(staggered.status === 'attracting-cycle' && staggered.period).toBe(legacy.period);
      }
    }
  });

  it('classifies the rabbit as a period-3 attractor and the far point as an escape', () => {
    const rabbit = classify(RABBIT, 'staggered-lag');
    expect(rabbit.status).toBe('attracting-cycle');
    if (rabbit.status === 'attracting-cycle') expect(rabbit.period).toBe(3);

    const escaped = classify(ESCAPE, 'staggered-lag');
    expect(escaped.status).toBe('escaped');
    expect(escaped).toEqual(classify(ESCAPE, 'legacy-scan'));
  });

  it('agrees with the legacy scan on a grid over the rabbit neighborhood', () => {
    const size = 20;
    const spanY = 0.3;
    const spanX = spanY;
    let mismatches = 0;
    let attracting = 0;
    let escaped = 0;
    let unresolved = 0;
    for (let row = 0; row < size; row += 1) {
      for (let column = 0; column < size; column += 1) {
        const c: Complex = {
          re: RABBIT.re - spanX / 2 + (column + 0.5) * (spanX / size),
          im: RABBIT.im - spanY / 2 + (row + 0.5) * (spanY / size),
        };
        const legacy = classify(c, 'legacy-scan');
        const staggered = classify(c, 'staggered-lag');
        if (legacy.status === 'escaped') {
          escaped += 1;
          expect(staggered).toEqual(legacy);
          continue;
        }
        if (legacy.status === 'attracting-cycle') {
          attracting += 1;
          if (staggered.status !== 'attracting-cycle' || staggered.period !== legacy.period) {
            mismatches += 1;
          }
        } else {
          unresolved += 1;
          // An unresolved baseline pixel must not be converted: no certificates here.
          expect(staggered.status).toBe('unresolved');
        }
      }
    }
    expect(mismatches).toBe(0);
    expect(attracting + escaped + unresolved).toBe(size * size);
    expect(attracting).toBeGreaterThan(0);
    expect(escaped).toBeGreaterThan(0);
  });
});
