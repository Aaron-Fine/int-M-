import type { Complex, EvidenceFlag, OrbitOptions, OrbitResult } from './types';

export const DEFAULT_ORBIT_OPTIONS: OrbitOptions = Object.freeze({
  maxIterations: 512,
  maxPeriod: 32,
  cycleTolerance: 1e-10,
  cycleWarmup: 24,
});

/**
 * Reusable storage for the orbit hot path. One instance may be reused
 * sequentially across pixels; classifyInto never relies on previous contents.
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

/**
 * Primitive status codes for the allocation-free classification record. The
 * encoding matches the renderer band arrays (0 unresolved, 1 escaped,
 * 2 attracting cycle) so the raster hot path can copy it verbatim.
 */
export type OrbitStatusCode = 0 | 1 | 2;

/**
 * Evidence flags encoded as small integers in the primitive record;
 * materializeOrbitResult maps them back to EvidenceFlag strings at the rich
 * result boundary.
 */
export const ORBIT_EVIDENCE_CODE = Object.freeze({
  escapeRadius: 0,
  analyticMainCardioid: 1,
  analyticPeriod2Bulb: 2,
  convergedCycle: 3,
  iterationLimit: 4,
} as const);

const EVIDENCE_BY_CODE: readonly EvidenceFlag[] = Object.freeze([
  'escape-radius',
  'analytic-main-cardioid',
  'analytic-period-2-bulb',
  'converged-cycle',
  'iteration-limit',
]);

/**
 * Mutable primitive record filled by classifyInto. Every field relevant to
 * the reported status is written on each classification; consumers must read
 * the remaining fields only when the status code says they are defined. One
 * instance may be reused sequentially across pixels.
 */
export interface OrbitSample {
  status: OrbitStatusCode;
  iterations: number;
  evidence: number;
  /** Attracting-cycle only: period of the attracting cycle. */
  period: number;
  /** Attracting-cycle only: cycle multiplier lambda. */
  multiplierRe: number;
  multiplierIm: number;
  multiplierMagnitude: number;
  /** Attracting-cycle only: principal argument of lambda in [-pi, pi]. */
  multiplierAngle: number;
  /** Attracting-cycle only: intrinsic stability kappa = -log(|lambda|) / period. */
  stabilityExponent: number;
  /** Escaped only. */
  escapeIteration: number;
  smoothIteration: number;
  magnitudeSquared: number;
}

export const createOrbitSample = (): OrbitSample => ({
  status: 0,
  iterations: 0,
  evidence: 0,
  period: 0,
  multiplierRe: 0,
  multiplierIm: 0,
  multiplierMagnitude: 0,
  multiplierAngle: 0,
  stabilityExponent: 0,
  escapeIteration: 0,
  smoothIteration: 0,
  magnitudeSquared: 0,
});

const finishAttractingCycle = (
  out: OrbitSample,
  period: number,
  multiplierRe: number,
  multiplierIm: number,
  iterations: number,
  evidence: number,
): void => {
  const multiplierMagnitude = Math.hypot(multiplierRe, multiplierIm);
  out.status = 2;
  out.iterations = iterations;
  out.evidence = evidence;
  out.period = period;
  out.multiplierRe = multiplierRe;
  out.multiplierIm = multiplierIm;
  out.multiplierMagnitude = multiplierMagnitude;
  out.multiplierAngle = multiplierMagnitude === 0 ? 0 : Math.atan2(multiplierIm, multiplierRe);
  out.stabilityExponent =
    multiplierMagnitude === 0 ? Number.POSITIVE_INFINITY : -Math.log(multiplierMagnitude) / period;
};

/**
 * Forward-iterates the proposed cycle and its multiplier derivative. On
 * acceptance writes the attracting-cycle result into `out` and returns true;
 * rejections leave `out` untouched. The rejection order (forward closure,
 * finite multiplier, strict attraction) replicates the legacy classifier
 * exactly.
 */
