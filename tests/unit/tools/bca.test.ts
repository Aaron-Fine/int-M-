import { describe, expect, it } from 'vitest';

import {
  bcaInterval,
  mulberry32,
  normalQuantile,
  pairedDifferences,
  pairedLogRatios,
} from '../../../tools/benchmark/bca';

/** Seeded standard-normal sample (Box-Muller over mulberry32). */
const normalSample = (seed: number, n: number): number[] => {
  const random = mulberry32(seed);
  const sample: number[] = [];
  while (sample.length < n) {
    const u1 = random();
    const u2 = random();
    if (u1 <= Number.EPSILON) continue;
    const r = Math.sqrt(-2 * Math.log(u1));
    sample.push(r * Math.cos(2 * Math.PI * u2));
    if (sample.length < n) sample.push(r * Math.sin(2 * Math.PI * u2));
  }
  return sample;
};

const mean = (values: readonly number[]): number =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

describe('normalQuantile accuracy', () => {
  it('matches known normal quantiles to ~1e-7', () => {
    expect(normalQuantile(0.975)).toBeCloseTo(1.9599639845400545, 6);
    expect(normalQuantile(0.025)).toBeCloseTo(-1.9599639845400545, 6);
    expect(normalQuantile(0.5)).toBeCloseTo(0, 7);
    expect(normalQuantile(0.8413447460685429)).toBeCloseTo(1, 6);
  });
});

describe('bcaInterval degenerate and structural sanity', () => {
  it('constant data yields a degenerate interval at the constant', () => {
    const result = bcaInterval({ values: [5, 5, 5, 5, 5], seed: 20260902 });
    expect(result.degenerate).toBe(true);
    expect(result.interval).toEqual([5, 5]);
    expect(result.estimate).toBe(5);
  });

  it('paired equal ratios yield a degenerate log-ratio interval at log(1/2)', () => {
    const baseline = [10, 20, 30, 40, 50, 60];
    const candidate = baseline.map((value) => value / 2);
    const logRatios = pairedLogRatios(candidate, baseline);
    const result = bcaInterval({ values: logRatios, seed: 7 });
    expect(result.degenerate).toBe(true);
    expect(result.interval[0]).toBeCloseTo(-Math.LN2, 12);
  });

  it('preserves the pair structure exactly under a monotone shift (odd pair count)', () => {
    const random = mulberry32(1234);
    const differences = Array.from({ length: 21 }, () => random() * 10 - 5);
    const shifted = differences.map((value) => value + 1000);
    const base = bcaInterval({ values: differences, seed: 99, resamples: 2000 });
    const moved = bcaInterval({ values: shifted, seed: 99, resamples: 2000 });
    // The statistic (median), z0, and acceleration are shift-invariant, so the
    // interval must shift by exactly the constant.
    expect(moved.estimate).toBeCloseTo(base.estimate + 1000, 9);
    expect(moved.interval[0]).toBeCloseTo(base.interval[0] + 1000, 9);
    expect(moved.interval[1]).toBeCloseTo(base.interval[1] + 1000, 9);
    expect(moved.z0).toBeCloseTo(base.z0, 12);
    expect(moved.acceleration).toBeCloseTo(base.acceleration, 12);
  });

  it('orders its endpoints and brackets the estimate on a skewed sample', () => {
    // Skewed sample: exponential-ish pairs.
    const random = mulberry32(555);
    const values = Array.from({ length: 24 }, () => -Math.log(random()) * 3);
    const result = bcaInterval({ values, seed: 42 });
    expect(result.degenerate).toBe(false);
    expect(result.interval[0]).toBeLessThanOrEqual(result.estimate);
    expect(result.estimate).toBeLessThanOrEqual(result.interval[1]);
    expect(result.interval[0]).toBeLessThan(result.interval[1]);
  });

  it('is deterministic given the seed and varies with it', () => {
    const random = mulberry32(2024);
    const values = Array.from({ length: 30 }, () => random() * 100);
    const a = bcaInterval({ values, seed: 1, resamples: 3000 });
    const b = bcaInterval({ values, seed: 1, resamples: 3000 });
    expect(a).toEqual(b);
    const c = bcaInterval({ values, seed: 2, resamples: 3000 });
    expect(a.interval).not.toEqual(c.interval);
  });

  it('validates its inputs', () => {
    expect(() => bcaInterval({ values: [1], seed: 1 })).toThrow(RangeError);
    expect(() => bcaInterval({ values: [1, 2], seed: 1, resamples: 0 })).toThrow(RangeError);
    expect(() => bcaInterval({ values: [1, 2], seed: 1, alpha: 1.5 })).toThrow(RangeError);
  });
});

