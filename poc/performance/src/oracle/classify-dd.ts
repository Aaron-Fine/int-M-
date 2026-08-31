/**
 * Double-double oracle for the PoC differential harness.
 *
 * Iterates z^2 + c from z = 0 in dd precision, proposes cycle lags from a
 * scale-aware proximity scan, polishes the proposed cycle start with Newton's
 * method on F_p(z) = f_c^p(z) - z, then certifies closure, primitive period
 * (proper-divisor reduction), and attraction |lambda| < 1 in dd precision.
 *
 * The oracle is independent of src/: it shares no code with the production
 * classifier and deliberately lacks its analytic fast paths, so oracle
 * agreement is genuine cross-validation of the kernel results.
 *
 * Known limits (documented in poc/performance/README.md): near-parabolic
 * points whose convergence needs log(1e-26)/log|lambda| iterations beyond the
 * budget stay unresolved here, exactly like the binary64 kernels; the
 * differential run reports those as unadjudicated rather than false.
 */

import { ddAdd, ddAddD, ddDiv, ddMul, ddMulD, ddSqr, ddSub, ddToNumber } from './dd.ts';
import type { DD } from './dd.ts';

export interface DDOracleOptions {
  readonly maxIterations: number;
  readonly maxPeriod: number;
  readonly warmup: number;
  /** Loose proximity trigger for proposing a lag to the Newton polish. */
  readonly candidateTolerance: number;
  /** Tight scale-aware closure an accepted cycle must satisfy after polish. */
  readonly acceptanceTolerance: number;
  /** Separation bound above which a proper divisor is excluded from closure. */
  readonly exclusionTolerance: number;
  readonly newtonSteps: number;
  /**
   * Bounded candidate verifications per point. Genuinely attracting
   * candidates verify on their first proximity fire; the cap only bounds
   * adversarial repeats (repelling/preperiodic orbits refiring every step).
   */
  readonly candidateVerifyBudget: number;
}

export const DEFAULT_DD_ORACLE_OPTIONS: DDOracleOptions = Object.freeze({
  // 4096 x 96 dominates any PoC profile (Detailed is 1024/64). Provenance:
  // plan section 2 hard views need periods <= ~16; 96 leaves headroom.
  maxIterations: 4096,
  maxPeriod: 96,
  warmup: 16,
  // dd candidate trigger ~1e-14: loose enough to catch |lambda| <= 1 - 1e-4
  // cycles within budget, tight enough that the polish converges quickly.
  candidateTolerance: 1e-14,
  // ~2^-86: an eighth of dd's ~1e-32 headroom, so rounding cannot fake closure.
  acceptanceTolerance: 1e-26,
  // Six orders above acceptance: distinct periodic points near the corpus
  // strata are separated far more than this at unit scale.
  exclusionTolerance: 1e-20,
  newtonSteps: 8,
  candidateVerifyBudget: 64,
});

export interface DDCycleResult {
  readonly status: 'attracting-cycle';
  readonly period: number;
  readonly multiplierMagnitude: number;
  readonly multiplierAngle: number;
  readonly kappa: number;
}

export type DDClassification =
  | { readonly status: 'escaped'; readonly escapeIteration: number }
  | DDCycleResult
  | { readonly status: 'unresolved' };

interface DDPoint {
  re: DD;
  im: DD;
}

const ddLessThanD = (a: DD, threshold: number): boolean =>
  a.hi < threshold || (a.hi === threshold && a.lo < 0);

const finite = (point: DDPoint): boolean =>
  Number.isFinite(point.re.hi) &&
  Number.isFinite(point.re.lo) &&
  Number.isFinite(point.im.hi) &&
  Number.isFinite(point.im.lo);

/** One step of z <- z^2 + c in dd precision. */
const step = (z: DDPoint, cRe: number, cIm: number): DDPoint => ({
  re: ddAddD(ddSub(ddSqr(z.re), ddSqr(z.im)), cRe),
  im: ddAddD(ddMulD(ddMul(z.re, z.im), 2), cIm),
});

