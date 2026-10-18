import {
  defaultPeriodPolicyFor,
  evidenceSourceForFlag,
  resolvePeriodPolicy,
} from './period-policy';
import { stabilityExponentOf, VERIFIER_REVISION, VERIFIER_THRESHOLDS } from './verifier';
import { classifyTriggeredOrbitInto } from './orbit-triggered';
import type { Complex, EvidenceFlag, OrbitOptions, OrbitResult } from './types';
import { EVIDENCE_BY_CODE, ORBIT_EVIDENCE_CODE } from './types';

// Shared evidence vocabulary moved to types.ts so every classifier kernel
// (the lag scan here and the PR 4 checkpoint schedule) writes the same
// codes; re-exported to keep the src/domain API stable.
export { EVIDENCE_BY_CODE, ORBIT_EVIDENCE_CODE };

export const DEFAULT_ORBIT_OPTIONS: OrbitOptions = Object.freeze({
  maxIterations: 512,
  maxPeriod: 32,
  // Proposal gate only since the common verifier (PR 3): acceptance is the
  // frozen policy in src/domain/verifier.ts.
  cycleTolerance: 1e-10,
  cycleWarmup: 24,
});

/**
 * History ring capacity for lags up to maxPeriod: the smallest power of two
 * holding maxPeriod + 1 points, so ring indices can be reduced with a mask
 * (the triggered kernel); the modulo-indexed kernels work with any capacity
 * of at least maxPeriod + 1.
 */
const ringCapacity = (maxPeriod: number): number => {
  let capacity = 2;
  while (capacity < maxPeriod + 1) capacity *= 2;
  return capacity;
};

/**
 * Reusable storage for the orbit hot path. One instance may be reused
 * sequentially across pixels; classifyInto never relies on previous contents.
 */
export class OrbitScratch {
  public historyRe: Float64Array;
  public historyIm: Float64Array;
  /**
   * Four spill slots for the PR 4 checkpoint schedule (z and checkpoint
   * state round-tripped across the non-inlined verifyCycleInto call so no
   * walk-loop phi is live at that call site — the V8 phi-boxing constraint
   * documented at classifyInto). Used by the triggered kernel's verifier call.
   */
  public checkpointSpill: Float64Array;

  public constructor(maxPeriod: number = DEFAULT_ORBIT_OPTIONS.maxPeriod) {
    const capacity = ringCapacity(Math.max(1, Math.ceil(maxPeriod)));
    this.historyRe = new Float64Array(capacity);
    this.historyIm = new Float64Array(capacity);
    this.checkpointSpill = new Float64Array(4);
  }

