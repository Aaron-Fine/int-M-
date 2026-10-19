/**
 * Common numerical verifier for src/ (plan section 3: "One verifier decides.
 * Every attracting result passes the same finite-value, primitive-period,
 * closure, residual, and attraction checks regardless of source or backend").
 *
 * For f_c(z) = z^2 + c and a proposed period p the verifier
 *
 * 1. rejects non-finite state, residual, or derivative values,
 * 2. checks f_c^p(z) - z against a scale-aware residual tolerance,
 * 3. tests every proper divisor of p and reduces to the smallest closing one
 *    (three-way policy, see below),
 * 4. computes lambda = (f_c^p)'(z) and requires |lambda| < 1 - margin,
 * 5. refuses confident classification at tolerance ambiguity, and
 * 6. emits period, |lambda|, arg lambda, and kappa stamped with the verifier
 *    revision.
 *
 * Three-way divisor policy: closure below the scaled acceptance bound reduces
 * the candidate to the smallest closing proper divisor; separation above the
 * larger exclusion bound keeps the candidate; the gap between the bounds is
 * ambiguous and never classifies. Non-finite anything is rejected, never
 * attracting; unresolved is the honest answer at ambiguity.
 *
 * The thresholds are versioned policy, not tuning knobs. Candidate sources
 * arrive in PR 4+; this module freezes acceptance first (plan section 11,
 * PR 3: "Freeze candidate acceptance before adding candidate sources").
 */

/**
 * Frozen verifier policy. Provenance (plan section 3: "Residual tolerance,
 * binary64 error allowance, attraction margin, and scale normalization are
 * versioned policy"):
 *
 * - tauAccept: the legacy candidate tolerance,
 *   src/domain/orbit.ts DEFAULT_ORBIT_OPTIONS.cycleTolerance = 1e-10.
 * - closureRelaxation: the legacy forward-closure allowance of 100x linear
 *   error (orbit.ts closureToleranceSquared), applied to the acceptance
 *   bound. With the default options the scaled acceptance bound
 *   (tauAccept * closureRelaxation = 1e-8, scale-aware) equals the legacy
 *   absolute forward-closure bound at unit scale.
 * - tauExclude: the divisor separation bound; distinct periodic points at
 *   unit scale in the benchmark corpus strata are separated far more than
 *   1e-6. PoC policy choice (poc/performance/src/verifier.ts), shared here.
 * - attractMargin: |lambda| must satisfy |lambda| < 1 - margin. Tightens the
 *   legacy strict |lambda| < 1 so near-parabolic cycles stay unresolved
 *   rather than marginally accepted. PoC policy choice.
 *
 * - tauCandidate: the permissive scale-aware PROPOSAL threshold of the PR 4
 *   checkpoint schedule (plan section 4; PoC policy value 1e-8, kept). A
 *   proximity hit at tauCandidate only proposes (lag, cycle point) to
 *   verifyCycleInto — it never accepts, so the acceptance policy above is
 *   untouched and VERIFIER_REVISION is unchanged. Requirement:
 *   tauCandidate > tauAccept, so a proposed candidate can still fail the
 *   stricter acceptance bound.
 */
export const VERIFIER_THRESHOLDS = Object.freeze({
  tauAccept: 1e-10,
  closureRelaxation: 100,
  tauCandidate: 1e-8,
  tauExclude: 1e-6,
  attractMargin: 1e-12,
});

/**
 * Scale-aware acceptance bound (linear, pre-scaling): the legacy 100x
 * forward-closure allowance. The verifier scales it by
 * max(1, |z|, |y|) of the proposed cycle start.
 */
export const TAU_CLOSURE_SCALED =
  VERIFIER_THRESHOLDS.tauAccept * VERIFIER_THRESHOLDS.closureRelaxation;

/**
 * Revision of the frozen policy above. Every accepted attracting result
 * carries it (see AttractingCycleOrbitResult.verifierRevision). Distinct
 * from the PoC harness revision 'poc-verifier-1.0.0': the two policies are
 * frozen separately even though their values currently agree.
 */
