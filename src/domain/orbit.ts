import { complexSqrt } from './complex';
import type { AttractingCycleOrbitResult, Complex, OrbitOptions, OrbitResult } from './types';

export const DEFAULT_ORBIT_OPTIONS: OrbitOptions = Object.freeze({
  maxIterations: 512,
  maxPeriod: 32,
  cycleTolerance: 1e-10,
  cycleWarmup: 24,
});

/**
 * Reusable storage for the orbit hot path. One instance may be reused
 * sequentially across pixels; classifyOrbit never relies on previous contents.
 */
export class OrbitScratch {
  public historyRe: Float64Array;
  public historyIm: Float64Array;

  public constructor(maxPeriod: number = DEFAULT_ORBIT_OPTIONS.maxPeriod) {
    const capacity = Math.max(2, Math.ceil(maxPeriod) + 1);
    this.historyRe = new Float64Array(capacity);
    this.historyIm = new Float64Array(capacity);
  }

  public ensureCapacity(maxPeriod: number): void {
    const required = maxPeriod + 1;
    if (this.historyRe.length >= required) {
      return;
    }
    this.historyRe = new Float64Array(required);
    this.historyIm = new Float64Array(required);
  }
}

const stabilityExponent = (multiplierMagnitude: number, period: number): number =>
  multiplierMagnitude === 0 ? Number.POSITIVE_INFINITY : -Math.log(multiplierMagnitude) / period;

const cycleResult = (
  period: number,
  multiplier: Complex,
  iterations: number,
  evidence: AttractingCycleOrbitResult['evidence'],
): AttractingCycleOrbitResult => {
  const multiplierMagnitude = Math.hypot(multiplier.re, multiplier.im);
  return {
    status: 'attracting-cycle',
    iterations,
    evidence,
    period,
    multiplierMagnitude,
    multiplierAngle: multiplierMagnitude === 0 ? 0 : Math.atan2(multiplier.im, multiplier.re),
    stabilityExponent: stabilityExponent(multiplierMagnitude, period),
  };
};

const analyticInterior = (c: Complex): AttractingCycleOrbitResult | undefined => {
  const x = c.re;
  const ySquared = c.im * c.im;
  const cardioidX = x - 0.25;
  const q = cardioidX * cardioidX + ySquared;

  if (q * (q + cardioidX) < 0.25 * ySquared) {
    const discriminantRoot = complexSqrt({ re: 1 - 4 * x, im: -4 * c.im });
    const multiplier = {
      re: 1 - discriminantRoot.re,
      im: -discriminantRoot.im,
    };
    return cycleResult(1, multiplier, 0, ['analytic-main-cardioid']);
  }

  const bulbX = x + 1;
  if (bulbX * bulbX + ySquared < 1 / 16) {
    return cycleResult(2, { re: 4 * bulbX, im: 4 * c.im }, 0, ['analytic-period-2-bulb']);
  }

  return undefined;
};

const cycleMultiplier = (
  cycleStartRe: number,
  cycleStartIm: number,
  c: Complex,
  period: number,
  closureToleranceSquared: number,
): {
  readonly re: number;
  readonly im: number;
  readonly magnitude: number;
  readonly closes: boolean;
} => {
  let zRe = cycleStartRe;
  let zIm = cycleStartIm;
  let derivativeRe = 1;
  let derivativeIm = 0;

  for (let index = 0; index < period; index += 1) {
    const nextDerivativeRe = derivativeRe * (2 * zRe) - derivativeIm * (2 * zIm);
    derivativeIm = derivativeRe * (2 * zIm) + derivativeIm * (2 * zRe);
    derivativeRe = nextDerivativeRe;

    const nextRe = zRe * zRe - zIm * zIm + c.re;
    zIm = 2 * zRe * zIm + c.im;
    zRe = nextRe;
  }

  const closureRe = zRe - cycleStartRe;
  const closureIm = zIm - cycleStartIm;
  return {
    re: derivativeRe,
    im: derivativeIm,
    magnitude: Math.hypot(derivativeRe, derivativeIm),
    closes: closureRe * closureRe + closureIm * closureIm <= closureToleranceSquared,
  };
};