  public ensureCapacity(maxPeriod: number): void {
    if (this.historyRe.length >= maxPeriod + 1) {
      return;
    }
    const capacity = ringCapacity(maxPeriod);
    this.historyRe = new Float64Array(capacity);
    this.historyIm = new Float64Array(capacity);
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
 * result boundary. Defined in types.ts (shared with the checkpoint kernel).
 */

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
};

/**
 * Analytic fast paths (closed form) shared by every kernel: writes the
 * attracting record and returns true when c lies in the main cardioid or the
 * period-2 bulb with a multiplier inside the attraction margin; returns false
 * (record untouched) otherwise, including margin-adjacent points, which fall
 * through to the orbit loop. The period-3 closed form and the period-4 cubic
 * solve (src/domain/analytic-period-three.ts, analytic-period-four.ts) are not
 * tried here: they run inside the orbit loop at the first scanning iteration,
 * so pixels that escape early never pay for them (ADR 0010, ADR 0013).
 */
export const classifyAnalyticInto = (cRe: number, cIm: number, out: OrbitSample): boolean => {
  // Analytic fast paths (closed form): main cardioid and period-2 bulb.
  // Their acceptance migrates to the verifier policy (plan section 4 stage
  // 1): the exact closed-form multiplier must satisfy the frozen attraction
  // margin; margin-adjacent points are refused here and fall through to the
  // lag scan (verify or fall back), which applies the same policy. The
  // closed forms carry no closure residual, so the scale-aware tolerance has
  // no analytic counterpart; period 1 has no proper divisor and the period-2
  // cycle is genuinely period 2 everywhere inside the bulb (the two cycle
  // points merge only on the excluded boundary), so divisor reduction is
  // vacuous on both paths.
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
    const multiplierRe = 1 - rootRe;
    const multiplierIm = sqrtArgIm < 0 ? rootImMagnitude : -rootImMagnitude;
    const multiplierMagnitude = Math.hypot(multiplierRe, multiplierIm);
    if (multiplierMagnitude < 1 - VERIFIER_THRESHOLDS.attractMargin) {
      finishAttractingCycle(
        out,
        1,
        multiplierRe,
        multiplierIm,
        0,
        ORBIT_EVIDENCE_CODE.analyticMainCardioid,
        multiplierMagnitude,
      );
      return true;
    }
  } else {
    const bulbX = x + 1;
    if (bulbX * bulbX + ySquared < 1 / 16) {
      const multiplierRe = 4 * bulbX;
      const multiplierIm = 4 * cIm;
      const multiplierMagnitude = Math.hypot(multiplierRe, multiplierIm);
      if (multiplierMagnitude < 1 - VERIFIER_THRESHOLDS.attractMargin) {
        finishAttractingCycle(
          out,
          2,
          multiplierRe,
          multiplierIm,
          0,
          ORBIT_EVIDENCE_CODE.analyticPeriod2Bulb,
          multiplierMagnitude,
        );
        return true;
      }
    }
  }
  return false;
};

