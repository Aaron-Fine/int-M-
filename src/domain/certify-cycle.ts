/**
 * Certified early acceptance: the certification core (candidate `early-accept`).
 *
 * Specializes proof/IntMProof/CertifiedAcceptance.lean,
 * `existsUnique_primitive_of_reference_accepted_disk`, to an EXACT parameter
 * (cRef = c, Delta = 0) and a binary64 seed z0 (the current orbit point). For a
 * candidate period p and disk radius r, with
 *
 *   e_0 = r,   e_{j+1} = 2 |z_j| e_j + e_j^2,   R_j = |z_j| + e_j,
 *   q = prod_{j<p} 2 R_j,
 *
 * where z_j = f^j(z0): if
 *
 *   (1) q < 1,
 *   (2) the closure window |f^p(z0) - z0| <= r (1 - q), and
 *   (3) for every proper divisor d of p: e_d + r < |f^d(z0) - z0|,
 *
 * then the closed disk |z - z0| <= r contains a unique fixed point of f^p, its
 * minimal period is exactly p, and its multiplier satisfies |lambda| <= q. The
 * orbit of z0 under f^p stays in the disk (self-map, contraction), so the orbit
 * the classifier is walking converges to that cycle.
 *
 * ---------------------------------------------------------------------------
 * BINARY64 ERROR ALLOWANCE (HEURISTIC, NOT A PROVED BINARY64 BOUND)
 * ---------------------------------------------------------------------------
 * The theorem is about exact reals; this file evaluates it in binary64. The
 * measurement (evidence/phase-2/early-accept-measurement) saw closure margins
 * as small as 3e-19 (squared), so the allowance must be explicit and small.
 * Every computed UPPER bound (e_j, R_j, q, the closure residual) is inflated
 * and every computed LOWER bound (the divisor distances, the closure limit
 * r (1 - q)) is deflated by the relative factor (1 +- K EPS) with
 *
 *   EPS = 2^-52,   K = 8 (p + 2).
 *
 * Operation count behind K: each step of the e_j / R_j / q recurrences is at
 * most 6 flops (two multiplies, an add, a hypot, a multiply into the running
 * product, ...) and each flop contributes at most one relative rounding of
 * 2^-53 = EPS / 2, so p steps accumulate at most ~3 p EPS / 2 < 2 p EPS of
 * relative error in a recurrence value; the +2 covers the final compare and
 * the product/sum bookkeeping; the factor 8 is a safety multiplier of about 2-4.
 * In addition the forward orbit itself is computed in binary64: an absolute
 * rounding bound delta_j on |computed z_j - exact f^j(z0)| is propagated,
 *
 *   delta_0 = 0,
 *   delta_{j+1} = (2 |zhat_j| + delta_j) delta_j + GAMMA (|zhat_j|^2 + |c|),
 *   GAMMA = 8 * 2^-53   (4-5 roundings per component, times sqrt 2, rounded up),
 *
 * and folded into every bound: |z_j| <= |zhat_j| + delta_j in the e / R
 * recurrences, rho = |f^p(z0) - z0| <= |zhat_p - z0| + delta_p, and the divisor
 * distance >= |zhat_d - z0| - delta_d. The per-step constant GAMMA is a
 * conservative reading of the textbook complex multiply/add error, not a
 * machine-checked one. Both parts together are an allowance, not a proof; a
 * proved binary64 refinement is future work (Lean doc: "Binary64 frames are
 * covered only through a residual-tracking discrepancy eta that must be proved
 * separately").
 *
 * Two policy conditions are added ON TOP of the theorem so a certified pixel
 * cannot disagree with the production verifier's frozen policy (they only make
 * certification stricter):
 *   - q < 1 - Q_MARGIN (the production attraction margin is 1 - 1e-12);
 *   - every proper divisor is separated by at least DIVISOR_FLOOR_FACTOR times
 *     the production exclusion bound tauExclude * scale, beyond e_d + r, so the
 *     production divisor reduction could not have fired on or near this cycle.
 */
import { TAU_CLOSURE_SCALED, VERIFIER_THRESHOLDS } from './verifier';

const EPS = 2 ** -52;
const GAMMA = 8 * 2 ** -53;
/** q must stay below 1 - Q_MARGIN (production attractMargin is 1e-12). */
export const Q_MARGIN = 1e-9;
/** Divisor separation floor, as a multiple of tauExclude * scale. */
export const DIVISOR_FLOOR_FACTOR = 2;
/** Radii above this are never attempted (nothing useful is certified there). */
export const MAX_RADIUS = 0.05;