export const VERIFIER_REVISION = 'src-verifier-1.0.0';

/**
 * Intrinsic stability kappa = -log(|lambda|) / period of an accepted cycle;
 * +Infinity for a superattracting cycle (|lambda| = 0) by identity. Derived
 * at the rich-result boundaries only: no raster consumer reads it (the
 * stability coloring derives it from the stored |lambda| and period), so the
 * hot records do not carry it.
 */
export const stabilityExponentOf = (multiplierMagnitude: number, period: number): number =>
  multiplierMagnitude === 0 ? Number.POSITIVE_INFINITY : -Math.log(multiplierMagnitude) / period;

/**
 * Verdict codes for the allocation-free hot form (same encoding discipline
 * as ORBIT_EVIDENCE_CODE: small integers, no per-call objects).
 */
export const VERIFIER_VERDICT = Object.freeze({
  rejectedNonFinite: 0,
  rejectedNoClosure: 1,
  rejectedNotAttracting: 2,
  unresolvedClosureAmbiguous: 3,
  unresolvedDivisorAmbiguous: 4,
  accepted: 5,
} as const);

export type VerifierVerdictCode = (typeof VERIFIER_VERDICT)[keyof typeof VERIFIER_VERDICT];

/**
 * Mutable record the hot form writes on acceptance. Structurally satisfied
 * by OrbitSample; declared locally so the verifier stays decoupled from the
 * orbit module (no import cycle, no runtime dependency).
 */
export interface VerifierCycleTarget {
  status: number;
  iterations: number;
  evidence: number;
  period: number;
  multiplierRe: number;
  multiplierIm: number;
  multiplierMagnitude: number;
  multiplierAngle: number;
}

/**
 * Rich verdict for non-hot callers (tests, inspector paths, future candidate
 * sources outside the per-pixel loop). Allocates; the hot form is
 * verifyCycleInto.
 */
export type VerifierVerdict =
  | {
      readonly verdict: 'accepted';
      readonly period: number;
      readonly multiplierRe: number;
      readonly multiplierIm: number;
      readonly multiplierMagnitude: number;
      readonly multiplierAngle: number;
      readonly kappa: number;
      readonly verifierRevision: typeof VERIFIER_REVISION;
    }
  | {
      readonly verdict: 'rejected';
      readonly reason: 'non-finite' | 'no-closure' | 'not-attracting';
      readonly verifierRevision: typeof VERIFIER_REVISION;
    }
  | {
      readonly verdict: 'unresolved';
      readonly reason: 'closure-ambiguous' | 'divisor-ambiguous';
      readonly verifierRevision: typeof VERIFIER_REVISION;
    };

/**
 * Canonical allocation-free verification of a proposed cycle of
 * `proposedPeriod` starting at (cycleStartRe, cycleStartIm) for the map
 * z^2 + c, writing the accepted attracting record into `out` (status 2 plus
 * the period, multiplier, angle, and kappa fields; iterations and evidence
 * are caller-owned provenance). On every non-accepted verdict `out` is left
 * untouched. Returns a VERIFIER_VERDICT code.
 *
 * Both production kernels call this function on every lag-scan proposal:
 * the scalar triggered kernel (src/domain/orbit-triggered.ts, behind
 * classifyInto) and the two-lane row kernel (src/render/triggered-rows.ts).
 * There is no inline copy of the policy.
 * tests/unit/domain/verifier-prefix.test.ts pins this body to a frozen
 * separate-walk reference, and verifier.test.ts replays classifyInto's
 * lag-scan acceptances through it.
 */
