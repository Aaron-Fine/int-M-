/**
 * BCa (bias-corrected and accelerated) bootstrap paired intervals for the
 * release-protocol Stage A runner (performance plan §9): "95% bias-corrected
 * accelerated (BCa) bootstrap intervals on paired per-case differences
 * (log-ratios for speed ratios), computed from stored paired samples with the
 * resampling seed recorded in the manifest."
 *
 * Standard Efron BCa on a one-sample statistic over the paired quantities:
 *
 * 1. The caller supplies the paired quantities themselves — per-pair
 *    differences (ms regressions) or per-pair log-ratios (speed ratios) — so
 *    resampling the array with replacement IS resampling the pairs; the pair
 *    structure can never be lost.
 * 2. Bias correction z0 = Phi^-1(#(theta_b < theta_obs) / B) over B
 *    bootstrap resamples (Efron 1987, eq. 4.2); the proportion is clamped
 *    away from 0/1 so z0 stays finite on near-degenerate distributions.
 * 3. Acceleration a is the standard jackknife estimate (Efron 1987, eq. 4.3)
 *    — leave-one-out recomputations of the statistic.
 * 4. Adjusted percentiles alpha1/alpha2 (eq. 4.5/4.6) index the empirical
 *    bootstrap distribution (type-7 linear-interpolation quantiles).
 *
 * No dependencies beyond the Node standard library; the seeded PRNG makes
 * every interval exactly reproducible from its recorded seed. Degenerate
 * input (constant pairs) yields a degenerate interval, flagged as such.
 */

/**
 * Deterministic 32-bit PRNG (mulberry32). Returns a thunk producing uniform
 * doubles in [0, 1). Chosen because it is tiny, seedable, and has adequate
 * statistical quality for index resampling.
 */