/** Reason codes of a failed certification (0 = certified). */
export const CERT_REASON = Object.freeze({
  certified: 0,
  nonFinite: 1,
  radiusTooLarge: 2,
  multiplierBoundNotBelowOne: 3,
  closureWindow: 4,
  divisorSeparation: 5,
  refinementFailed: 6,
  multiplierVariation: 7,
});

/** Preallocated work arrays for walks / tables of period <= capacity - 1. */
export class CertifyWorkspace {
  public zRe: Float64Array;
  public zIm: Float64Array;
  public delta: Float64Array;
  public e: Float64Array;
  /** Period of the last walkOrbit (valid entries 0..period). */
  public walkedPeriod = 0;

  public constructor(maxPeriod: number) {
    const size = Math.max(2, Math.ceil(maxPeriod) + 2);
    this.zRe = new Float64Array(size);
    this.zIm = new Float64Array(size);
    this.delta = new Float64Array(size);
    this.e = new Float64Array(size);
  }

  public ensureCapacity(maxPeriod: number): void {
    const required = Math.ceil(maxPeriod) + 2;
    if (this.zRe.length >= required) return;
    this.zRe = new Float64Array(required);
    this.zIm = new Float64Array(required);
    this.delta = new Float64Array(required);
    this.e = new Float64Array(required);
  }
}

/** Everything the certificate exposes; filled by certifyWalked / refine. */
export interface CertificateRecord {
  reason: number;
  cRe: number;
  cIm: number;
  z0Re: number;
  z0Im: number;
  period: number;
  radius: number;
  /** Certified multiplier bound q (inflated upper bound). */
  q: number;
  /** Closure residual upper bound |f^p(z0) - z0| (inflated, includes rounding). */
  residual: number;
  /** Deflated closure limit r (1 - q); residual <= closureLimit when certified. */
  closureLimit: number;
  /** Number of proper divisors recorded below. */
  divisorCount: number;
  divisorPeriod: Int32Array;
  /** Deflated lower bound on |f^d(z0) - z0|. */
  divisorDistance: Float64Array;
  /** Inflated e_d + r. */
  divisorSeparation: Float64Array;
  /** Divisor slack: distance - separation (must exceed the policy floor). */
  divisorMargin: Float64Array;
  /** Reported multiplier (refined cycle point), filled by refineMultiplier. */
  multiplierRe: number;
  multiplierIm: number;
  /** A-posteriori bound on the multiplier variation (see refineMultiplier). */
  multiplierVariation: number;
  /** Refined cycle point. */
  cycleRe: number;
  cycleIm: number;
}

export const createCertificateRecord = (maxPeriod: number): CertificateRecord => {
  const size = Math.max(2, Math.ceil(maxPeriod) + 2);
  return {
    reason: 0,
    cRe: 0,
    cIm: 0,
    z0Re: 0,
    z0Im: 0,
    period: 0,
    radius: 0,
    q: 0,
    residual: 0,
    closureLimit: 0,
    divisorCount: 0,
    divisorPeriod: new Int32Array(size),
    divisorDistance: new Float64Array(size),
    divisorSeparation: new Float64Array(size),
    divisorMargin: new Float64Array(size),
    multiplierRe: 0,
    multiplierIm: 0,
    multiplierVariation: 0,
    cycleRe: 0,
    cycleIm: 0,
  };
};

/**
 * Forward-walks p steps from z0 in binary64, filling ws.zRe/zIm (indices
 * 0..p) and the rounding bounds ws.delta (index 0..p). Returns false when any
 * value is non-finite.
 */
export const walkOrbit = (
  ws: CertifyWorkspace,
  cRe: number,
  cIm: number,
  z0Re: number,
  z0Im: number,
  period: number,
): boolean => {
  const zRe = ws.zRe;
  const zIm = ws.zIm;
  const delta = ws.delta;
  const cMag = Math.hypot(cRe, cIm);
  let re = z0Re;
  let im = z0Im;
  let d = 0;
  zRe[0] = re;
  zIm[0] = im;
  delta[0] = 0;
  for (let j = 0; j < period; j += 1) {
    const mag = Math.hypot(re, im) * (1 + 2 * EPS);
    d = (2 * mag + d) * d + GAMMA * (mag * mag + cMag);
    const nextRe = re * re - im * im + cRe;
    im = 2 * re * im + cIm;
    re = nextRe;
    zRe[j + 1] = re;
    zIm[j + 1] = im;
    delta[j + 1] = d;
  }
  ws.walkedPeriod = period;
  return Number.isFinite(re) && Number.isFinite(im) && Number.isFinite(d);
};

