import { describe, expect, it } from 'vitest';

import fixtureData from '../../../fixtures/orbits.v1.json' with { type: 'json' };
import { classifyOrbit, type OrbitOptions, type OrbitStatus } from '../../../src/domain';

interface ExpectedFixture {
  readonly status: OrbitStatus;
  readonly escapeIteration?: number;
  readonly period?: number;
  readonly multiplier?: {
    readonly magnitude: string;
  };
}

interface OrbitFixture {
  readonly id: string;
  readonly parameter: {
    readonly re: string;
    readonly im: string;
  };
  readonly classificationBudget: OrbitOptions;
  readonly expected: ExpectedFixture;
}

interface FixtureDocument {
  readonly binary64Tolerance: {
    readonly multiplierMagnitudeAbsolute: number;
  };
  readonly fixtures: readonly OrbitFixture[];
}

const fixtureDocument = fixtureData as FixtureDocument;

describe('independent high-precision orbit fixtures', () => {
  for (const fixture of fixtureDocument.fixtures) {
    it(`matches ${fixture.id}`, () => {
      const result = classifyOrbit(
        {
          re: Number(fixture.parameter.re),
          im: Number(fixture.parameter.im),
        },
        fixture.classificationBudget,
      );

      expect(result.status).toBe(fixture.expected.status);
      if (result.status === 'escaped') {
        expect(result.escapeIteration).toBe(fixture.expected.escapeIteration);
      }
      if (result.status === 'attracting-cycle') {
        expect(result.period).toBe(fixture.expected.period);
        expect(result.multiplierMagnitude).toBeCloseTo(
          Number(fixture.expected.multiplier?.magnitude),
          7,
        );
        expect(
          Math.abs(result.multiplierMagnitude - Number(fixture.expected.multiplier?.magnitude)),
        ).toBeLessThanOrEqual(fixtureDocument.binary64Tolerance.multiplierMagnitudeAbsolute);
      }
    });
  }
});
