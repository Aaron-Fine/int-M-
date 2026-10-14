/**
 * Common numerical verifier for the PoC harness (plan section 3).
 *
 * Every attracting result produced by any PoC kernel or schedule passes
 * through this single acceptance procedure: finite-value checks, scale-aware
 * closure, three-way proper-divisor reduction, and the attraction margin.
 * Candidate generation never classifies a pixel; only a verifier acceptance
 * does.
 *
 * The verifier returns one object per call; it is invoked a bounded handful
 * of times per pixel, unlike the per-iteration kernel loops, so the
 * allocation-free discipline of the kernels does not extend here.
 */

/**
 * Frozen verifier policy (plan section 3: thresholds are versioned policy).
 * Provenance:
 * - tauAccept: the legacy candidate tolerance, src/domain/orbit.ts
 *   DEFAULT_ORBIT_OPTIONS.cycleTolerance = 1e-10.
 * - closureRelaxation: the legacy forward-closure allowance of 100x linear
 *   error (orbit.ts closureToleranceSquared), applied to the acceptance bound.
 * - tauCandidate: the permissive proposal threshold for schedule kernels
 *   (plan section 3 requires tauCandidate > tauAccept). PoC policy choice.
 * - tauExclude: the divisor separation bound; distinct periodic points at
 *   unit scale in the corpus strata are separated far more than 1e-6.
 * - attractMargin: |lambda| must satisfy |lambda| <= 1 - margin. Tightens the
 *   legacy strict |lambda| < 1 to keep near-parabolic cycles unresolved
 *   rather than marginally accepted. PoC policy choice.
 */
export const VERIFIER_REVISION = 'poc-verifier-1.0.0';

export const VERIFIER_THRESHOLDS = Object.freeze({
  tauAccept: 1e-10,
  closureRelaxation: 100,
  tauCandidate: 1e-8,
  tauExclude: 1e-6,
  attractMargin: 1e-12,
});

/** Scaled acceptance closure bound: the legacy 100x forward-closure tolerance. */
export const TAU_CLOSURE_SCALED =
  VERIFIER_THRESHOLDS.tauAccept * VERIFIER_THRESHOLDS.closureRelaxation;

