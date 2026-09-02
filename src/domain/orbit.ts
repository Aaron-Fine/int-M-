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
  // When the caller already computed Math.hypot(multiplierRe, multiplierIm)
  // it must pass the same value: Math.hypot is a C++ builtin that allocates
  // a HeapNumber in V8, so the core computes it once per cycle detection.
  multiplierMagnitude: number = Math.hypot(multiplierRe, multiplierIm),
): void => {
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
 * Cycle verification body, written verbatim at its single call site in the
 * classifyInto lag scan. Rejection order (forward closure, finite
 * multiplier, strict attraction) replicates the legacy classifier exactly.
 * It must stay inlined there rather than live in a helper: a non-inlined JS
 * call inside the orbit loop keeps the orbit's Float64 phi values live
 * across a lazy-deopt frame state, which switches their V8 representation
 * to tagged and allocates a HeapNumber every iteration (the pr2 microbench
 * measured the helper form at ~120 MB of engine garbage per million-pixel
 * interior-heavy pass, with no compensating speed benefit).
 */

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
 * point c = cRe + i*cIm into the preallocated `out` record without creating
 * objects of its own: no Complex, result, or evidence objects. Options must
 * be pre-resolved with resolveOrbitOptions. Scratch must not be shared
 * between concurrently running classifications; out must not be either.
 * Observable semantics are identical to classifyOrbit, which materializes
 * the rich result boundary from this core.
 *
 * Two V8 engine taxes remain on top of this design and are accepted for
 * bit-parity reasons: crossing the non-inlined call boundary boxes the two
 * double arguments, and Math.hypot (the legacy magnitude definition, kept
 * for identical multiplier bits) is a C++ builtin that allocates. Both are
 * quantified in the pr2 microbench (poc/performance/results/pr2/). A third
 * tax the microbench exposed — tagged-representation orbit phis caused by a
 * non-inlined verify helper inside the orbit loop, plus the legacy
 * defensive `history[i] ?? Number.NaN` pattern — is designed out instead;
 * see the comments at the orbit loop and the lag scan.
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

  // The orbit loop must not contain non-inlined JS calls with the orbit
  // state live across them: a lazy-deopt frame state at such a call switches
  // zRe/zIm's V8 representation to tagged, allocating a HeapNumber every
  // iteration (~120 MB per million-pixel interior-heavy pass, measured by
  // the pr2 microbench). The cycle verification below is therefore written
  // out at its single call site instead of in a helper, and V8-internal
  // builtins (Math.hypot) are acceptable only because they cannot lazily
  // deopt the caller.

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
      // previousIndex is always in [0, capacity - 1]: currentIndex is reduced
      // modulo capacity and 1 <= period <= largestPeriod < capacity, so the
      // history loads below are provably total. They must stay bare: the
      // defensive `history[i] ?? Number.NaN` pattern forces a tagged
      // materialization of the loaded double for its undefined check. The
      // non-null assertions restate the in-bounds proof for the
      // noUncheckedIndexedAccess checker and compile to nothing; the rule is
      // disabled for exactly these two loads because every assertion style
      // lint allows carries runtime cost in a hot loop.
      const previousIndex = (currentIndex - period + capacity) % capacity;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- in-bounds proof above
      const distanceRe = zRe - historyRe[previousIndex]!;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- in-bounds proof above
      const distanceIm = zIm - historyIm[previousIndex]!;
      if (distanceRe * distanceRe + distanceIm * distanceIm > toleranceSquared) {
        continue;
      }

      // Cycle verification, inlined at its single call site (see the orbit
      // loop comment above for why the helper form is forbidden here).
      // Rejection order matches the legacy classifier: forward closure,
      // finite multiplier, strict attraction.
      let cycleRe = zRe;
      let cycleIm = zIm;
      let derivativeRe = 1;
      let derivativeIm = 0;
      for (let index = 0; index < period; index += 1) {
        const nextDerivativeRe = derivativeRe * (2 * cycleRe) - derivativeIm * (2 * cycleIm);
        derivativeIm = derivativeRe * (2 * cycleIm) + derivativeIm * (2 * cycleRe);
        derivativeRe = nextDerivativeRe;

        const nextCycleRe = cycleRe * cycleRe - cycleIm * cycleIm + cRe;
        cycleIm = 2 * cycleRe * cycleIm + cIm;
        cycleRe = nextCycleRe;
      }

      const closureRe = cycleRe - zRe;
      const closureIm = cycleIm - zIm;
      if (closureRe * closureRe + closureIm * closureIm > closureToleranceSquared) {
        continue;
      }
      const multiplierMagnitude = Math.hypot(derivativeRe, derivativeIm);
      if (!Number.isFinite(multiplierMagnitude) || multiplierMagnitude >= 1) {
        continue;
      }
      finishAttractingCycle(
        out,
        period,
        derivativeRe,
        derivativeIm,
        iteration,
        ORBIT_EVIDENCE_CODE.convergedCycle,
        multiplierMagnitude,
      );
      return;
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
