import { describe, expect, it } from 'vitest';
import {
  mad,
  median,
  p95,
  pairedRatio,
  regression,
} from '../../../tools/benchmark/harness/stats.ts';

describe('harness stats', () => {
  it('median and MAD of odd and even samples', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeUndefined();
    expect(mad([1, 2, 3, 4, 100])).toBe(1);
  });

  it('p95 needs at least 40 observations and uses the nearest rank', () => {
    expect(p95(Array.from({ length: 39 }, (_, i) => i))).toBeUndefined();
    expect(p95(Array.from({ length: 40 }, (_, i) => i + 1))).toBe(38);
  });

  it('paired ratio above 1 when the candidate is faster', () => {
    const baseline = Array.from({ length: 21 }, (_, i) => 200 + i);
    const candidate = baseline.map((value) => value / 2);
    const result = pairedRatio(baseline, candidate, 7);
    expect(result?.pairs).toBe(21);
    expect(result?.ratio).toBeCloseTo(2, 10);
  });

  it('regression flag needs max(5%, 20 ms) and an interval excluding zero', () => {
    const baseline = Array.from({ length: 21 }, (_, i) => 1000 + (i % 3));
    expect(
      regression(
        baseline,
        baseline.map((v) => v + 30),
        7,
      )?.flagged,
    ).toBe(false);
    expect(
      regression(
        baseline,
        baseline.map((v) => v + 60),
        7,
      )?.flagged,
    ).toBe(true);
    expect(regression([1], [2], 7)).toBeUndefined();
  });
});
