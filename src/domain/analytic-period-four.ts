import type { PeriodThreeTarget } from './analytic-period-three';
import { ORBIT_EVIDENCE_CODE } from './types';
import { VERIFIER_THRESHOLDS } from './verifier';

/**
 * Analytic period-4 fast path (workstream H, ADR 0013).
 *
 * For f_c(z) = z^2 + c the products mu = z1 z2 z3 z4 over the three period-4
 * cycles are the roots of the monic cubic
 *
 *   M(mu) = mu^3 + a2 mu^2 + a1 mu + a0,
 *   a2 = c^2 - 3,  a1 = 3 - c^2 (c^2 + c - 1),
 *   a0 = -(c^2 (c^2 (c^2 + 3c + 3) + 3c + 2) + 1) = -G4(c),
 *
 * and each cycle's multiplier is lambda = 16 mu (Lean: period4_product_root,
 * period4_seedDerivative in proof/IntMProof/PeriodFourMultiplier.lean). A
 * root with |lambda| < 1 belongs to a cycle of exact period 4 (Lean:
 * period4_minimalPeriod_of_attracting): a root of the period-4 dynatomic
 * factor that returns in one or two steps has four-step multiplier exactly 1
 * (Lean: period4_not_period_two_of_attracting).
 *
 * The candidate root comes from Cardano's formula and two Newton steps per
 * root; it uses Math.cbrt, Math.atan2, Math.cos and Math.sin, which are not
 * correctly rounded, and that is harmless: acceptance never trusts the
 * candidate. It rests on an a-posteriori Rouché certificate evaluated with
 * +, -, *, / and Math.sqrt only (docs/PERFORMANCE-MATHEMATICS.md section 12):
 *
 *   F >= |M(mu~)|, D <= |M'(mu~)|, K >= |M''(mu~)| / 2, h = F / D,
 *   certified iff h (8K + 16h) < D,
 *
 * which proves that exactly one root of the exact cubic at the binary64
 * parameter c lies within 2h (1 + 2^-40) of mu~. Acceptance:
 *
 *   16 |mu~| + 64 h + 2^-50 < 1 - attractMargin.
 *
 * Near the cusps of the three primitive components the cubic has a double
 * root at lambda = 1 and D vanishes: the certificate fails and the pixel
 * falls through to the orbit path. The answer is never wrong; it is only
 * less often fast.
 *
 * Pure function of c: no orbit state, no iteration count. |c| > 4, NaN and
 * infinite input are refused before any work (every test is written so that
 * NaN fails it). On refusal `out` is untouched. The optional `certificate`
 * receives the candidate and the bounds on every call that reaches the
 * certificate (tests and the adjudication tool); the kernels never pass it,
 * and the function is large on purpose, so that V8 never inlines it into a
 * kernel (ADR 0010, Consequences).
 */

/** Mutable record written on acceptance; structurally satisfied by OrbitSample. */
export type PeriodFourTarget = PeriodThreeTarget;

/** The candidate root and the bounds of its Rouché certificate (section 12). */
export interface PeriodFourCertificate {
  /** Candidate cycle product mu~ = lambda~ / 16. */
  productRe: number;
  productIm: number;
  /** F: an upper bound on |M(mu~)| for the exact coefficients at c. */
  residualBound: number;
  /** D: a lower bound on |M'(mu~)| (may be <= 0: no certificate). */
  derivativeBound: number;
  /** K: an upper bound on |M''(mu~)| / 2 = |3 mu~ + a2|. */
  curvatureBound: number;
  /** h = F / D. */
  radiusRatio: number;
  /** A = 64 h + 2^-50: the multiplier allowance used at acceptance. */
  allowance: number;
  /** The Rouché condition h (8K + 16h) < D holds. */
  certified: boolean;
}

/**
 * E = 2^-47 = 64 u: bounds the relative Horner error (1 + kappa)^11 - 1 of
 * M and M' (kappa = sqrt(2) gamma_2 per complex operation, at most 11 on any
 * monomial), with a factor of two to spare for the rounding of the bounds.
 */
export const PERIOD_FOUR_EVALUATION_BOUND = 2 ** -47;

/**
 * Revision of this acceptance rule (cubic, certificate, allowance, margin).
 * Nothing keys a cache on it: bump SEMANTIC_ALGORITHM_VERSION
 * (src/render/semantic-store.ts) together with this constant.
 */
export const PERIOD_FOUR_ANALYTIC_REVISION = 'src-analytic-p4-1.0.0';