/** Inflated closure residual bound |f^p(z0) - z0| of the last walk. */
export const walkedResidual = (ws: CertifyWorkspace, period: number): number => {
  const k = 8 * (period + 2) * EPS;
  const zRe = ws.zRe;
  const zIm = ws.zIm;
  const distance = Math.hypot(
    (zRe[period] ?? 0) - (zRe[0] ?? 0),
    (zIm[period] ?? 0) - (zIm[0] ?? 0),
  );
  return (distance + (ws.delta[period] ?? 0)) * (1 + k);
};

/**
 * prod_{j<p} 2 |zhat_j| of the last walk: the radius-independent lower bound
 * of q (R_j >= |z_j| for every r >= 0). Computed values only; used to REJECT
 * (safe in either direction) and to size the radius.
 */
export const walkedMultiplierEstimate = (ws: CertifyWorkspace, period: number): number => {
  let product = 1;
  for (let j = 0; j < period; j += 1) {
    product *= 2 * Math.hypot(ws.zRe[j] ?? 0, ws.zIm[j] ?? 0);
  }
  return product;
};

/**
 * Evaluates conditions (1)-(3) (+ the two policy conditions) for radius r on
 * the orbit already stored in ws by walkOrbit. Fills rec (q, residual,
 * divisors, reason) and returns rec.reason (0 = certified).
 */
export const certifyWalked = (
  ws: CertifyWorkspace,
  period: number,
  radius: number,
  rec: CertificateRecord,
  // eslint-disable-next-line complexity -- the theorem conditions (1)-(3) plus the two policy conditions, evaluated in one pass
): number => {
  const k = 8 * (period + 2) * EPS;
  const inflate = 1 + k;
  const deflate = 1 - k;
  const zRe = ws.zRe;
  const zIm = ws.zIm;
  const delta = ws.delta;
  const e = ws.e;
  rec.period = period;
  rec.radius = radius;
  rec.divisorCount = 0;
  if (!(radius > 0) || !Number.isFinite(radius)) {
    rec.reason = CERT_REASON.nonFinite;
    return rec.reason;
  }
  if (radius > MAX_RADIUS) {
    rec.reason = CERT_REASON.radiusTooLarge;
    return rec.reason;
  }
  // Error / radius tables: e_j upper bounds, R_j, running q.
  e[0] = radius;
  let q = 1;
  for (let j = 0; j < period; j += 1) {
    const ej = e[j] ?? 0;
    const zUpper = Math.hypot(zRe[j] ?? 0, zIm[j] ?? 0) * inflate + (delta[j] ?? 0);
    e[j + 1] = (2 * zUpper * ej + ej * ej) * inflate;
    q *= 2 * (zUpper + ej) * inflate;
  }
  q *= inflate;
  rec.q = q;
  if (!Number.isFinite(q) || !Number.isFinite(e[period] ?? Number.NaN)) {
    rec.reason = CERT_REASON.nonFinite;
    return rec.reason;
  }
  if (!(q < 1 - Q_MARGIN)) {
    rec.reason = CERT_REASON.multiplierBoundNotBelowOne;
    return rec.reason;
  }
  const residual = walkedResidual(ws, period);
  const closureLimit = radius * (1 - q) * deflate;
  rec.residual = residual;
  rec.closureLimit = closureLimit;
  if (!(residual <= closureLimit)) {
    rec.reason = CERT_REASON.closureWindow;
    return rec.reason;
  }
  const scale = Math.max(1, Math.abs(zRe[0] ?? 0), Math.abs(zIm[0] ?? 0));
  const floor = DIVISOR_FLOOR_FACTOR * VERIFIER_THRESHOLDS.tauExclude * scale;
  let divisors = 0;
  for (let d = 1; d < period; d += 1) {
    if (period % d !== 0) continue;
    const distance =
      (Math.hypot((zRe[d] ?? 0) - (zRe[0] ?? 0), (zIm[d] ?? 0) - (zIm[0] ?? 0)) - (delta[d] ?? 0)) *
      deflate;
    const separation = ((e[d] ?? 0) + radius) * inflate;
    const margin = distance - separation;
    rec.divisorPeriod[divisors] = d;
    rec.divisorDistance[divisors] = distance;
    rec.divisorSeparation[divisors] = separation;
    rec.divisorMargin[divisors] = margin;
    divisors += 1;
    rec.divisorCount = divisors;
    if (!(separation < distance) || !(margin >= floor)) {
      rec.reason = CERT_REASON.divisorSeparation;
      return rec.reason;
    }
  }
  rec.reason = CERT_REASON.certified;
  return rec.reason;
};

