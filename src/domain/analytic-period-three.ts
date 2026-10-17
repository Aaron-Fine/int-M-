import { VERIFIER_THRESHOLDS } from './verifier';
import { ORBIT_EVIDENCE_CODE } from './types';

/**
 * Analytic period-3 fast path (workstream H, ADR 0010).
 *
 * For f_c(z) = z^2 + c the multipliers of the two period-3 cycles are the
 * roots of lambda^2 - 8(c + 2) lambda + 64 (c^3 + 2c^2 + c + 1), that is
 *
 *   lambda = 4(c + 2) +- 4i c sqrt(4c + 7).
 *
 * A quadratic polynomial has at most one attracting cycle, so the root of
 * smallest modulus decides. Each root is the multiplier of a 3-cycle (the
 * resultant identity, derived with sympy, not in Lean). A root with
 * |lambda| < 1 belongs to a cycle of exact period 3: an attracting Phi_3 root
 * is not a fixed point (Lean: period3_not_fixed_of_attracting in
 * proof/IntMProof/PeriodThreeMultiplier.lean). The derivation and the binary64
 * error budget are in docs/PERFORMANCE-MATHEMATICS.md section 11.
 *
 * Acceptance: |lambda_hat| + allowance < 1 - attractMargin, where the
 * allowance bounds the binary64 error of lambda_hat and of its modulus for
 * every finite c (section 11.4):
 *
 *   allowance = 2^-46 (|Re c + 2| + |Im c| + 1).
 *
 * Pure function of c: no orbit state, no iteration count. NaN or infinite
 * input is refused (every comparison with NaN is false). On refusal `out` is
 * untouched.
 */

/** 2^-46 = 128 u for binary64 (u = 2^-53), the allowance coefficient. */
export const PERIOD_THREE_ALLOWANCE_COEFFICIENT = 2 ** -46;

/**
 * Revision of this acceptance rule (closed form, allowance, margin). Nothing
 * keys a cache on it: bump SEMANTIC_ALGORITHM_VERSION
 * (src/render/semantic-store.ts) together with this constant.
 */
export const PERIOD_THREE_ANALYTIC_REVISION = 'src-analytic-p3-1.0.0';

/** Mutable record written on acceptance; structurally satisfied by OrbitSample. */
export interface PeriodThreeTarget {
  status: number;
  iterations: number;
  evidence: number;
  period: number;
  multiplierRe: number;
  multiplierIm: number;
  multiplierMagnitude: number;
  multiplierAngle: number;
}

export const classifyPeriodThreeInto = (
  cRe: number,
  cIm: number,
  out: PeriodThreeTarget,
): boolean => {
  // w = 4c + 7. 4 * cRe and 4 * cIm are exact; for cRe in [-3.5, -0.875]
  // (which contains the airplane box) 4 * cRe + 7 is exact as well (Sterbenz).
  const wRe = 4 * cRe + 7;
  const wIm = 4 * cIm;
  // s = sqrt(w), principal branch, in the stable form: the larger component
  // from the half-sum without cancellation, the other by division. Either
  // sign of s gives the same pair of roots, so the branch cut is harmless.
  const wMagnitude = Math.sqrt(wRe * wRe + wIm * wIm);
  let sRe: number;
  let sIm: number;
  if (wRe >= 0) {
    sRe = Math.sqrt(0.5 * (wMagnitude + wRe));
    sIm = sRe === 0 ? 0 : wIm / (2 * sRe);
  } else {
    const sImMagnitude = Math.sqrt(0.5 * (wMagnitude - wRe));
    sIm = wIm < 0 ? -sImMagnitude : sImMagnitude;
    sRe = (wIm < 0 ? -wIm : wIm) / (2 * sImMagnitude);
  }
  // t = 4i * c * s and a = 4(c + 2); the roots are a + t and a - t.
  const csRe = cRe * sRe - cIm * sIm;
  const csIm = cRe * sIm + cIm * sRe;
  const tRe = -4 * csIm;
  const tIm = 4 * csRe;
  const aRe = 4 * (cRe + 2);
  const aIm = 4 * cIm;
  const plusRe = aRe + tRe;
  const plusIm = aIm + tIm;
  const minusRe = aRe - tRe;
  const minusIm = aIm - tIm;
  const plusSquared = plusRe * plusRe + plusIm * plusIm;
  const minusSquared = minusRe * minusRe + minusIm * minusIm;
  const usePlus = plusSquared <= minusSquared;
  const multiplierRe = usePlus ? plusRe : minusRe;
  const multiplierIm = usePlus ? plusIm : minusIm;
  const multiplierMagnitude = Math.sqrt(usePlus ? plusSquared : minusSquared);
  const shiftedRe = cRe + 2;
  const allowance =
    PERIOD_THREE_ALLOWANCE_COEFFICIENT *
    ((shiftedRe < 0 ? -shiftedRe : shiftedRe) + (cIm < 0 ? -cIm : cIm) + 1);
  if (!(multiplierMagnitude + allowance < 1 - VERIFIER_THRESHOLDS.attractMargin)) {
    return false;
  }
  out.status = 2;
  out.iterations = 0;
  out.evidence = ORBIT_EVIDENCE_CODE.analyticPeriod3Component;
  out.period = 3;
  out.multiplierRe = multiplierRe;
  out.multiplierIm = multiplierIm;
  out.multiplierMagnitude = multiplierMagnitude;
  out.multiplierAngle = multiplierMagnitude === 0 ? 0 : Math.atan2(multiplierIm, multiplierRe);
  return true;
};
