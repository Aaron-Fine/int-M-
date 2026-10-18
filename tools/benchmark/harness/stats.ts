/** Derived statistics for evidence summaries (plan §9). Pure functions. */
import { bcaInterval } from '../bca.ts';

export const RESAMPLES = 10_000;

const sorted = (values: readonly number[]): number[] => [...values].sort((a, b) => a - b);

export const median = (values: readonly number[]): number | undefined => {
  if (values.length === 0) return undefined;
  const s = sorted(values);
  const middle = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[middle] : ((s[middle - 1] ?? 0) + (s[middle] ?? 0)) / 2;
};

export const mad = (values: readonly number[]): number | undefined => {
  const center = median(values);
  return center === undefined ? undefined : median(values.map((value) => Math.abs(value - center)));
};

/** Nearest-rank p95, only with at least 40 observations. */
export const p95 = (values: readonly number[]): number | undefined =>
  values.length < 40 ? undefined : sorted(values)[Math.ceil(0.95 * values.length) - 1];

const pairs = (baseline: readonly number[], candidate: readonly number[]): [number, number][] =>
  baseline.flatMap((b, index) => {
    const c = candidate[index];
    return c === undefined || !(b > 0) || !(c > 0) ? [] : [[b, c] as [number, number]];
  });

export const pairedRatio = (
  baseline: readonly number[],
  candidate: readonly number[],
  seed: number,
): { pairs: number; ratio: number; interval: readonly [number, number] } | undefined => {
  const matched = pairs(baseline, candidate);
  if (matched.length < 2) return undefined;
  const result = bcaInterval({
    values: matched.map(([b, c]) => Math.log(b / c)),
    resamples: RESAMPLES,
    seed,
  });
  return {
    pairs: matched.length,
    ratio: Math.exp(result.estimate),
    interval: [Math.exp(result.interval[0]), Math.exp(result.interval[1])],
  };
};

/** Plan §9 cap: paired median difference > max(5%, 20 ms) and interval excluding zero. */
export const regression = (
  baseline: readonly number[],
  candidate: readonly number[],
  seed: number,
): { deltaMs: number; interval: readonly [number, number]; flagged: boolean } | undefined => {
  const matched = pairs(baseline, candidate);
  if (matched.length < 2) return undefined;
  const result = bcaInterval({
    values: matched.map(([b, c]) => c - b),
    resamples: RESAMPLES,
    seed,
  });
  const baselineMedian = median(matched.map(([b]) => b)) ?? 0;
  return {
    deltaMs: result.estimate,
    interval: result.interval,
    flagged: result.estimate > Math.max(0.05 * baselineMedian, 20) && result.interval[0] > 0,
  };
};