/** Advance z by `count` steps, tracking the cycle multiplier lambda = (f^count)'. */
const advanceWithMultiplier = (
  start: DDPoint,
  cRe: number,
  cIm: number,
  count: number,
): { z: DDPoint; lambdaRe: DD; lambdaIm: DD } => {
  let z = start;
  let lambdaRe: DD = { hi: 1, lo: 0 };
  let lambdaIm: DD = { hi: 0, lo: 0 };
  for (let index = 0; index < count; index += 1) {
    // d/dz f_c^p: lambda <- 2 z lambda before the state step.
    const nextLambdaRe = ddMulD(ddSub(ddMul(lambdaRe, z.re), ddMul(lambdaIm, z.im)), 2);
    const nextLambdaIm = ddMulD(ddAdd(ddMul(lambdaRe, z.im), ddMul(lambdaIm, z.re)), 2);
    lambdaRe = nextLambdaRe;
    lambdaIm = nextLambdaIm;
    z = step(z, cRe, cIm);
  }
  return { z, lambdaRe, lambdaIm };
};

/**
 * Primitive-period reduction and attraction test for an already-closed cycle
 * start. The smallest proper divisor that also closes is the primitive period;
 * a divisor residual inside the (accept, exclude) gap makes primitivity
 * undecidable and refuses the candidate (plan section 3 three-way policy).
 */
const certifiedCycle = (
  cycleStart: DDPoint,
  cRe: number,
  cIm: number,
  lambdaRe: DD,
  lambdaIm: DD,
  period: number,
  acceptSquared: number,
  excludeSquared: number,
): DDCycleResult | undefined => {
  // |lambda|^2 < 1 compared in dd, so superattracting |lambda| = 0 and weak
  // |lambda| = 1 - 1e-6 both pass; only genuine parabolicity refuses.
  const magnitudeSquared = ddAdd(ddSqr(lambdaRe), ddSqr(lambdaIm));
  if (!ddLessThanD(magnitudeSquared, 1)) {
    return undefined;
  }
  let primitive = period;
  for (let divisor = 1; divisor < period; divisor += 1) {
    if (period % divisor !== 0) {
      continue;
    }
    const walked = advanceWithMultiplier(cycleStart, cRe, cIm, divisor).z;
    if (!finite(walked)) {
      return undefined;
    }
    const divisorResidualSquared = ddAdd(
      ddSqr(ddSub(walked.re, cycleStart.re)),
      ddSqr(ddSub(walked.im, cycleStart.im)),
    );
    if (ddLessThanD(divisorResidualSquared, acceptSquared)) {
      primitive = divisor;
      break;
    }
    if (ddLessThanD(divisorResidualSquared, excludeSquared)) {
      // Inside the (accept, exclude) gap: primitivity undecidable.
      return undefined;
    }
  }
  const multiplierMagnitude = Math.sqrt(ddToNumber(magnitudeSquared));
  return {
    status: 'attracting-cycle',
    period: primitive,
    multiplierMagnitude,
    multiplierAngle:
      multiplierMagnitude === 0 ? 0 : Math.atan2(ddToNumber(lambdaIm), ddToNumber(lambdaRe)),
    // kappa = -log|lambda| / period; |lambda| = 0 gives +Infinity by identity
    // (plan section 3: superattracting points compare by identity, not by
    // arithmetic on infinities).
    kappa:
      multiplierMagnitude === 0
        ? Number.POSITIVE_INFINITY
        : -Math.log(multiplierMagnitude) / primitive,
  };
};

/**
 * Certify a proposed cycle: polish the start with Newton on F_p(z) = f^p(z) - z,
 * then check tight closure, primitive period, and attraction. Returns undefined
 * when the candidate cannot be certified; the caller keeps scanning and a
 * rejected candidate never classifies.
 */