export const resolveOrbitOptions = (options: Partial<OrbitOptions> = {}): OrbitOptions => {
  const { periodPolicy, ...operative } = options;
  const resolved: OrbitOptions = { ...DEFAULT_ORBIT_OPTIONS, ...operative };
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
  // Normalized form: the optional mode/scan fields are always set, so kernel
  // code reads plain values instead of re-applying defaults.
  // PR 5 (plan section 4): attach versioned period-policy metadata. The
  // policy describes the search, it does not drive it — classification reads
  // only the operative fields above, and an explicit policy must agree with
  // them (resolvePeriodPolicy throws otherwise). With no explicit policy the
  // derived default equals today's constants, so legacy behavior is
  // unchanged (pinned in tests/unit/domain/period-policy.test.ts).
  return {
    ...resolved,
    periodPolicy:
      periodPolicy === undefined
        ? defaultPeriodPolicyFor(resolved.maxIterations, resolved.maxPeriod)
        : resolvePeriodPolicy(periodPolicy, resolved),
  };
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
 * Acceptance policy (PR 3): every orbit-path attracting result passes the
 * common numerical verifier (src/domain/verifier.ts, revision
 * VERIFIER_REVISION) via verifyCycleInto. The closed forms (periods 1-3)
 * accept by the verifier's attraction margin instead, period 3 with a derived
 * binary64 allowance (ADR 0010). The lag-scan candidate proposal (proximity
 * below OrbitOptions.cycleTolerance) is unchanged; only acceptance migrated.
 *
 * Semantic changes versus the legacy classifier, enumerated per plan
 * section 3 ("A changed legacy answer may ship only when the oracle supports
 * the change") and adjudicated against the double-double oracle in
 * tests/unit/domain/orbit-scalar-parity.test.ts:
 *
 * 1. Primitive-period reduction. A lag-scan candidate accepted at lag q is
 *    reduced to the smallest proper divisor of q whose forward walk also
 *    closes (three-way policy: a divisor residual inside the
 *    (accept, exclude) gap leaves primitivity undecidable and refuses the
 *    candidate, so the scan continues and the pixel stays unresolved unless
 *    a later candidate closes cleanly). The legacy scan had no divisor
 *    reduction and reported non-primitive multiples where binary64 rounding
 *    let a multiple lag cross the proposal threshold before the primitive
 *    one (2/3/3 results per profile on the frozen corpus, primitive period 4
 *    reported as 8 or 12; poc/performance/results/summary.json). Period,
 *    multiplier magnitude, angle, and kappa of reduced candidates are
 *    recomputed at the primitive period, so those bits differ from legacy by
 *    construction; detection iteration and evidence code are unchanged.
 * 2. Attraction margin. The legacy strict |lambda| < 1 becomes the frozen
 *    |lambda| < 1 - 1e-12. On the analytic fast paths this refuses
 *    margin-adjacent points (|lambda| in [1 - margin, 1), exact closed-form
 *    multiplier): they fall through to the lag scan — verify or fall back,
 *    plan section 4 — and end unresolved instead of attracting. On the
 *    lag-scan path the margin is policy symmetry: detecting a cycle with
 *    |lambda| >= 1 - 1e-12 needs ~1e13 iterations, far beyond any budget, so
 *    no feasible legacy acceptance is removed there.
 * 3. Closure ambiguity. Proposed-closure residuals in the
 *    (1e-8 * scale, 1e-6 * scale] gap refuse the candidate (the legacy
 *    classifier rejected everything above its absolute 1e-8 bound, so the
 *    observable scan behavior is unchanged inside that band; the gap exists
 *    so near-threshold candidates never classify confidently).
 * 4. Scale-aware acceptance bound. The frozen closure bound is
 *    1e-8 * max(1, |z|) instead of the legacy absolute 1e-8. At unit scale
 *    the bounds coincide; for cycle states with |z| in (1, 2] (the escape
 *    radius bounds the orbit) it is up to 2x looser, so a thin residual
 *    shell can accept where the legacy absolute bound kept scanning. The
 *    oracle differential covers these points.
 * 5. Frozen acceptance. Closure acceptance no longer scales with
 *    OrbitOptions.cycleTolerance, which remains the proposal gate only.
 *    With the default 1e-10 the numeric bounds equal the legacy ones.
 * 6. Analytic period 3 (ADR 0010). At the first scanning iteration the
 *    kernels try the period-3 closed form (src/domain/analytic-period-three.ts)
 *    inside padded component boxes. It accepts with iterations 0 and the
 *    closed-form multiplier, so pixels the legacy scan left unresolved become
 *    attracting period 3, and period-3 pixels carry the closed-form multiplier
 *    instead of the orbit product. Every such answer is checked against the
 *    dd period-3 cycle in tests/unit/domain/orbit-oracle-adjudication.test.ts.
 * 7. Analytic period 4 (ADR 0013). At the same iteration the kernels try the
 *    certified period-4 cubic solve (src/domain/analytic-period-four.ts)
 *    inside padded component boxes. It accepts with iterations 0 and the
 *    certified multiplier, so pixels the legacy scan left unresolved become
 *    attracting period 4 (the left half of the 6,000,000x view among them),
 *    and period-4 pixels carry the certified multiplier instead of the orbit
 *    product. Every such answer is checked against the dd period-4 cycle in
 *    tests/unit/domain/orbit-oracle-adjudication.test.ts.
 *
 * Every accepted attracting result carries the verifier revision at the rich
 * boundary (AttractingCycleOrbitResult.verifierRevision).
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
  if (classifyAnalyticInto(cRe, cIm, out)) {
    return;
  }
  scratch.ensureCapacity(options.maxPeriod);
  // Watched-lag kernel (src/domain/orbit-triggered.ts). Called before the
  // orbit loop starts, so no orbit state is live across the call.
  classifyTriggeredOrbitInto(cRe, cIm, options, scratch, out);
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
      stabilityExponent: stabilityExponentOf(sample.multiplierMagnitude, sample.period),
      verifierRevision: VERIFIER_REVISION,
      // Origin metadata (PR 5, plan section 4): the single evidence flag an
      // attracting result carries identifies its proposal path — the
      // closed forms are 'analytic', everything else is the lag scan
      // ('fallback'). Acceptance above is source-blind; this stamp must
      // stay descriptive (workstream D kill condition: no candidate-source
      // leakage into confidence semantics).
      evidenceSource: evidenceSourceForFlag(evidence[0] ?? 'iteration-limit'),
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
    this.classifyInto(c.re, c.im, sample);
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