export const mulberry32 = (seed) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Median of an array (mean of the two central order statistics when even). */
export const median = (values) => {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/** Per-pair differences candidate - baseline (ms regression quantity). */
export const pairedDifferences = (candidate, baseline) =>
  candidate.map((value, index) => value - baseline[index]);

/** Per-pair log-ratios log(candidate / baseline) (speed-ratio quantity). */
export const pairedLogRatios = (candidate, baseline) =>
  candidate.map((value, index) => Math.log(value / baseline[index]));

/**
 * Inverse standard-normal CDF (Acklam's rational approximation, relative
 * accuracy ~1.15e-9 over the open interval — far below bootstrap resolution).
 * One Halley refinement step against erf-based Phi polishes the tails.
 */
const erfcApprox = (x) => {
  // Standard 9-term erfc polynomial (t * exp form; |epsilon| < 1.2e-7), with
  // the odd-extension identity for negative arguments.
  if (x < 0) return 2 - erfcApprox(-x);
  const t = 1 / (1 + 0.5 * x);
  return (
    t *
    Math.exp(
      -x * x -
        1.26551223 +
        t *
          (1.00002368 +
            t *
              (0.37409196 +
                t *
                  (0.09678418 +
                    t *
                      (-0.18628806 +
                        t *
                          (0.27886807 +
                            t *
                              (-1.13520398 +
                                t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))),
    )
  );
};

const normalCdf = (z) =>
  z >= 0 ? 1 - 0.5 * erfcApprox(z / Math.SQRT2) : 0.5 * erfcApprox(-z / Math.SQRT2);

export const normalQuantile = (p) => {
  if (!(p > 0 && p < 1)) return Number.NaN;
  // Acklam's initial rational approximation.
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2,
    -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1,
    -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734,
    4.374664141464968, 2.938163982698783,
  ];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pLow = 0.02425;
  let x;
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    x =
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= 1 - pLow) {
    const q = p - 0.5;
    const r = q * q;
    x =
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x =
      -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  // One Halley step: x <- x - (Phi(x) - p) / phi(x), refined with the error term.
  const e = normalCdf(x) - p;
  const u = e * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2);
  return x - u / (1 + (x * u) / 2);
};

/** Type-7 (linear interpolation) empirical quantile of a sorted array. */
const sortedQuantile = (sorted, p) => {
  const n = sorted.length;
  if (n === 0) return Number.NaN;
  if (n === 1) return sorted[0];
  const position = (n - 1) * p;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  const weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
};

/**
 * Computes the BCa interval.
 *
 * @param {object} options
 * @param {readonly number[]} options.values paired quantities (differences or
 *   log-ratios); resampling these resamples the pairs.
 * @param {(values: readonly number[]) => number} [options.statistic] summary
 *   statistic (default: median).
 * @param {number} [options.resamples] bootstrap resample count (>= 10000 for
 *   release evidence).
 * @param {number} options.seed PRNG seed; recorded with the interval.
 * @param {number} [options.alpha] two-sided miscoverage (default 0.05).
 * @returns {{ estimate: number, interval: [number, number], z0: number,
 *   acceleration: number, alpha: number, resamples: number, seed: number,
 *   degenerate: boolean }}
 */
export const bcaInterval = ({
  values,
  statistic = median,
  resamples = 10000,
  seed,
  alpha = 0.05,
}) => {
  const n = values.length;
  if (!Number.isInteger(n) || n < 2) {
    throw new RangeError('BCa intervals need at least 2 paired observations');
  }
  if (!Number.isInteger(resamples) || resamples < 1) {
    throw new RangeError('resamples must be a positive integer');
  }
  if (!(alpha > 0 && alpha < 1)) {
    throw new RangeError('alpha must be in (0, 1)');
  }
  const estimate = statistic(values);
  if (!Number.isFinite(estimate)) {
    throw new RangeError('statistic must be finite on the observed pairs');
  }
  const random = mulberry32(seed);
  const bootstrap = new Float64Array(resamples);
  for (let b = 0; b < resamples; b += 1) {
    const sample = new Float64Array(n);
    for (let i = 0; i < n; i += 1) {
      sample[i] = values[Math.floor(random() * n)];
    }
    bootstrap[b] = statistic(sample);
  }
  const sorted = [...bootstrap].sort((x, y) => x - y);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  if (min === max) {
    // Constant pairs (or a statistic blind to the resampling): the interval
    // is degenerate at the observed estimate.
    return {
      estimate,
      interval: [estimate, estimate],
      z0: 0,
      acceleration: 0,
      alpha,
      resamples,
      seed,
      degenerate: true,
    };
  }
  let propLess = 0;
  for (const value of bootstrap) {
    if (value < estimate) propLess += 1;
  }
  // Clamp away from 0/1 so z0 stays finite on extremely skewed distributions
  // (the recorded convention: half a resample's worth of evidence).
  propLess = Math.min(Math.max(propLess, 0.5), resamples - 0.5) / resamples;
  const z0 = normalQuantile(propLess);
  // Jackknife acceleration.
  const jackknife = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    const reduced = [...values.slice(0, i), ...values.slice(i + 1)];
    jackknife[i] = statistic(reduced);
  }
  const jackMean = jackknife.reduce((sum, value) => sum + value, 0) / n;
  let sumSquared = 0;
  let sumCubed = 0;
  for (const value of jackknife) {
    const delta = jackMean - value;
    sumSquared += delta * delta;
    sumCubed += delta * delta * delta;
  }
  const acceleration = sumSquared === 0 ? 0 : sumCubed / (6 * Math.pow(sumSquared, 1.5));
  const zLo = normalQuantile(alpha / 2);
  const zHi = normalQuantile(1 - alpha / 2);
  const adjustedAlpha = (z) => {
    const denominator = 1 - acceleration * (z0 + z);
    const adjusted = normalCdf(z0 + (z0 + z) / denominator);
    return Math.min(Math.max(adjusted, 1e-12), 1 - 1e-12);
  };
  const lower = sortedQuantile(sorted, adjustedAlpha(zLo));
  const upper = sortedQuantile(sorted, adjustedAlpha(zHi));
  return {
    estimate,
    interval: [lower, upper],
    z0,
    acceleration,
    alpha,
    resamples,
    seed,
    degenerate: false,
  };
};