/** certifyCycle(c, z0, p, r): walk + certify at an explicit radius. */
export const certifyCycle = (
  ws: CertifyWorkspace,
  rec: CertificateRecord,
  cRe: number,
  cIm: number,
  z0Re: number,
  z0Im: number,
  period: number,
  radius: number,
): number => {
  rec.cRe = cRe;
  rec.cIm = cIm;
  rec.z0Re = z0Re;
  rec.z0Im = z0Im;
  if (!walkOrbit(ws, cRe, cIm, z0Re, z0Im, period)) {
    rec.period = period;
    rec.radius = radius;
    rec.reason = CERT_REASON.nonFinite;
    return rec.reason;
  }
  return certifyWalked(ws, period, radius, rec);
};

// ---------------------------------------------------------------------------
// Multiplier reporting (decided BEFORE the first parity run)
// ---------------------------------------------------------------------------
// The reported multiplier is lambda = prod_{j<p} 2 w_j evaluated at a Newton-
// refined cycle point w (Newton on g(z) = f^p(z) - z, derivative D - 1 with
// D = prod 2 z_j), not at z0 (whose offset to the cycle can be as large as r).
// The production lag scan reports the same product at ITS detection point,
// which sits within delta_b = TAU_CLOSURE_SCALED * scale / (1 - q) of the
// cycle point (closure acceptance bound 1e-8 * scale, and |g(z)| >= (1-q)|z -
// zeta| on the certified disk). So |lambda_ours - lambda_production| is
// bounded by the variation of the multiplier over a disk of radius
// D0 = delta_b + (our refinement error): with a_j = 2 w_j, b_j = 2 w'_j for two
// points in that disk (each within e'_j of the orbit point z_j, tables as above
// seeded with e'_0 = D0),
//
//   |prod a_j - prod b_j| <= sum_j (prod_{i<j} 2R'_i)(4 e'_j)(prod_{i>j} 2R'_i)
//                          = 2 Q' sum_j e'_j / R'_j  =: V,   Q' = prod 2 R'_j.
//
// A pixel is certified only when V <= MULTIPLIER_VARIATION_MAX and
// V <= MULTIPLIER_VARIATION_RELATIVE * |lambda_ours|. Those two numbers are
// the declared parity tolerances' source (tools/benchmark/candidates/
// early-accept.ts): magnitude tolerance = 2 * MULTIPLIER_VARIATION_MAX, and the
// direction (cos/sin) deviation is <= ~V / |lambda| <= RELATIVE * (1+tiny).
// Heuristics stated plainly: the production detection point may sit at a
// different CYCLE PHASE than ours (the multiplier is phase-invariant but the
// table above is for our phase), and the error allowance inherits the
// heuristic status described at the top of this file.
export const MULTIPLIER_VARIATION_MAX = 1e-4;
export const MULTIPLIER_VARIATION_RELATIVE = 5e-4;
const NEWTON_MAX_STEPS = 12;
const NEWTON_STEP_FLOOR = 2 ** -50;

/**
 * Newton-refines the cycle point inside the certified disk and fills
 * rec.multiplier*, rec.cycle*, rec.multiplierVariation. Returns rec.reason
 * (still 0 on success; refinementFailed / multiplierVariation otherwise).
 * Overwrites ws (the certification tables are no longer needed).
 */
