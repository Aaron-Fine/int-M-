import { describe, expect, it } from 'vitest';

import {
  compareFloat,
  directionDeviation,
  validateTolerance,
} from '../../../tools/benchmark/judge/tolerance';

describe('tournament tolerance policy', () => {
  it('compareFloat_identicalAndNanAreIdentical_signedZeroIsNot', () => {
    expect(compareFloat(1.5, 1.5, undefined).verdict).toBe('identical');
    expect(compareFloat(Number.NaN, Number.NaN, undefined).verdict).toBe('identical');
    expect(compareFloat(0, -0, undefined).verdict).toBe('violation');
  });

  it('compareFloat_noToleranceMeansAnyDifferenceIsAViolation', () => {
    expect(compareFloat(1, 1 + Number.EPSILON, undefined).verdict).toBe('violation');
  });

  it('compareFloat_relativeToleranceScalesWithBaseline', () => {
    const tolerance = { relative: 1e-12 };
    expect(compareFloat(1000, 1000 * (1 + 5e-13), tolerance).verdict).toBe('within-tolerance');
    expect(compareFloat(1000, 1000 * (1 + 5e-12), tolerance).verdict).toBe('violation');
  });

  it('compareFloat_absoluteToleranceAndMaxDeviationReporting', () => {
    const result = compareFloat(0.5, 0.5 + 2e-8, { absolute: 3e-8 });
    expect(result.verdict).toBe('within-tolerance');
    expect(result.absolute).toBeCloseTo(2e-8, 15);
    expect(compareFloat(0.5, 0.5 + 4e-8, { absolute: 3e-8 }).verdict).toBe('violation');
  });

  it('compareFloat_nonFiniteCandidateIsAlwaysAViolation', () => {
    expect(compareFloat(1, Number.POSITIVE_INFINITY, { absolute: 1e300 }).verdict).toBe(
      'violation',
    );
    expect(compareFloat(1, Number.NaN, { absolute: 1 }).verdict).toBe('violation');
  });

  it('directionDeviation_isWrapSafeAtPlusMinusPi', () => {
    expect(directionDeviation(Math.PI, -Math.PI)).toBeLessThan(1e-15);
    expect(directionDeviation(0, 1e-8)).toBeCloseTo(1e-8, 15);
  });

  it('validateTolerance_acceptsDeclaredExamplesAndRejectsAboveCeilings', () => {
    expect(
      validateTolerance('bit-identical', {
        smoothIteration: { relative: 1e-12 },
        multiplierDirection: { absolute: 3e-8 },
      }),
    ).toEqual([]);
    expect(
      validateTolerance('bit-identical', { smoothIteration: { relative: 1e-3 } }),
    ).toHaveLength(1);
    expect(
      validateTolerance('bit-identical', { multiplierMagnitude: { absolute: -1 } }),
    ).toHaveLength(1);
    expect(validateTolerance('bit-identical', { rgbaMaxChannelDelta: 9 })).toHaveLength(1);
  });

  it('validateTolerance_forbidsEscapeTolerancesUnderSemanticRevision', () => {
    expect(
      validateTolerance('semantic-revision', { smoothIteration: { relative: 1e-12 } }),
    ).toHaveLength(1);
    expect(
      validateTolerance('semantic-revision', { multiplierMagnitude: { absolute: 1e-6 } }),
    ).toEqual([]);
  });
});