const verifyPolishedCycle = (
  cRe: number,
  cIm: number,
  start: DDPoint,
  period: number,
  options: DDOracleOptions,
): DDCycleResult | undefined => {
  const scale = Math.max(1, Math.abs(start.re.hi), Math.abs(start.im.hi));
  const acceptSquared = options.acceptanceTolerance * options.acceptanceTolerance * scale * scale;
  const excludeSquared = options.exclusionTolerance * options.exclusionTolerance * scale * scale;

  let current = start;
  for (let polish = 0; polish <= options.newtonSteps; polish += 1) {
    const { z: end, lambdaRe, lambdaIm } = advanceWithMultiplier(current, cRe, cIm, period);
    if (!finite(end) || !Number.isFinite(lambdaRe.hi) || !Number.isFinite(lambdaIm.hi)) {
      return undefined;
    }
    const residualSquared = ddAdd(
      ddSqr(ddSub(end.re, current.re)),
      ddSqr(ddSub(end.im, current.im)),
    );
    if (ddLessThanD(residualSquared, acceptSquared)) {
      return certifiedCycle(
        current,
        cRe,
        cIm,
        lambdaRe,
        lambdaIm,
        period,
        acceptSquared,
        excludeSquared,
      );
    }
    // Newton step on F(z) = f^p(z) - z with derivative lambda - 1; the
    // denominator guard refuses conditioning beyond dd headroom.
    const denominator = ddSub(lambdaRe, { hi: 1, lo: 0 });
    if (Math.abs(denominator.hi) < 1e-24) {
      return undefined;
    }
    current = {
      re: ddSub(current.re, ddDiv(ddSub(end.re, current.re), denominator)),
      im: ddSub(current.im, ddDiv(ddSub(end.im, current.im), denominator)),
    };
    if (!finite(current)) {
      return undefined;
    }
  }
  return undefined;
};

export const classifyDD = (
  cRe: number,
  cIm: number,
  partialOptions: Partial<DDOracleOptions> = {},
): DDClassification => {
  const options: DDOracleOptions = { ...DEFAULT_DD_ORACLE_OPTIONS, ...partialOptions };
  const capacity = options.maxPeriod + 1;
  const candidateSquared = options.candidateTolerance * options.candidateTolerance;
  const historyRe = new Float64Array(capacity);
  const historyIm = new Float64Array(capacity);

  let z: DDPoint = { re: { hi: 0, lo: 0 }, im: { hi: 0, lo: 0 } };
  let verifications = 0;
  for (let iteration = 1; iteration <= options.maxIterations; iteration += 1) {
    z = step(z, cRe, cIm);
    if (z.re.hi * z.re.hi + z.im.hi * z.im.hi > 4) {
      return { status: 'escaped', escapeIteration: iteration };
    }

    const slot = (iteration - 1) % capacity;
    historyRe[slot] = z.re.hi;
    historyIm[slot] = z.im.hi;
    if (iteration <= options.warmup) {
      continue;
    }

    // Scale-aware proximity: the trigger grows with |z| so large-magnitude
    // transients do not dominate the threshold.
    const scale = Math.max(1, Math.abs(z.re.hi), Math.abs(z.im.hi));
    const candidateBoundSquared = candidateSquared * scale * scale;
    const largestPeriod = Math.min(options.maxPeriod, iteration - 1);
    for (let period = 1; period <= largestPeriod; period += 1) {
      if (verifications >= options.candidateVerifyBudget) {
        break;
      }
      const previous = (slot - period + capacity) % capacity;
      const deltaRe = z.re.hi - (historyRe[previous] ?? Number.NaN);
      const deltaIm = z.im.hi - (historyIm[previous] ?? Number.NaN);
      if (deltaRe * deltaRe + deltaIm * deltaIm > candidateBoundSquared) {
        continue;
      }
      verifications += 1;
      const cycle = verifyPolishedCycle(cRe, cIm, z, period, options);
      if (cycle !== undefined) {
        return cycle;
      }
      // A failed polish or ambiguous primitivity leaves the point to a later,
      // more converged iterate; the point then stays unresolved honestly.
    }
  }
  return { status: 'unresolved' };
};
