import { describe, expect, it } from 'vitest';

import { classifyOrbit, resolveOrbitOptions } from '../../../src/domain';

// Candidate smooth-log2: the opt-in escape smoothing form is algebraically
// equal to the default (not bit-identical), while status, period, and
// escape iteration must match exactly. Every point has |c| > 2, so it escapes.
const ESCAPING_POINTS = [
  { re: 2.5, im: 0 },
  { re: 0, im: 2.5 },
  { re: -2.1, im: 0 },
  { re: 1.5, im: 1.5 },
];

describe('algebraic escape smoothing option', () => {
  it('defaults off and resolves to the legacy form', () => {
    expect(resolveOrbitOptions({}).algebraicEscapeSmoothing).toBe(false);
    expect(resolveOrbitOptions({ algebraicEscapeSmoothing: true }).algebraicEscapeSmoothing).toBe(
      true,
    );
  });

  it('matches the default escape classification within 1e-12 relative', () => {
    for (const c of ESCAPING_POINTS) {
      const legacy = classifyOrbit(c);
      const algebraic = classifyOrbit(c, { algebraicEscapeSmoothing: true });
      expect(legacy.status).toBe('escaped');
      expect(algebraic.status).toBe(legacy.status);
      if (legacy.status !== 'escaped' || algebraic.status !== 'escaped') continue;
      expect(algebraic.escapeIteration).toBe(legacy.escapeIteration);
      expect(algebraic.magnitudeSquared).toBe(legacy.magnitudeSquared);
      const relative =
        Math.abs(algebraic.smoothIteration - legacy.smoothIteration) /
        Math.max(1, Math.abs(legacy.smoothIteration));
      expect(relative).toBeLessThanOrEqual(1e-12);
    }
  });

  it('leaves attracting classifications unchanged', () => {
    const legacy = classifyOrbit({ re: 0, im: 0 });
    const algebraic = classifyOrbit({ re: 0, im: 0 }, { algebraicEscapeSmoothing: true });
    expect(algebraic).toEqual(legacy);
  });

  it('is rejected for classifier modes other than legacy-scan', () => {
    expect(() =>
      resolveOrbitOptions({ classifierMode: 'checkpoint', algebraicEscapeSmoothing: true }),
    ).toThrow(RangeError);
  });
});