describe('bcaInterval against known theory', () => {
  it('reproduces the normal-theory interval for a large normal sample (mean statistic)', () => {
    const n = 100;
    const sample = normalSample(20260902, n);
    const result = bcaInterval({
      values: sample,
      statistic: mean,
      seed: 314159,
      resamples: 10000,
    });
    // Classic t-interval at 95% (t_{0.975, 99} = 1.9842).
    const sampleMean = mean(sample);
    const variance = sample.reduce((sum, value) => sum + (value - sampleMean) ** 2, 0) / (n - 1);
    const halfWidth = 1.9842 * Math.sqrt(variance / n);
    expect(result.estimate).toBeCloseTo(sampleMean, 12);
    // BCa on near-normal data must land close to the t-interval.
    expect(Math.abs(result.interval[0] - (sampleMean - halfWidth))).toBeLessThan(0.2 * halfWidth);
    expect(Math.abs(result.interval[1] - (sampleMean + halfWidth))).toBeLessThan(0.2 * halfWidth);
    // And its width must be close to the t width (no collapse, no blow-up).
    const bcaWidth = result.interval[1] - result.interval[0];
    expect(bcaWidth).toBeGreaterThan(0.8 * 2 * halfWidth);
    expect(bcaWidth).toBeLessThan(1.2 * 2 * halfWidth);
  });

  it('bias-corrects a strongly skewed statistic away from the raw percentile interval', () => {
    // For a skewed sample the BCa correction shifts the interval relative to
    // the plain percentile interval; assert both that the correction fired
    // (z0 != 0) and that the interval stays sane.
    const random = mulberry32(2026);
    const values = Array.from({ length: 22 }, () => 1 + random() ** 4 * 50);
    const result = bcaInterval({ values, seed: 20260902, resamples: 10000 });
    expect(result.degenerate).toBe(false);
    expect(result.z0).not.toBe(0);
    expect(Number.isFinite(result.acceleration)).toBe(true);
    expect(result.interval[0]).toBeGreaterThan(0);
    expect(result.interval[1]).toBeLessThanOrEqual(Math.max(...values));
  });

  it('covers the true median at roughly the nominal rate across many draws', () => {
    // Monte-Carlo coverage check of the median with 300 seeded experiments;
    // tolerance is wide (bootstrap CIs of medians wobble) but a broken
    // implementation (e.g. uncorrected percentile or inverted interval)
    // misses it badly.
    let covered = 0;
    const experiments = 300;
    for (let experiment = 0; experiment < experiments; experiment += 1) {
      const sample = normalSample(1000 + experiment, 21).map((value) => value + 3);
      const result = bcaInterval({ values: sample, seed: experiment + 1, resamples: 1200 });
      if (result.interval[0] <= 3 && 3 <= result.interval[1]) covered += 1;
    }
    const rate = covered / experiments;
    expect(rate).toBeGreaterThan(0.85);
    expect(rate).toBeLessThan(0.99);
  });
});

describe('paired helpers', () => {
  it('pairedDifferences subtracts elementwise (candidate - baseline)', () => {
    expect(pairedDifferences([3, 5, 8], [1, 2, 3])).toEqual([2, 3, 5]);
  });

  it('pairedLogRatios computes log(candidate/baseline) elementwise', () => {
    const ratios = pairedLogRatios([2, 8], [1, 2]);
    expect(ratios[0]).toBeCloseTo(Math.LN2, 12);
    expect(ratios[1]).toBeCloseTo(Math.log(4), 12);
  });
});
