/**
 * Frozen reference for the verifier's primitive-period reduction: the
 * src-verifier-1.0.0 body as it stood before the divisor walks were read off
 * the forward walk (each proper divisor re-walked from the cycle start).
 * Test-only; verifier-prefix.test.ts pins the production body to it bit for
 * bit, verdict code included.
 */
import {
  TAU_CLOSURE_SCALED,
  VERIFIER_THRESHOLDS,
  VERIFIER_VERDICT,
  type VerifierCycleTarget,
  type VerifierVerdictCode,
} from '../../../src/domain/verifier';

export const referenceVerifyCycleInto = (
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
  let zRe = cycleStartRe;
  let zIm = cycleStartIm;
  let derivativeRe = 1;
  let derivativeIm = 0;
  for (let index = 0; index < proposedPeriod; index += 1) {
    const nextDerivativeRe = derivativeRe * (2 * zRe) - derivativeIm * (2 * zIm);
    derivativeIm = derivativeRe * (2 * zIm) + derivativeIm * (2 * zRe);
    derivativeRe = nextDerivativeRe;

    const nextRe = zRe * zRe - zIm * zIm + cRe;
    zIm = 2 * zRe * zIm + cIm;
    zRe = nextRe;
    if (!Number.isFinite(zRe) || !Number.isFinite(zIm)) {
      return VERIFIER_VERDICT.rejectedNonFinite;
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

  // Primitive-period reduction over proper divisors, ascending: the smallest
  // divisor that also closes is the primitive period. A divisor residual
  // inside the (accept, exclude) gap makes primitivity undecidable and the
  // candidate is refused (three-way policy).
  let primitive = proposedPeriod;
  let primitiveDerivativeRe = derivativeRe;
  let primitiveDerivativeIm = derivativeIm;
  for (let divisor = 1; divisor < proposedPeriod; divisor += 1) {
    if (proposedPeriod % divisor !== 0) {
      continue;
    }
    let walkRe = cycleStartRe;
    let walkIm = cycleStartIm;
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
        return VERIFIER_VERDICT.rejectedNonFinite;
      }
    }
    const divisorResidualRe = walkRe - cycleStartRe;
    const divisorResidualIm = walkIm - cycleStartIm;
    const divisorResidualSquared =
      divisorResidualRe * divisorResidualRe + divisorResidualIm * divisorResidualIm;
    if (!Number.isFinite(divisorResidualSquared)) {
      return VERIFIER_VERDICT.rejectedNonFinite;
    }
    if (divisorResidualSquared <= acceptSquared) {
      primitive = divisor;
      primitiveDerivativeRe = walkDerivativeRe;
      primitiveDerivativeIm = walkDerivativeIm;
      break;
    }
    if (divisorResidualSquared < excludeSquared) {
      return VERIFIER_VERDICT.unresolvedDivisorAmbiguous;
    }
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
  // Superattracting identity: |lambda| = 0 means arg lambda = 0 and
  // kappa = +Infinity by identity (plan section 3 semantic contract:
  // superattracting points compare by identity, never by arithmetic on
  // infinities).
  out.multiplierAngle =
    multiplierMagnitude === 0 ? 0 : Math.atan2(primitiveDerivativeIm, primitiveDerivativeRe);
  out.stabilityExponent =
    multiplierMagnitude === 0
      ? Number.POSITIVE_INFINITY
      : -Math.log(multiplierMagnitude) / primitive;
  return VERIFIER_VERDICT.accepted;
};