export type VerifierVerdict =
  | {
      readonly verdict: 'accepted';
      readonly period: number;
      readonly multiplierMagnitude: number;
      readonly multiplierAngle: number;
      readonly kappa: number;
      readonly residualScaled: number;
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

interface WalkResult {
  readonly endRe: number;
  readonly endIm: number;
  readonly lambdaRe: number;
  readonly lambdaIm: number;
  readonly finite: boolean;
}

/** Advance z by `count` steps from (startRe, startIm), accumulating lambda = (f^count)'. */
const walk = (
  cRe: number,
  cIm: number,
  startRe: number,
  startIm: number,
  count: number,
): WalkResult => {
  let zRe = startRe;
  let zIm = startIm;
  let derivativeRe = 1;
  let derivativeIm = 0;
  for (let index = 0; index < count; index += 1) {
    const nextDerivativeRe = derivativeRe * (2 * zRe) - derivativeIm * (2 * zIm);
    derivativeIm = derivativeRe * (2 * zIm) + derivativeIm * (2 * zRe);
    derivativeRe = nextDerivativeRe;

    const nextRe = zRe * zRe - zIm * zIm + cRe;
    zIm = 2 * zRe * zIm + cIm;
    zRe = nextRe;
    if (!Number.isFinite(zRe) || !Number.isFinite(zIm)) {
      return {
        endRe: zRe,
        endIm: zIm,
        lambdaRe: derivativeRe,
        lambdaIm: derivativeIm,
        finite: false,
      };
    }
  }
  return { endRe: zRe, endIm: zIm, lambdaRe: derivativeRe, lambdaIm: derivativeIm, finite: true };
};

const scaleOf = (re: number, im: number): number => Math.max(1, Math.abs(re), Math.abs(im));

/**
 * Verify a proposed cycle of `proposedPeriod` starting at (cycleStartRe,
 * cycleStartIm) for the map z^2 + c. Three-way divisor policy: closure below
 * the scaled acceptance bound reduces the primitive period; separation above
 * the larger exclusion bound keeps the candidate; the gap is ambiguous and
 * refuses classification (plan section 3).
 */
export const verifyCycle = (
  cRe: number,
  cIm: number,
  cycleStartRe: number,
  cycleStartIm: number,
  proposedPeriod: number,
): VerifierVerdict => {
  if (!Number.isInteger(proposedPeriod) || proposedPeriod < 1) {
    return { verdict: 'rejected', reason: 'no-closure', verifierRevision: VERIFIER_REVISION };
  }
  const scale = scaleOf(cycleStartRe, cycleStartIm);
  const acceptSquared = TAU_CLOSURE_SCALED * TAU_CLOSURE_SCALED * scale * scale;
  const excludeSquared =
    VERIFIER_THRESHOLDS.tauExclude * VERIFIER_THRESHOLDS.tauExclude * scale * scale;

  const proposed = walk(cRe, cIm, cycleStartRe, cycleStartIm, proposedPeriod);
  if (
    !proposed.finite ||
    !Number.isFinite(proposed.lambdaRe) ||
    !Number.isFinite(proposed.lambdaIm)
  ) {
    return { verdict: 'rejected', reason: 'non-finite', verifierRevision: VERIFIER_REVISION };
  }
  const residualRe = proposed.endRe - cycleStartRe;
  const residualIm = proposed.endIm - cycleStartIm;
  const residualSquared = residualRe * residualRe + residualIm * residualIm;
  if (!Number.isFinite(residualSquared)) {
    return { verdict: 'rejected', reason: 'non-finite', verifierRevision: VERIFIER_REVISION };
  }
  if (residualSquared > excludeSquared) {
    return { verdict: 'rejected', reason: 'no-closure', verifierRevision: VERIFIER_REVISION };
  }
  if (residualSquared > acceptSquared) {
    return {
      verdict: 'unresolved',
      reason: 'closure-ambiguous',
      verifierRevision: VERIFIER_REVISION,
    };
  }

  // Primitive-period reduction over proper divisors, ascending: the smallest
  // divisor that also closes is the primitive period.
  let primitive = proposedPeriod;
  for (let divisor = 1; divisor < proposedPeriod; divisor += 1) {
    if (proposedPeriod % divisor !== 0) {
      continue;
    }
    const walked = walk(cRe, cIm, cycleStartRe, cycleStartIm, divisor);
    if (!walked.finite) {
      return { verdict: 'rejected', reason: 'non-finite', verifierRevision: VERIFIER_REVISION };
    }
    const divisorResidualRe = walked.endRe - cycleStartRe;
    const divisorResidualIm = walked.endIm - cycleStartIm;
    const divisorResidualSquared =
      divisorResidualRe * divisorResidualRe + divisorResidualIm * divisorResidualIm;
    if (divisorResidualSquared <= acceptSquared) {
      primitive = divisor;
      break;
    }
    if (divisorResidualSquared < excludeSquared) {
      return {
        verdict: 'unresolved',
        reason: 'divisor-ambiguous',
        verifierRevision: VERIFIER_REVISION,
      };
    }
  }

  // Multiplier of the primitive cycle (phase-invariant), with the attraction
  // margin: |lambda| must not approach 1.
  const primitiveWalk = walk(cRe, cIm, cycleStartRe, cycleStartIm, primitive);
  const lambdaSquared = primitiveWalk.lambdaRe ** 2 + primitiveWalk.lambdaIm ** 2;
  const lambdaMagnitude = Math.sqrt(lambdaSquared);
  if (!Number.isFinite(lambdaMagnitude)) {
    return { verdict: 'rejected', reason: 'non-finite', verifierRevision: VERIFIER_REVISION };
  }
  const attractBound = 1 - VERIFIER_THRESHOLDS.attractMargin;
  if (lambdaMagnitude >= attractBound) {
    return { verdict: 'rejected', reason: 'not-attracting', verifierRevision: VERIFIER_REVISION };
  }
  const primitiveResidualRe = primitiveWalk.endRe - cycleStartRe;
  const primitiveResidualIm = primitiveWalk.endIm - cycleStartIm;
  return {
    verdict: 'accepted',
    period: primitive,
    multiplierMagnitude: lambdaMagnitude,
    multiplierAngle:
      lambdaMagnitude === 0 ? 0 : Math.atan2(primitiveWalk.lambdaIm, primitiveWalk.lambdaRe),
    // kappa = -log|lambda| / period; |lambda| = 0 gives +Infinity by identity
    // (plan section 3: superattracting points compare by identity, not by
    // arithmetic on infinities).
    kappa:
      lambdaMagnitude === 0 ? Number.POSITIVE_INFINITY : -Math.log(lambdaMagnitude) / primitive,
    residualScaled:
      Math.sqrt(
        primitiveResidualRe * primitiveResidualRe + primitiveResidualIm * primitiveResidualIm,
      ) / scale,
    verifierRevision: VERIFIER_REVISION,
  };
};
