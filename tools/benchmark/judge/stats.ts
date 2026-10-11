/**
 * Pure statistics for the paired timing design. No I/O, no clocks, no
 * randomness except the explicitly seeded generator.
 */

export interface Interval {
  readonly lo: number;
  readonly hi: number;
}

export const DEFAULT_BOOTSTRAP_SEED = 0x1d3a5;
export const DEFAULT_BOOTSTRAP_RESAMPLES = 2000;

/** Small fast seeded PRNG (mulberry32); deterministic across platforms. */
export const mulberry32 = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const sortedCopy = (values: readonly number[]): number[] => [...values].sort((a, b) => a - b);

/** Linear-interpolation percentile (p in [0, 100]) of unsorted values. */
export const percentile = (values: readonly number[], p: number): number => {
  if (values.length === 0) return Number.NaN;
  const sorted = sortedCopy(values);
  const position = (Math.min(100, Math.max(0, p)) / 100) * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const low = sorted[lower] ?? Number.NaN;
  const high = sorted[upper] ?? Number.NaN;
  return low + (high - low) * (position - lower);
};

export const median = (values: readonly number[]): number => percentile(values, 50);

export const mean = (values: readonly number[]): number =>
  values.length === 0 ? Number.NaN : values.reduce((sum, v) => sum + v, 0) / values.length;

/** Geometric mean of strictly positive values. */
export const geometricMean = (values: readonly number[]): number => {
  if (values.length === 0) return Number.NaN;
  let logSum = 0;
  for (const value of values) {
    if (!(value > 0)) return Number.NaN;
    logSum += Math.log(value);
  }
  return Math.exp(logSum / values.length);
};

/**
 * Paired ratios baseline/candidate per repetition (> 1 means the candidate is
 * faster). Each repetition's value is already the ratio of the two arms'
 * per-repetition means (the caller averages the ABBA pair).
 */
export const pairedRatios = (
  baselineMs: readonly number[],
  candidateMs: readonly number[],
): number[] => {
  if (baselineMs.length !== candidateMs.length) {
    throw new RangeError('paired samples must have equal length');
  }
  return baselineMs.map((base, index) => base / (candidateMs[index] ?? Number.NaN));
};

const percentileInterval = (draws: readonly number[], confidence: number): Interval => {
  const tail = ((1 - confidence) / 2) * 100;
  return { lo: percentile(draws, tail), hi: percentile(draws, 100 - tail) };
};

export interface BootstrapOptions {
  readonly seed?: number;
  readonly resamples?: number;
  readonly confidence?: number;
}

const resampleMedian = (values: readonly number[], random: () => number): number => {
  const draw: number[] = new Array<number>(values.length);
  for (let i = 0; i < values.length; i += 1) {
    draw[i] = values[Math.floor(random() * values.length)] ?? Number.NaN;
  }
  return median(draw);
};

/** Percentile bootstrap CI of the median of `values` (fixed seed by default). */
export const bootstrapMedianCI = (
  values: readonly number[],
  options: BootstrapOptions = {},
): Interval => {
  const random = mulberry32(options.seed ?? DEFAULT_BOOTSTRAP_SEED);
  const resamples = options.resamples ?? DEFAULT_BOOTSTRAP_RESAMPLES;
  const draws: number[] = [];
  for (let r = 0; r < resamples; r += 1) draws.push(resampleMedian(values, random));
  return percentileInterval(draws, options.confidence ?? 0.95);
};

/**
 * Hierarchical percentile bootstrap CI of the geometric mean (across cases) of
 * the per-case median ratios: each draw resamples repetitions within every
 * case, takes that case's median, then the geometric mean over cases.
 */
export const bootstrapGeomeanOfMedianCI = (
  perCaseRatios: readonly (readonly number[])[],
  options: BootstrapOptions = {},
): Interval => {
  const random = mulberry32(options.seed ?? DEFAULT_BOOTSTRAP_SEED);
  const resamples = options.resamples ?? DEFAULT_BOOTSTRAP_RESAMPLES;
  const draws: number[] = [];
  for (let r = 0; r < resamples; r += 1) {
    draws.push(geometricMean(perCaseRatios.map((ratios) => resampleMedian(ratios, random))));
  }
  return percentileInterval(draws, options.confidence ?? 0.95);
};

/** A candidate is "slower" in a case when baseline/candidate < 1 / (1 + threshold). */
export const isSlowerBeyond = (ratio: number, threshold: number): boolean =>
  ratio < 1 / (1 + threshold);

export interface CaseTimingSummary {
  readonly ratios: readonly number[];
  readonly medianRatio: number;
  readonly ci: Interval;
  readonly p10: number;
  readonly p90: number;
}

export const summarizeRatios = (
  ratios: readonly number[],
  options: BootstrapOptions = {},
): CaseTimingSummary => ({
  ratios,
  medianRatio: median(ratios),
  ci: bootstrapMedianCI(ratios, options),
  p10: percentile(ratios, 10),
  p90: percentile(ratios, 90),
});

export interface AggregateTiming {
  readonly geomeanSpeedup: number;
  readonly ci: Interval;
  readonly worstCase: { readonly caseId: string; readonly ratio: number } | undefined;
  readonly slowerCases: readonly string[];
  /** Cases whose whole CI lies beyond the slower-than-baseline threshold. */
  readonly confirmedSlowerCases: readonly string[];
}

export const aggregateTiming = (
  perCase: readonly { readonly caseId: string; readonly summary: CaseTimingSummary }[],
  slowerThreshold = 0.03,
  options: BootstrapOptions = {},
): AggregateTiming => {
  let worstCase: AggregateTiming['worstCase'];
  for (const entry of perCase) {
    if (worstCase === undefined || entry.summary.medianRatio < worstCase.ratio) {
      worstCase = { caseId: entry.caseId, ratio: entry.summary.medianRatio };
    }
  }
  return {
    geomeanSpeedup: geometricMean(perCase.map((entry) => entry.summary.medianRatio)),
    ci: bootstrapGeomeanOfMedianCI(
      perCase.map((entry) => entry.summary.ratios),
      options,
    ),
    worstCase,
    slowerCases: perCase
      .filter((entry) => isSlowerBeyond(entry.summary.medianRatio, slowerThreshold))
      .map((entry) => entry.caseId),
    confirmedSlowerCases: perCase
      .filter((entry) => isSlowerBeyond(entry.summary.ci.hi, slowerThreshold))
      .map((entry) => entry.caseId),
  };
};