const verifyCycleInto = (
  cRe: number,
  cIm: number,
  cycleStartRe: number,
  cycleStartIm: number,
  period: number,
  closureToleranceSquared: number,
  out: OrbitSample,
  iterations: number,
): boolean => {
  let zRe = cycleStartRe;
  let zIm = cycleStartIm;
  let derivativeRe = 1;
  let derivativeIm = 0;

  for (let index = 0; index < period; index += 1) {
    const nextDerivativeRe = derivativeRe * (2 * zRe) - derivativeIm * (2 * zIm);
    derivativeIm = derivativeRe * (2 * zIm) + derivativeIm * (2 * zRe);
    derivativeRe = nextDerivativeRe;

    const nextRe = zRe * zRe - zIm * zIm + cRe;
    zIm = 2 * zRe * zIm + cIm;
    zRe = nextRe;
  }

  const closureRe = zRe - cycleStartRe;
  const closureIm = zIm - cycleStartIm;
  if (closureRe * closureRe + closureIm * closureIm > closureToleranceSquared) {
    return false;
  }
  const multiplierMagnitude = Math.hypot(derivativeRe, derivativeIm);
  if (!Number.isFinite(multiplierMagnitude) || multiplierMagnitude >= 1) {
    return false;
  }
  finishAttractingCycle(
    out,
    period,
    derivativeRe,
    derivativeIm,
    iterations,
    ORBIT_EVIDENCE_CODE.convergedCycle,
  );
  return true;
};