/** Deflation of the computed |M'(mu~)| before its error is subtracted. */
const DERIVATIVE_DEFLATION = 1 - 2 ** -40;
/** Covers the rounding of 16 |mu~| and of the final sum (section 12.4). */
const MODULUS_TAIL = 2 ** -50;
/** sin(2 pi / 3); a candidate rotation only, never part of the certificate. */
const SQRT3_HALF = 0.8660254037844386;
const NEWTON_STEPS = 2;

export const classifyPeriodFourInto = (
  cRe: number,
  cIm: number,
  out: PeriodFourTarget,
  certificate?: PeriodFourCertificate,
): boolean => {
  // |c| (rounded), reused by the certificate. Every period-4 component lies
  // in |c| < 2.2; refusing |c| > 4 keeps every intermediate far from
  // overflow and refuses NaN and infinite input (section 12.6).
  const r = Math.sqrt(cRe * cRe + cIm * cIm);
  if (!(r <= 4)) {
    return false;
  }
  // Coefficients of the monic cubic in mu (exact c, binary64 arithmetic).
  const c2Re = cRe * cRe - cIm * cIm;
  const c2Im = 2 * cRe * cIm;
  const a2Re = c2Re - 3;
  const a2Im = c2Im;
  const sRe = c2Re + cRe - 1;
  const sIm = c2Im + cIm;
  const a1Re = 3 - (c2Re * sRe - c2Im * sIm);
  const a1Im = -(c2Re * sIm + c2Im * sRe);
  const gRe = c2Re + 3 * cRe + 3;
  const gIm = c2Im + 3 * cIm;
  const hRe = c2Re * gRe - c2Im * gIm + 3 * cRe + 2;
  const hIm = c2Re * gIm + c2Im * gRe + 3 * cIm;
  const a0Re = -(c2Re * hRe - c2Im * hIm + 1);
  const a0Im = -(c2Re * hIm + c2Im * hRe);

  // Candidate: Cardano on the depressed cubic y^3 + p y + q (mu = y - a2/3).
  const sqRe = a2Re * a2Re - a2Im * a2Im;
  const sqIm = 2 * a2Re * a2Im;
  const pThirdRe = (a1Re - sqRe / 3) / 3;
  const pThirdIm = (a1Im - sqIm / 3) / 3;
  const cuRe = sqRe * a2Re - sqIm * a2Im;
  const cuIm = sqRe * a2Im + sqIm * a2Re;
  const halfQRe = -((2 * cuRe) / 27 - (a2Re * a1Re - a2Im * a1Im) / 3 + a0Re) / 2;
  const halfQIm = -((2 * cuIm) / 27 - (a2Re * a1Im + a2Im * a1Re) / 3 + a0Im) / 2;
  const pSqRe = pThirdRe * pThirdRe - pThirdIm * pThirdIm;
  const pSqIm = 2 * pThirdRe * pThirdIm;
  const discRe = halfQRe * halfQRe - halfQIm * halfQIm + (pSqRe * pThirdRe - pSqIm * pThirdIm);
  const discIm = 2 * halfQRe * halfQIm + (pSqRe * pThirdIm + pSqIm * pThirdRe);
  const discMagnitude = Math.sqrt(discRe * discRe + discIm * discIm);
  const rootRe = Math.sqrt(0.5 * (discMagnitude + discRe));
  const rootImMagnitude = Math.sqrt(0.5 * Math.max(0, discMagnitude - discRe));
  const rootIm = discIm < 0 ? -rootImMagnitude : rootImMagnitude;
  let uRe = halfQRe + rootRe;
  let uIm = halfQIm + rootIm;
  const vRe = halfQRe - rootRe;
  const vIm = halfQIm - rootIm;
  if (vRe * vRe + vIm * vIm > uRe * uRe + uIm * uIm) {
    uRe = vRe;
    uIm = vIm;
  }
  const cubeRadius = Math.cbrt(Math.sqrt(uRe * uRe + uIm * uIm));
  const cubeAngle = Math.atan2(uIm, uRe) / 3;
  const cubeRe = cubeRadius * Math.cos(cubeAngle);
  const cubeIm = cubeRadius * Math.sin(cubeAngle);

  let bestRe = Number.NaN;
  let bestIm = Number.NaN;
  let bestSquared = Number.POSITIVE_INFINITY;
  for (let k = 0; k < 3; k += 1) {
    const rotRe = k === 0 ? 1 : -0.5;
    const rotIm = k === 0 ? 0 : k === 1 ? SQRT3_HALF : -SQRT3_HALF;
    const xRe = cubeRe * rotRe - cubeIm * rotIm;
    const xIm = cubeRe * rotIm + cubeIm * rotRe;
    const xSquared = xRe * xRe + xIm * xIm;
    let mRe = xRe - a2Re / 3;
    let mIm = xIm - a2Im / 3;
    if (xSquared > 0) {
      // y = x - (p/3) / x
      mRe -= (pThirdRe * xRe + pThirdIm * xIm) / xSquared;
      mIm -= (pThirdIm * xRe - pThirdRe * xIm) / xSquared;
    }
    for (let step = 0; step < NEWTON_STEPS; step += 1) {
      const t1Re = mRe + a2Re;
      const t1Im = mIm + a2Im;
      const t2Re = t1Re * mRe - t1Im * mIm + a1Re;
      const t2Im = t1Re * mIm + t1Im * mRe + a1Im;
      const fRe = t2Re * mRe - t2Im * mIm + a0Re;
      const fIm = t2Re * mIm + t2Im * mRe + a0Im;
      const d1Re = 3 * mRe + 2 * a2Re;
      const d1Im = 3 * mIm + 2 * a2Im;
      const fpRe = d1Re * mRe - d1Im * mIm + a1Re;
      const fpIm = d1Re * mIm + d1Im * mRe + a1Im;
      const fpSquared = fpRe * fpRe + fpIm * fpIm;
      if (!(fpSquared > 0)) {
        break;
      }
      mRe -= (fRe * fpRe + fIm * fpIm) / fpSquared;
      mIm -= (fIm * fpRe - fRe * fpIm) / fpSquared;
    }
    const mSquared = mRe * mRe + mIm * mIm;
    if (mSquared < bestSquared) {
      bestSquared = mSquared;
      bestRe = mRe;
      bestIm = mIm;
    }
  }

  // Certificate at mu~ = best (section 12.3): only +, -, *, / and sqrt.
  const t1Re = bestRe + a2Re;
  const t1Im = bestIm + a2Im;
  const t2Re = t1Re * bestRe - t1Im * bestIm + a1Re;
  const t2Im = t1Re * bestIm + t1Im * bestRe + a1Im;
  const residualRe = t2Re * bestRe - t2Im * bestIm + a0Re;
  const residualIm = t2Re * bestIm + t2Im * bestRe + a0Im;
  const d1Re = 3 * bestRe + 2 * a2Re;
  const d1Im = 3 * bestIm + 2 * a2Im;
  const slopeRe = d1Re * bestRe - d1Im * bestIm + a1Re;
  const slopeIm = d1Re * bestIm + d1Im * bestRe + a1Im;
  // Upper bounds on the absolute-value polynomials of section 12.5.
  const r2 = r * r;
  const b2 = r2 + 3;
  const b1 = r2 * (r2 + r + 1) + 3;
  const b0 = r2 * (r2 * (r2 + 3 * r + 3) + 3 * r + 2) + 1;
  const rho = Math.sqrt(bestSquared);
  const residualScale = ((rho + b2) * rho + b1) * rho + b0;
  const slopeScale = (3 * rho + 2 * b2) * rho + b1;
  const residualBound =
    Math.sqrt(residualRe * residualRe + residualIm * residualIm) +
    PERIOD_FOUR_EVALUATION_BOUND * residualScale;
  const derivativeBound =
    Math.sqrt(slopeRe * slopeRe + slopeIm * slopeIm) * DERIVATIVE_DEFLATION -
    2 * (PERIOD_FOUR_EVALUATION_BOUND * slopeScale);
  const curvatureBound = 3 * rho + b2;
  const radiusRatio = residualBound / derivativeBound;
  const certified =
    derivativeBound > 0 && radiusRatio * (8 * curvatureBound + 16 * radiusRatio) < derivativeBound;
  const allowance = 64 * radiusRatio + MODULUS_TAIL;
  const multiplierMagnitude = 16 * rho;
  if (certificate !== undefined) {
    certificate.productRe = bestRe;
    certificate.productIm = bestIm;
    certificate.residualBound = residualBound;
    certificate.derivativeBound = derivativeBound;
    certificate.curvatureBound = curvatureBound;
    certificate.radiusRatio = radiusRatio;
    certificate.allowance = allowance;
    certificate.certified = certified;
  }
  if (!(certified && multiplierMagnitude + allowance < 1 - VERIFIER_THRESHOLDS.attractMargin)) {
    return false;
  }
  const multiplierRe = 16 * bestRe;
  const multiplierIm = 16 * bestIm;
  out.status = 2;
  out.iterations = 0;
  out.evidence = ORBIT_EVIDENCE_CODE.analyticPeriod4Component;
  out.period = 4;
  out.multiplierRe = multiplierRe;
  out.multiplierIm = multiplierIm;
  out.multiplierMagnitude = multiplierMagnitude;
  out.multiplierAngle = multiplierMagnitude === 0 ? 0 : Math.atan2(multiplierIm, multiplierRe);
  return true;
};