const resolveOrbitOptions = (options: Partial<OrbitOptions> = {}): OrbitOptions => {
  const resolved: OrbitOptions = { ...DEFAULT_ORBIT_OPTIONS, ...options };
  if (
    !Number.isInteger(resolved.maxIterations) ||
    resolved.maxIterations < 1 ||
    !Number.isInteger(resolved.maxPeriod) ||
    resolved.maxPeriod < 1 ||
    !Number.isFinite(resolved.cycleTolerance) ||
    resolved.cycleTolerance <= 0 ||
    !Number.isInteger(resolved.cycleWarmup) ||
    resolved.cycleWarmup < 0
  ) {
    throw new RangeError(
      'iteration, period, and warmup options must be integers; tolerance must be positive',
    );
  }
  return resolved;
};

const classifyOrbitResolved = (
  c: Complex,
  resolved: OrbitOptions,
  scratch: OrbitScratch,
): OrbitResult => {
  const analytic = analyticInterior(c);
  if (analytic !== undefined) {
    return analytic;
  }

  scratch.ensureCapacity(resolved.maxPeriod);
  const historyRe = scratch.historyRe;
  const historyIm = scratch.historyIm;
  const capacity = historyRe.length;
  let zRe = 0;
  let zIm = 0;
  const toleranceSquared = resolved.cycleTolerance * resolved.cycleTolerance;
  // Recurrence is the primary evidence. The forward closure check allows 100x
  // more linear error for accumulated floating-point operations; both values
  // are squared-distance thresholds.
  const closureToleranceSquared = resolved.cycleTolerance * 100 * (resolved.cycleTolerance * 100);

  for (let iteration = 1; iteration <= resolved.maxIterations; iteration += 1) {
    const nextRe = zRe * zRe - zIm * zIm + c.re;
    zIm = 2 * zRe * zIm + c.im;
    zRe = nextRe;
    const magnitudeSquared = zRe * zRe + zIm * zIm;

    if (magnitudeSquared > 4) {
      const smoothIteration = iteration + 1 - Math.log2(Math.log2(Math.sqrt(magnitudeSquared)));
      return {
        status: 'escaped',
        iterations: iteration,
        evidence: ['escape-radius'],
        escapeIteration: iteration,
        smoothIteration: Number.isFinite(smoothIteration) ? smoothIteration : iteration,
        magnitudeSquared,
      };
    }

    const currentIndex = (iteration - 1) % capacity;
    historyRe[currentIndex] = zRe;
    historyIm[currentIndex] = zIm;
    if (iteration < resolved.cycleWarmup) {
      continue;
    }

    const largestPeriod = Math.min(resolved.maxPeriod, iteration - 1);
    for (let period = 1; period <= largestPeriod; period += 1) {
      const previousIndex = (currentIndex - period + capacity) % capacity;
      const distanceRe = zRe - (historyRe[previousIndex] ?? Number.NaN);
      const distanceIm = zIm - (historyIm[previousIndex] ?? Number.NaN);
      if (distanceRe * distanceRe + distanceIm * distanceIm > toleranceSquared) {
        continue;
      }

      const multiplier = cycleMultiplier(zRe, zIm, c, period, closureToleranceSquared);
      if (
        !multiplier.closes ||
        !Number.isFinite(multiplier.magnitude) ||
        multiplier.magnitude >= 1
      ) {
        continue;
      }

      return cycleResult(period, { re: multiplier.re, im: multiplier.im }, iteration, [
        'converged-cycle',
      ]);
    }
  }

  return {
    status: 'unresolved',
    iterations: resolved.maxIterations,
    evidence: ['iteration-limit'],
  };
};

/**
 * Prepared classifier for raster hot paths. Options and scratch storage are
 * resolved once, then reused for each sequential sample.
 */
export class OrbitClassifier {
  readonly #options: OrbitOptions;
  readonly #scratch: OrbitScratch;

  public constructor(options: Partial<OrbitOptions> = {}, scratch?: OrbitScratch) {
    this.#options = resolveOrbitOptions(options);
    this.#scratch = scratch ?? new OrbitScratch(this.#options.maxPeriod);
    this.#scratch.ensureCapacity(this.#options.maxPeriod);
  }

  public classify(c: Complex): OrbitResult {
    return classifyOrbitResolved(c, this.#options, this.#scratch);
  }
}

export const classifyOrbit = (
  c: Complex,
  options: Partial<OrbitOptions> = {},
  scratch?: OrbitScratch,
): OrbitResult => {
  const resolved = resolveOrbitOptions(options);
  return classifyOrbitResolved(c, resolved, scratch ?? new OrbitScratch(resolved.maxPeriod));
};