// The branch count is the policy itself: finite-value refusal, the three-way
// closure policy, proper-divisor reduction with its own three-way policy, and
// the attraction margin. Splitting it into helpers would allocate (several
// results per step) or spread the one policy over several bodies.
export const verifyCycleInto = (
  cRe: number,
  cIm: number,
  cycleStartRe: number,
  cycleStartIm: number,
  proposedPeriod: number,
  iterations: number,
  evidence: number,
  out: VerifierCycleTarget,
  // eslint-disable-next-line complexity -- branch count is the policy, see above
): VerifierVerdictCode => {
  if (!Number.isInteger(proposedPeriod) || proposedPeriod < 1) {
    return VERIFIER_VERDICT.rejectedNoClosure;
  }
  const scale = Math.max(1, Math.abs(cycleStartRe), Math.abs(cycleStartIm));
  const acceptSquared = TAU_CLOSURE_SCALED * TAU_CLOSURE_SCALED * scale * scale;
  const excludeSquared =
    VERIFIER_THRESHOLDS.tauExclude * VERIFIER_THRESHOLDS.tauExclude * scale * scale;

  // Forward walk over the proposed period, accumulating lambda = (f^p)'.
  // A non-finite state never returns to finite (NaN and Inf are absorbing
  // under this recurrence's arithmetic), so per-step or final checks give
  // identical verdicts; the canonical form bails per step.
  //
  // Primitive-period reduction rides on the same walk. The walk for a proper
  // divisor d of p is the first d steps of this walk (same start, same
  // recurrence, same operation order), so its residual and derivative are
  // read off at step d instead of re-walking from the start. The smallest
  // divisor whose residual lies below the exclusion bound decides: closing
  // below the acceptance bound reduces the candidate to it; inside the
  // (accept, exclude) gap primitivity is undecidable (three-way policy). The
  // decision is applied only after the full-period closure checks, in the
  // order of the policy above. (Prefix states are finite whenever the final
  // state is, so the divisor walks need no finiteness checks of their own.)
  let zRe = cycleStartRe;
  let zIm = cycleStartIm;
  let derivativeRe = 1;
  let derivativeIm = 0;
  let primitive = proposedPeriod;
  let primitiveDerivativeRe = 0;
  let primitiveDerivativeIm = 0;
  let divisorDecided = false;
  let divisorAmbiguous = false;
  for (let step = 1; step <= proposedPeriod; step += 1) {
    const nextDerivativeRe = derivativeRe * (2 * zRe) - derivativeIm * (2 * zIm);
    derivativeIm = derivativeRe * (2 * zIm) + derivativeIm * (2 * zRe);
    derivativeRe = nextDerivativeRe;

    const nextRe = zRe * zRe - zIm * zIm + cRe;
    zIm = 2 * zRe * zIm + cIm;
    zRe = nextRe;
    if (!Number.isFinite(zRe) || !Number.isFinite(zIm)) {
      return VERIFIER_VERDICT.rejectedNonFinite;
    }
    if (!divisorDecided && step < proposedPeriod) {
      const prefixRe = zRe - cycleStartRe;
      const prefixIm = zIm - cycleStartIm;
      const prefixSquared = prefixRe * prefixRe + prefixIm * prefixIm;
      if (prefixSquared < excludeSquared && proposedPeriod % step === 0) {
        divisorDecided = true;
        if (prefixSquared <= acceptSquared) {
          primitive = step;
          primitiveDerivativeRe = derivativeRe;
          primitiveDerivativeIm = derivativeIm;
        } else {
          divisorAmbiguous = true;
        }
      }
    }
  }
  if (!Number.isFinite(derivativeRe) || !Number.isFinite(derivativeIm)) {
    return VERIFIER_VERDICT.rejectedNonFinite;
  }

  const residualRe = zRe - cycleStartRe;
  const residualIm = zIm - cycleStartIm;
  const residualSquared = residualRe * residualRe + residualIm * residualIm;
  if (!Number.isFinite(residualSquared)) {
    return VERIFIER_VERDICT.rejectedNonFinite;
  }
  if (residualSquared > excludeSquared) {
    return VERIFIER_VERDICT.rejectedNoClosure;
  }
  if (residualSquared > acceptSquared) {
    return VERIFIER_VERDICT.unresolvedClosureAmbiguous;
  }
  if (divisorAmbiguous) {
    return VERIFIER_VERDICT.unresolvedDivisorAmbiguous;
  }
  if (primitive === proposedPeriod) {
    primitiveDerivativeRe = derivativeRe;
    primitiveDerivativeIm = derivativeIm;
  }

  // Attraction margin on the primitive multiplier: |lambda| must stay below
  // 1 - margin (plan section 3), not merely below 1.
  const multiplierMagnitude = Math.hypot(primitiveDerivativeRe, primitiveDerivativeIm);
  if (!Number.isFinite(multiplierMagnitude)) {
    return VERIFIER_VERDICT.rejectedNonFinite;
  }
  if (multiplierMagnitude >= 1 - VERIFIER_THRESHOLDS.attractMargin) {
    return VERIFIER_VERDICT.rejectedNotAttracting;
  }

  out.status = 2;
  out.iterations = iterations;
  out.evidence = evidence;
  out.period = primitive;
  out.multiplierRe = primitiveDerivativeRe;
  out.multiplierIm = primitiveDerivativeIm;
  out.multiplierMagnitude = multiplierMagnitude;
  // Superattracting identity: |lambda| = 0 means arg lambda = 0 (and kappa
  // = +Infinity, see stabilityExponentOf) by identity (plan section 3 semantic contract:
  // superattracting points compare by identity, never by arithmetic on
  // infinities).
  out.multiplierAngle =
    multiplierMagnitude === 0 ? 0 : Math.atan2(primitiveDerivativeIm, primitiveDerivativeRe);
  return VERIFIER_VERDICT.accepted;
};