export const resolveOrbitOptions = (options: Partial<OrbitOptions> = {}): OrbitOptions => {
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

/**
 * Allocation-free classification core (plan workstream B). Classifies the
 * point c = cRe + i*cIm into the preallocated `out` record without touching
 * the heap: no Complex, result, or evidence objects are created. Options
 * must be pre-resolved with resolveOrbitOptions. Scratch must not be shared
 * between concurrently running classifications; out must not be either.
 * Observable semantics are identical to classifyOrbit, which materializes
 * the rich result boundary from this core.
 */
export const classifyInto = (
  cRe: number,
  cIm: number,
  options: OrbitOptions,
  scratch: OrbitScratch,
  out: OrbitSample,
): void => {
  // Analytic fast paths (closed form): main cardioid and period-2 bulb.
  const x = cRe;
  const ySquared = cIm * cIm;
  const cardioidX = x - 0.25;
  const q = cardioidX * cardioidX + ySquared;

  if (q * (q + cardioidX) < 0.25 * ySquared) {
    const sqrtArgRe = 1 - 4 * x;
    const sqrtArgIm = -4 * cIm;
    const discriminantMagnitude = Math.hypot(sqrtArgRe, sqrtArgIm);
    const rootRe = Math.sqrt(Math.max(0, (discriminantMagnitude + sqrtArgRe) / 2));
    const rootImMagnitude = Math.sqrt(Math.max(0, (discriminantMagnitude - sqrtArgRe) / 2));
    // Legacy multiplier is 1 - sqrt(1 - 4x, -4y) componentwise, so the
    // imaginary part carries the negated principal root sign.
    finishAttractingCycle(
      out,
      1,
      1 - rootRe,
      sqrtArgIm < 0 ? rootImMagnitude : -rootImMagnitude,
      0,
      ORBIT_EVIDENCE_CODE.analyticMainCardioid,
    );
    return;
  }

  const bulbX = x + 1;
  if (bulbX * bulbX + ySquared < 1 / 16) {
    finishAttractingCycle(out, 2, 4 * bulbX, 4 * cIm, 0, ORBIT_EVIDENCE_CODE.analyticPeriod2Bulb);
    return;
  }

  scratch.ensureCapacity(options.maxPeriod);
  const historyRe = scratch.historyRe;
  const historyIm = scratch.historyIm;
  const capacity = historyRe.length;
  let zRe = 0;
  let zIm = 0;
  const toleranceSquared = options.cycleTolerance * options.cycleTolerance;
  // Recurrence is the primary evidence. The forward closure check allows 100x
  // more linear error for accumulated floating-point operations; both values
  // are squared-distance thresholds.
  const closureToleranceSquared = options.cycleTolerance * 100 * (options.cycleTolerance * 100);

  for (let iteration = 1; iteration <= options.maxIterations; iteration += 1) {
    const nextRe = zRe * zRe - zIm * zIm + cRe;
    zIm = 2 * zRe * zIm + cIm;
    zRe = nextRe;
    const magnitudeSquared = zRe * zRe + zIm * zIm;

    if (magnitudeSquared > 4) {
      const smoothIteration = iteration + 1 - Math.log2(Math.log2(Math.sqrt(magnitudeSquared)));
      out.status = 1;
      out.iterations = iteration;
      out.evidence = ORBIT_EVIDENCE_CODE.escapeRadius;
      out.escapeIteration = iteration;
      out.smoothIteration = Number.isFinite(smoothIteration) ? smoothIteration : iteration;
      out.magnitudeSquared = magnitudeSquared;
      return;
    }

    const currentIndex = (iteration - 1) % capacity;
    historyRe[currentIndex] = zRe;
    historyIm[currentIndex] = zIm;
    if (iteration < options.cycleWarmup) {
      continue;
    }

    const largestPeriod = Math.min(options.maxPeriod, iteration - 1);
    for (let period = 1; period <= largestPeriod; period += 1) {
      const previousIndex = (currentIndex - period + capacity) % capacity;
      const distanceRe = zRe - (historyRe[previousIndex] ?? Number.NaN);
      const distanceIm = zIm - (historyIm[previousIndex] ?? Number.NaN);
      if (distanceRe * distanceRe + distanceIm * distanceIm > toleranceSquared) {
        continue;
      }
      if (verifyCycleInto(cRe, cIm, zRe, zIm, period, closureToleranceSquared, out, iteration)) {
        return;
      }
    }
  }

  out.status = 0;
  out.iterations = options.maxIterations;
  out.evidence = ORBIT_EVIDENCE_CODE.iterationLimit;
};

/**
 * Rich result boundary for the primitive record. Allocates; intended for the
 * inspector and legacy callers only — hot raster paths consume OrbitSample
 * directly.
 */
export const materializeOrbitResult = (sample: Readonly<OrbitSample>): OrbitResult => {
  const evidence: EvidenceFlag[] = [EVIDENCE_BY_CODE[sample.evidence] ?? 'iteration-limit'];
  if (sample.status === 1) {
    return {
      status: 'escaped',
      iterations: sample.iterations,
      evidence,
      escapeIteration: sample.escapeIteration,
      smoothIteration: sample.smoothIteration,
      magnitudeSquared: sample.magnitudeSquared,
    };
  }
  if (sample.status === 2) {
    return {
      status: 'attracting-cycle',
      iterations: sample.iterations,
      evidence,
      period: sample.period,
      multiplierMagnitude: sample.multiplierMagnitude,
      multiplierAngle: sample.multiplierAngle,
      stabilityExponent: sample.stabilityExponent,
    };
  }
  return {
    status: 'unresolved',
    iterations: sample.iterations,
    evidence,
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

  /** Rich-result convenience boundary for non-hot callers (inspector paths). */
  public classify(c: Complex): OrbitResult {
    const sample = createOrbitSample();
    classifyInto(c.re, c.im, this.#options, this.#scratch, sample);
    return materializeOrbitResult(sample);
  }

  /** Allocation-free core: classifies (cRe, cIm) into the caller's record. */
  public classifyInto(cRe: number, cIm: number, out: OrbitSample): void {
    classifyInto(cRe, cIm, this.#options, this.#scratch, out);
  }
}

export const classifyOrbit = (
  c: Complex,
  options: Partial<OrbitOptions> = {},
  scratch?: OrbitScratch,
): OrbitResult => {
  const resolved = resolveOrbitOptions(options);
  const sample = createOrbitSample();
  classifyInto(c.re, c.im, resolved, scratch ?? new OrbitScratch(resolved.maxPeriod), sample);
  return materializeOrbitResult(sample);
};