export const refineMultiplier = (
  ws: CertifyWorkspace,
  rec: CertificateRecord,
  cRe: number,
  cIm: number,
  // eslint-disable-next-line complexity -- Newton loop plus the variation-bound tables in one pass over the workspace
): number => {
  const period = rec.period;
  const radius = rec.radius;
  const q = rec.q;
  let wRe = rec.z0Re;
  let wIm = rec.z0Im;
  let derRe = 1;
  let derIm = 0;
  let residualMagnitude = 0;
  let converged = false;
  for (let iteration = 0; iteration < NEWTON_MAX_STEPS; iteration += 1) {
    if (!walkOrbit(ws, cRe, cIm, wRe, wIm, period)) break;
    derRe = 1;
    derIm = 0;
    for (let j = 0; j < period; j += 1) {
      const aRe = 2 * (ws.zRe[j] ?? 0);
      const aIm = 2 * (ws.zIm[j] ?? 0);
      const nextRe = derRe * aRe - derIm * aIm;
      derIm = derRe * aIm + derIm * aRe;
      derRe = nextRe;
    }
    const gRe = (ws.zRe[period] ?? 0) - wRe;
    const gIm = (ws.zIm[period] ?? 0) - wIm;
    residualMagnitude = Math.hypot(gRe, gIm) + (ws.delta[period] ?? 0);
    const denRe = derRe - 1;
    const denIm = derIm;
    const denSquared = denRe * denRe + denIm * denIm;
    if (!(denSquared > 0) || !Number.isFinite(denSquared)) break;
    const stepRe = (gRe * denRe + gIm * denIm) / denSquared;
    const stepIm = (gIm * denRe - gRe * denIm) / denSquared;
    const stepMagnitude = Math.hypot(stepRe, stepIm);
    const scale = Math.max(1, Math.abs(wRe), Math.abs(wIm));
    // Converged when the step is at the binary64 noise floor of g (its
    // rounding bound delta_p divided by the derivative magnitude).
    const noise = (4 * (ws.delta[period] ?? 0)) / Math.sqrt(denSquared);
    if (stepMagnitude <= Math.max(NEWTON_STEP_FLOOR * scale, noise)) {
      converged = true;
      break;
    }
    wRe -= stepRe;
    wIm -= stepIm;
    if (Math.hypot(wRe - rec.z0Re, wIm - rec.z0Im) > radius) break;
  }
  if (!converged) {
    rec.reason = CERT_REASON.refinementFailed;
    return rec.reason;
  }
  rec.cycleRe = wRe;
  rec.cycleIm = wIm;
  rec.multiplierRe = derRe;
  rec.multiplierIm = derIm;
  const lambda = Math.hypot(derRe, derIm);

  // Variation bound V over the disk of radius D0 around w (tables from the
  // last walk, which was taken at w).
  const k = 8 * (period + 2) * EPS;
  const inflate = 1 + k;
  const scaleW = Math.max(1, Math.abs(wRe), Math.abs(wIm)) + radius;
  const productionOffset = (TAU_CLOSURE_SCALED * scaleW) / (1 - q);
  const refinementError = (residualMagnitude * inflate) / (1 - q);
  const d0 = (productionOffset + refinementError) * inflate;
  const e = ws.e;
  e[0] = d0;
  let qPrime = 1;
  let ratioSum = 0;
  for (let j = 0; j < period; j += 1) {
    const ej = e[j] ?? 0;
    const zUpper = Math.hypot(ws.zRe[j] ?? 0, ws.zIm[j] ?? 0) * inflate + (ws.delta[j] ?? 0);
    const rUpper = (zUpper + ej) * inflate;
    e[j + 1] = (2 * zUpper * ej + ej * ej) * inflate;
    qPrime *= 2 * rUpper;
    ratioSum += ej / rUpper;
  }
  const variation = 2 * qPrime * ratioSum * inflate;
  rec.multiplierVariation = variation;
  if (
    !Number.isFinite(variation) ||
    !(variation <= MULTIPLIER_VARIATION_MAX) ||
    !(variation <= MULTIPLIER_VARIATION_RELATIVE * lambda)
  ) {
    rec.reason = CERT_REASON.multiplierVariation;
    return rec.reason;
  }
  return rec.reason;
};

/** Convenience for tests / tools: JSON-serializable view of a certificate. */
export const certificateToJson = (rec: CertificateRecord): Record<string, unknown> => {
  const divisors: Record<string, number>[] = [];
  for (let i = 0; i < rec.divisorCount; i += 1) {
    divisors.push({
      d: rec.divisorPeriod[i] ?? 0,
      distanceLower: rec.divisorDistance[i] ?? 0,
      separation: rec.divisorSeparation[i] ?? 0,
      margin: rec.divisorMargin[i] ?? 0,
    });
  }
  return {
    c: [rec.cRe, rec.cIm],
    z0: [rec.z0Re, rec.z0Im],
    period: rec.period,
    radius: rec.radius,
    q: rec.q,
    residual: rec.residual,
    closureLimit: rec.closureLimit,
    closureSlack: rec.closureLimit - rec.residual,
    divisors,
    cycle: [rec.cycleRe, rec.cycleIm],
    multiplier: [rec.multiplierRe, rec.multiplierIm],
    multiplierVariation: rec.multiplierVariation,
  };
};