/**
 * Rich boundary wrapper: verifies a proposed cycle and materializes the
 * verdict as an object. Allocates; hot paths use verifyCycleInto.
 */
export const verifyCycle = (
  cRe: number,
  cIm: number,
  cycleStartRe: number,
  cycleStartIm: number,
  proposedPeriod: number,
): VerifierVerdict => {
  const target: VerifierCycleTarget = {
    status: 0,
    iterations: 0,
    evidence: 0,
    period: 0,
    multiplierRe: 0,
    multiplierIm: 0,
    multiplierMagnitude: 0,
    multiplierAngle: 0,
  };
  const code = verifyCycleInto(cRe, cIm, cycleStartRe, cycleStartIm, proposedPeriod, 0, 0, target);
  if (code === VERIFIER_VERDICT.accepted) {
    return {
      verdict: 'accepted',
      period: target.period,
      multiplierRe: target.multiplierRe,
      multiplierIm: target.multiplierIm,
      multiplierMagnitude: target.multiplierMagnitude,
      multiplierAngle: target.multiplierAngle,
      kappa: stabilityExponentOf(target.multiplierMagnitude, target.period),
      verifierRevision: VERIFIER_REVISION,
    };
  }
  if (code === VERIFIER_VERDICT.unresolvedClosureAmbiguous) {
    return {
      verdict: 'unresolved',
      reason: 'closure-ambiguous',
      verifierRevision: VERIFIER_REVISION,
    };
  }
  if (code === VERIFIER_VERDICT.unresolvedDivisorAmbiguous) {
    return {
      verdict: 'unresolved',
      reason: 'divisor-ambiguous',
      verifierRevision: VERIFIER_REVISION,
    };
  }
  if (code === VERIFIER_VERDICT.rejectedNoClosure) {
    return { verdict: 'rejected', reason: 'no-closure', verifierRevision: VERIFIER_REVISION };
  }
  if (code === VERIFIER_VERDICT.rejectedNotAttracting) {
    return { verdict: 'rejected', reason: 'not-attracting', verifierRevision: VERIFIER_REVISION };
  }
  return { verdict: 'rejected', reason: 'non-finite', verifierRevision: VERIFIER_REVISION };
};
