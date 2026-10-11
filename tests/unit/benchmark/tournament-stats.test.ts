import { describe, expect, it } from 'vitest';

import {
  aggregateTiming,
  bootstrapGeomeanOfMedianCI,
  bootstrapMedianCI,
  geometricMean,
  isSlowerBeyond,
  median,
  mulberry32,
  pairedRatios,
  percentile,
  summarizeRatios,
} from '../../../tools/benchmark/judge/stats';

describe('tournament paired-ratio statistics', () => {
  it('median_oddAndEvenLengths', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it('percentile_interpolatesLinearly', () => {
    expect(percentile([0, 10], 90)).toBeCloseTo(9, 12);
    expect(percentile([1, 2, 3, 4, 5], 0)).toBe(1);
    expect(percentile([1, 2, 3, 4, 5], 100)).toBe(5);
  });

  it('geometricMean_ofReciprocalPairIsOne', () => {
    expect(geometricMean([2, 0.5])).toBeCloseTo(1, 12);
    expect(geometricMean([4, 1, 1, 1])).toBeCloseTo(Math.SQRT2, 12);
    expect(geometricMean([1, 0])).toBeNaN();
  });

  it('pairedRatios_isBaselineOverCandidate_andRejectsLengthMismatch', () => {
    expect(pairedRatios([10, 20], [5, 40])).toEqual([2, 0.5]);
    expect(() => pairedRatios([1], [1, 2])).toThrow(RangeError);
  });

  it('mulberry32_isDeterministicAndInUnitInterval', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const draws = Array.from({ length: 5 }, () => a());
    expect(draws).toEqual(Array.from({ length: 5 }, () => b()));
    expect(draws.every((value) => value >= 0 && value < 1)).toBe(true);
    expect(mulberry32(43)()).not.toBe(draws[0]);
  });

  it('bootstrapMedianCI_fixedSeedIsReproducible', () => {
    const ratios = [0.98, 1.01, 1.02, 0.99, 1.0, 1.03, 0.97, 1.01, 1.0, 0.99, 1.02];
    const first = bootstrapMedianCI(ratios);
    expect(bootstrapMedianCI(ratios)).toEqual(first);
    expect(first.lo).toBeLessThanOrEqual(median(ratios));
    expect(first.hi).toBeGreaterThanOrEqual(median(ratios));
    expect(first.lo <= 1 && 1 <= first.hi).toBe(true);
  });

  it('bootstrapMedianCI_constantSampleCollapsesToThatValue', () => {
    expect(bootstrapMedianCI([2, 2, 2, 2])).toEqual({ lo: 2, hi: 2 });
  });

  it('bootstrapMedianCI_clearSpeedupExcludesOne', () => {
    const interval = bootstrapMedianCI([1.9, 2.0, 2.1, 2.0, 1.95, 2.05, 2.0, 1.98, 2.02]);
    expect(interval.lo).toBeGreaterThan(1.5);
  });

  it('bootstrapGeomeanOfMedianCI_bracketsTheGeomeanOfMedians', () => {
    const perCase = [
      [1.9, 2.0, 2.1],
      [1.0, 1.01, 0.99],
      [0.5, 0.51, 0.49],
    ];
    const expected = geometricMean(perCase.map((ratios) => median(ratios)));
    const interval = bootstrapGeomeanOfMedianCI(perCase);
    expect(interval.lo).toBeLessThanOrEqual(expected + 1e-12);
    expect(interval.hi).toBeGreaterThanOrEqual(expected - 1e-12);
  });

  it('isSlowerBeyond_usesThreePercentOnTheCandidateTime', () => {
    expect(isSlowerBeyond(1 / 1.04, 0.03)).toBe(true);
    expect(isSlowerBeyond(1 / 1.02, 0.03)).toBe(false);
    expect(isSlowerBeyond(1.2, 0.03)).toBe(false);
  });

  it('aggregateTiming_reportsWorstCaseAndSlowerCases', () => {
    const make = (ratio: number) => summarizeRatios([ratio, ratio, ratio]);
    const aggregate = aggregateTiming([
      { caseId: 'fast', summary: make(2) },
      { caseId: 'flat', summary: make(1) },
      { caseId: 'slow', summary: make(0.9) },
    ]);
    expect(aggregate.worstCase).toEqual({ caseId: 'slow', ratio: 0.9 });
    expect(aggregate.slowerCases).toEqual(['slow']);
    expect(aggregate.confirmedSlowerCases).toEqual(['slow']);
    expect(aggregate.geomeanSpeedup).toBeCloseTo(Math.cbrt(2 * 1 * 0.9), 10);
  });
});
