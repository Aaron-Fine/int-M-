import { describe, expect, it } from 'vitest';

import {
  colorForAttracting,
  colorForEscaped,
  colorForOrbit,
  type OrbitResult,
  type SemanticView,
} from '../../../src/domain';

const attracting: OrbitResult = {
  status: 'attracting-cycle',
  iterations: 20,
  evidence: ['converged-cycle'],
  period: 3,
  multiplierMagnitude: 0.2,
  multiplierAngle: Math.PI / 2,
  stabilityExponent: -Math.log(0.2) / 3,
};

describe('semantic coloring', () => {
  it('uses a neutral, opaque color for unresolved samples', () => {
    expect(
      colorForOrbit(
        {
          status: 'unresolved',
          iterations: 100,
          evidence: ['iteration-limit'],
        },
        'period',
      ),
    ).toEqual([96, 96, 96, 255]);
  });

  it('uses multiplier angle for hue and stability exponent for grayscale', () => {
    const multiplier = colorForOrbit(attracting, 'multiplier');
    const stability = colorForOrbit(attracting, 'stability');

    expect(multiplier[0]).not.toBe(multiplier[1]);
    expect(stability[0]).toBe(stability[1]);
    expect(stability[1]).toBe(stability[2]);
    expect(stability[3]).toBe(255);
  });

  it('keeps escaped samples visually distinct from unresolved gray', () => {
    const escaped = colorForOrbit(
      {
        status: 'escaped',
        iterations: 5,
        evidence: ['escape-radius'],
        escapeIteration: 5,
        smoothIteration: 4.5,
        magnitudeSquared: 12,
      },
      'stability',
    );

    expect(escaped).not.toEqual([96, 96, 96, 255]);
    expect(escaped[0]).toBe(escaped[1]);
    expect(escaped[1]).toBe(escaped[2]);
  });

  it('maps compact semantic-frame fields exactly like structured orbit results', () => {
    const views: readonly SemanticView[] = ['stability', 'multiplier', 'period'];
    for (const view of views) {
      expect(
        colorForAttracting(
          attracting.period,
          attracting.multiplierMagnitude,
          attracting.multiplierAngle,
          view,
        ),
      ).toEqual(colorForOrbit(attracting, view));

      const escaped: OrbitResult = {
        status: 'escaped',
        iterations: 5,
        evidence: ['escape-radius'],
        escapeIteration: 5,
        smoothIteration: 4.5,
        magnitudeSquared: 12,
      };
      expect(colorForEscaped(escaped.smoothIteration, view)).toEqual(colorForOrbit(escaped, view));
    }
  });
});
