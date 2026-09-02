import { TAU_CLOSURE_SCALED, VERIFIER_REVISION, VERIFIER_THRESHOLDS } from './verifier';
import type { Complex, EvidenceFlag, OrbitOptions, OrbitResult } from './types';
import { CLASSIFIER_MODES, EVIDENCE_BY_CODE, ORBIT_EVIDENCE_CODE } from './types';
import type { CheckpointMetrics, DifferentialStats } from './checkpoint';
import {
  classifyCheckpointInto,
  createCheckpointMetrics,
  createDifferentialStats,
  recordDifferentialInto,
} from './checkpoint';

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
  classifierMode: 'legacy-scan',
  exhaustionScan: true,
});

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
   * documented at classifyInto). Unused by the lag scan.
   */
  public checkpointSpill: Float64Array;

  public constructor(maxPeriod: number = DEFAULT_ORBIT_OPTIONS.maxPeriod) {
    const capacity = Math.max(2, Math.ceil(maxPeriod) + 1);
    this.historyRe = new Float64Array(capacity);
    this.historyIm = new Float64Array(capacity);
    this.checkpointSpill = new Float64Array(4);
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
 * Cycle verification policy body, mirrored verbatim at its single call site
 * in the classifyInto lag scan. The frozen acceptance policy — three-way
 * proper-divisor reduction, scale-aware closure, attraction margin — is
 * defined by src/domain/verifier.ts (verifyCycleInto, the reference
 * implementation); the lag scan carries an inline copy of that body because
 * a non-inlined JS call inside the orbit loop keeps the orbit's Float64 phi
 * values live across a lazy-deopt frame state, which switches their V8
 * representation to tagged and allocates a HeapNumber every iteration (the
 * pr2 microbench measured the helper form at ~120 MB of engine garbage per
 * million-pixel interior-heavy pass, with no compensating speed benefit).
 * The differential tests pin the inline copy and the canonical function
 * together bit for bit; change them only as a pair.
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
  const classifierMode = resolved.classifierMode ?? 'legacy-scan';
  if (!CLASSIFIER_MODES.includes(classifierMode)) {
    throw new RangeError(
      `classifierMode must be one of ${CLASSIFIER_MODES.join(', ')}; got ${classifierMode}`,
    );
  }
  const exhaustionScan = resolved.exhaustionScan ?? true;
  // Normalized form: the optional mode/scan fields are always set, so kernel
  // code reads plain values instead of re-applying defaults.
  return { ...resolved, classifierMode, exhaustionScan };
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
 * Acceptance policy (PR 3): every attracting result — analytic fast paths
 * included — passes the common numerical verifier (src/domain/verifier.ts,
 * revision VERIFIER_REVISION). The lag-scan candidate proposal (proximity
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
  // eslint-disable-next-line complexity -- the branch count is the fused scan + verifier policy body; see the comments above and at the lag scan
): void => {
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
      return;
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
        return;
      }
    }
  }

  scratch.ensureCapacity(options.maxPeriod);
  const historyRe = scratch.historyRe;
  const historyIm = scratch.historyIm;
  const capacity = historyRe.length;
  let zRe = 0;
  let zIm = 0;
  // Candidate proposal gate (frozen): the lag-scan proximity threshold.
  // Acceptance below is the common verifier's frozen policy and does not
  // scale with this option.
  const toleranceSquared = options.cycleTolerance * options.cycleTolerance;

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

      // Verifier acceptance, inlined at its single call site (see the orbit
      // loop comment above for why the helper form is forbidden here). This
      // block mirrors verifyCycleInto in src/domain/verifier.ts (frozen
      // policy) body for body — the differential tests pin them together.
      const scale = Math.max(1, Math.abs(zRe), Math.abs(zIm));
      const acceptSquared = TAU_CLOSURE_SCALED * TAU_CLOSURE_SCALED * scale * scale;
      const excludeSquared =
        VERIFIER_THRESHOLDS.tauExclude * VERIFIER_THRESHOLDS.tauExclude * scale * scale;

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

      // Non-finite state, derivative, or residual: rejected, never
      // attracting (NaN and Infinity are absorbing under this arithmetic, so
      // final checks match the canonical per-step checks).
      if (
        !Number.isFinite(cycleRe) ||
        !Number.isFinite(cycleIm) ||
        !Number.isFinite(derivativeRe) ||
        !Number.isFinite(derivativeIm)
      ) {
        continue;
      }
      const closureRe = cycleRe - zRe;
      const closureIm = cycleIm - zIm;
      const closureSquared = closureRe * closureRe + closureIm * closureIm;
      if (!Number.isFinite(closureSquared)) {
        continue;
      }
      // Three-way closure policy: above the exclusion bound there is no
      // closure; the gap between the bounds is ambiguous and refuses
      // confident classification (the scan continues either way).
      if (closureSquared > excludeSquared) {
        continue;
      }
      if (closureSquared > acceptSquared) {
        continue;
      }

      // Primitive-period reduction over proper divisors, ascending: the
      // smallest divisor that also closes is the primitive period. A divisor
      // residual inside the (accept, exclude) gap leaves primitivity
      // undecidable and refuses the candidate.
      let primitive = period;
      let primitiveDerivativeRe = derivativeRe;
      let primitiveDerivativeIm = derivativeIm;
      let accepted = true;
      for (let divisor = 1; divisor < period; divisor += 1) {
        if (period % divisor !== 0) {
          continue;
        }
        let walkRe = zRe;
        let walkIm = zIm;
        let walkDerivativeRe = 1;
        let walkDerivativeIm = 0;
        for (let index = 0; index < divisor; index += 1) {
          const nextWalkDerivativeRe =
            walkDerivativeRe * (2 * walkRe) - walkDerivativeIm * (2 * walkIm);
          walkDerivativeIm = walkDerivativeRe * (2 * walkIm) + walkDerivativeIm * (2 * walkRe);
          walkDerivativeRe = nextWalkDerivativeRe;

          const nextWalkRe = walkRe * walkRe - walkIm * walkIm + cRe;
          walkIm = 2 * walkRe * walkIm + cIm;
          walkRe = nextWalkRe;
          if (!Number.isFinite(walkRe) || !Number.isFinite(walkIm)) {
            accepted = false;
            break;
          }
        }
        if (!accepted) {
          break;
        }
        const divisorResidualRe = walkRe - zRe;
        const divisorResidualIm = walkIm - zIm;
        const divisorResidualSquared =
          divisorResidualRe * divisorResidualRe + divisorResidualIm * divisorResidualIm;
        if (!Number.isFinite(divisorResidualSquared)) {
          accepted = false;
          break;
        }
        if (divisorResidualSquared <= acceptSquared) {
          primitive = divisor;
          primitiveDerivativeRe = walkDerivativeRe;
          primitiveDerivativeIm = walkDerivativeIm;
          break;
        }
        if (divisorResidualSquared < excludeSquared) {
          // Divisor-ambiguous: primitivity undecidable, candidate refused.
          accepted = false;
          break;
        }
      }
      if (!accepted) {
        continue;
      }

      // Attraction margin on the primitive multiplier: |lambda| must stay
      // below 1 - margin (plan section 3), not merely below 1.
      const multiplierMagnitude = Math.hypot(primitiveDerivativeRe, primitiveDerivativeIm);
      if (
        !Number.isFinite(multiplierMagnitude) ||
        multiplierMagnitude >= 1 - VERIFIER_THRESHOLDS.attractMargin
      ) {
        continue;
      }
      finishAttractingCycle(
        out,
        primitive,
        primitiveDerivativeRe,
        primitiveDerivativeIm,
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
      verifierRevision: VERIFIER_REVISION,
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
 *
 * The versioned classifier-mode option (PR 4) selects the kernel per
 * instance; the mode never changes an instance's behavior after
 * construction. 'legacy-scan' (the default) allocates nothing beyond the
 * legacy path; 'checkpoint' and 'differential' preallocate their extra state
 * (checkpoint metrics, differential sample and record) once, in the
 * constructor. In differential mode both kernels run per pixel, the LEGACY
 * answer stays the reported one, and disagreements accumulate into the
 * preallocated DifferentialStats (read via differentialStats).
 */
export class OrbitClassifier {
  readonly #options: OrbitOptions;
  readonly #scratch: OrbitScratch;
  // Null unless the mode needs it, so the default legacy path allocates
  // nothing extra and its hot path stays the PR 2 measured shape plus one
  // monomorphic field check.
  readonly #extras:
    | {
        readonly mode: 'checkpoint' | 'differential';
        readonly metrics: CheckpointMetrics;
        readonly diffSample: OrbitSample;
        readonly diffStats: DifferentialStats;
      }
    | undefined;

  public constructor(options: Partial<OrbitOptions> = {}, scratch?: OrbitScratch) {
    this.#options = resolveOrbitOptions(options);
    this.#scratch = scratch ?? new OrbitScratch(this.#options.maxPeriod);
    this.#scratch.ensureCapacity(this.#options.maxPeriod);
    // resolveOrbitOptions normalizes the optional mode field, so mode is a
    // concrete ClassifierMode here.
    const mode = this.#options.classifierMode ?? 'legacy-scan';
    this.#extras =
      mode === 'legacy-scan'
        ? undefined
        : {
            mode,
            metrics: createCheckpointMetrics(),
            diffSample: createOrbitSample(),
            diffStats: createDifferentialStats(),
          };
  }

  /** Rich-result convenience boundary for non-hot callers (inspector paths). */
  public classify(c: Complex): OrbitResult {
    const sample = createOrbitSample();
    this.classifyInto(c.re, c.im, sample);
    return materializeOrbitResult(sample);
  }

  /** Allocation-free core: classifies (cRe, cIm) into the caller's record. */
  public classifyInto(cRe: number, cIm: number, out: OrbitSample): void {
    // Inline dispatch (not a shared helper): this is the raster hot path —
    // one monomorphic branch on the constructor-fixed mode before the same
    // kernel call the PR 2 measurements exercised.
    const extras = this.#extras;
    if (extras === undefined) {
      classifyInto(cRe, cIm, this.#options, this.#scratch, out);
      return;
    }
    if (extras.mode === 'checkpoint') {
      classifyCheckpointInto(cRe, cIm, this.#options, this.#scratch, out, extras.metrics);
      return;
    }
    // Differential: both kernels per pixel; the legacy answer stays the
    // reported one and every semantic divergence is counted.
    classifyInto(cRe, cIm, this.#options, this.#scratch, out);
    classifyCheckpointInto(
      cRe,
      cIm,
      this.#options,
      this.#scratch,
      extras.diffSample,
      extras.metrics,
    );
    recordDifferentialInto(extras.diffStats, out, extras.diffSample);
  }

  /**
   * The preallocated disagreement record (differential mode only; null
   * otherwise). Reset it between frames with resetDifferentialStats.
   */
  public get differentialStats(): DifferentialStats | null {
    const extras = this.#extras;
    return extras?.mode === 'differential' ? extras.diffStats : null;
  }
}

export const classifyOrbit = (
  c: Complex,
  options: Partial<OrbitOptions> = {},
  scratch?: OrbitScratch,
): OrbitResult => {
  const resolved = resolveOrbitOptions(options);
  const sample = createOrbitSample();
  const mode = resolved.classifierMode;
  if (mode === 'checkpoint') {
    classifyCheckpointInto(
      c.re,
      c.im,
      resolved,
      scratch ?? new OrbitScratch(resolved.maxPeriod),
      sample,
      createCheckpointMetrics(),
    );
  } else if (mode === 'differential') {
    // Both kernels; the legacy answer is reported. Per-call stats are not
    // retained — accumulate across pixels with OrbitClassifier (or call
    // recordDifferentialInto directly).
    const share = scratch ?? new OrbitScratch(resolved.maxPeriod);
    classifyInto(c.re, c.im, resolved, share, sample);
    const diffSample = createOrbitSample();
    classifyCheckpointInto(c.re, c.im, resolved, share, diffSample, createCheckpointMetrics());
    recordDifferentialInto(createDifferentialStats(), sample, diffSample);
  } else {
    classifyInto(c.re, c.im, resolved, scratch ?? new OrbitScratch(resolved.maxPeriod), sample);
  }
  return materializeOrbitResult(sample);
};
