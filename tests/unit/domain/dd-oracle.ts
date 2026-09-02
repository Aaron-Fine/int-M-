import { STRATA } from './legacy-differential';

/**
 * Minimal double-double oracle shared by the PR 3 and PR 4 adjudication
 * suites (tests may cross no poc/ boundary and tsconfig.app cannot import
 * the poc/ oracle, so the dd arithmetic here is copied verbatim from
 * poc/performance/src/oracle/dd.ts — Dekker two-product / Knuth two-sum —
 * and the certification policy mirrors poc/performance/src/oracle/
 * classify-dd.ts with one deliberate improvement: the Newton polish divides
 * by the complex lambda - 1, quadratically convergent, so 8 polish steps
 * reach the acceptance bound everywhere on the stratified grid).
 *
 * The oracle deliberately lacks the analytic fast paths (like its poc
 * counterpart), so oracle agreement on cardioid/bulb points is genuine
 * cross-validation of the closed forms.
 *
 * Superattracting points compare by identity (plan section 3): a production
 * |lambda| = 0 requires the oracle multiplier to be numerically zero as
 * well; kappa is never compared arithmetically.
 */

export const DD_ORACLE_OPTIONS = Object.freeze({
  // Dominates every adjudication profile (detailed is 1024 x 64).
  maxIterations: 4096,
  maxPeriod: 96,
  warmup: 16,
  // Loose proximity trigger for proposing a lag to the polish.
  candidateTolerance: 1e-14,
  // ~2^-86: an eighth of dd's ~1e-32 headroom, so rounding cannot fake
  // closure (poc oracle provenance).
  acceptanceTolerance: 1e-26,
  // Six orders above acceptance (poc oracle provenance).
  exclusionTolerance: 1e-20,
  newtonSteps: 8,
  candidateVerifyBudget: 64,
} as const);

interface DD {
  readonly hi: number;
  readonly lo: number;
}

/** |lo| <= ulp(hi)/2 for the result of a + b, exact rounding of the sum. */
const twoSum = (a: number, b: number): DD => {
  const sum = a + b;
  const offset = sum - a;
  return { hi: sum, lo: a - (sum - offset) + (b - offset) };
};

/** Exact when |a| >= |b|; used where the relative sizes are known. */
const quickTwoSum = (a: number, b: number): DD => {
  const sum = a + b;
  return { hi: sum, lo: b - (sum - a) };
};

/** Dekker splitting constant: 2^27 + 1. */
const SPLITTER = 134217729;

/** Splits x into hi + lo with hi holding the leading 27 mantissa bits. */
const split = (x: number): DD => {
  const t = SPLITTER * x;
  const hi = t - (t - x);
  return { hi, lo: x - hi };
};

/** Dekker two-product: p = a*b rounded, lo = exact error of the rounding. */
const twoProd = (a: number, b: number): DD => {
  const product = a * b;
  const aSplit = split(a);
  const bSplit = split(b);
  const lo =
    aSplit.hi * bSplit.hi -
    product +
    aSplit.hi * bSplit.lo +
    aSplit.lo * bSplit.hi +
    aSplit.lo * bSplit.lo;
  return { hi: product, lo };
};

const ddAdd = (a: DD, b: DD): DD => {
  const sum = twoSum(a.hi, b.hi);
  return quickTwoSum(sum.hi, sum.lo + a.lo + b.lo);
};

/** Adding an exact binary64 value keeps the pair renormalized. */
const ddAddD = (a: DD, b: number): DD => {
  const sum = twoSum(a.hi, b);
  return quickTwoSum(sum.hi, sum.lo + a.lo);
};

const ddSub = (a: DD, b: DD): DD => ddAdd(a, { hi: -b.hi, lo: -b.lo });

const ddMul = (a: DD, b: DD): DD => {
  const product = twoProd(a.hi, b.hi);
  const error = product.lo + (a.hi * b.lo + a.lo * b.hi) + a.lo * b.lo;
  return twoSum(product.hi, error);
};

/** Multiplying by an exact binary64 value; twoSum keeps the pair renormalized. */
const ddMulD = (a: DD, b: number): DD => {
  const product = twoProd(a.hi, b);
  return twoSum(product.hi, product.lo + a.lo * b);
};

const ddSqr = (a: DD): DD => ddMul(a, a);

/** Three-term quotient, sufficient for the oracle Newton polish. */
const ddDiv = (a: DD, b: DD): DD => {
  const q1 = a.hi / b.hi;
  const rem1 = ddSub(a, ddMulD(b, q1));
  const q2 = rem1.hi / b.hi;
  const rem2 = ddSub(rem1, ddMulD(b, q2));
  const q3 = rem2.hi / b.hi;
  return ddAddD(quickTwoSum(q1, q2), q3);
};

const ddToNumber = (a: DD): number => a.hi + a.lo;

export interface DDPoint {
  re: DD;
  im: DD;
}

export interface DDOracleCycle {
  readonly primitive: number;
  readonly magnitude: number;
  readonly angle: number;
}

export type DDOracleVerdict =
  | { readonly status: 'escaped'; readonly escapeIteration: number }
  | { readonly status: 'attracting-cycle'; readonly cycle: DDOracleCycle }
  | { readonly status: 'unresolved' };

const ddStep = (z: DDPoint, cRe: number, cIm: number): DDPoint => ({
  re: ddAddD(ddSub(ddSqr(z.re), ddSqr(z.im)), cRe),
  im: ddAddD(ddMulD(ddMul(z.re, z.im), 2), cIm),
});

const ddAdvanceWithMultiplier = (
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
    z = ddStep(z, cRe, cIm);
  }
  return { z, lambdaRe, lambdaIm };
};

const ddFinite = (point: DDPoint): boolean =>
  Number.isFinite(point.re.hi) &&
  Number.isFinite(point.re.lo) &&
  Number.isFinite(point.im.hi) &&
  Number.isFinite(point.im.lo);

/**
 * Certify an already-polished cycle start: attraction |lambda| < 1 in dd,
 * then the three-way proper-divisor policy (poc oracle certifiedCycle).
 * Returns the primitive period with the multiplier recomputed at the
 * primitive walk (the poc oracle reports the proposed-lag multiplier here;
 * this oracle computes the multiplier of the primitive it certifies).
 */
const ddCertifiedCycle = (
  cycleStart: DDPoint,
  cRe: number,
  cIm: number,
  proposedPeriod: number,
  acceptSquared: DD,
  excludeSquared: DD,
): DDOracleCycle | undefined => {
  let primitive = proposedPeriod;
  for (let divisor = 1; divisor < proposedPeriod; divisor += 1) {
    if (proposedPeriod % divisor !== 0) {
      continue;
    }
    const walked = ddAdvanceWithMultiplier(cycleStart, cRe, cIm, divisor).z;
    if (!ddFinite(walked)) {
      return undefined;
    }
    const residualSquared = ddAdd(
      ddSqr(ddSub(walked.re, cycleStart.re)),
      ddSqr(ddSub(walked.im, cycleStart.im)),
    );
    if (residualSquared.hi < acceptSquared.hi) {
      primitive = divisor;
      break;
    }
    if (residualSquared.hi < excludeSquared.hi) {
      // Inside the (accept, exclude) gap: primitivity undecidable.
      return undefined;
    }
  }

  // Multiplier of the primitive cycle, phase-invariant.
  const primitiveWalk = ddAdvanceWithMultiplier(cycleStart, cRe, cIm, primitive);
  const magnitudeSquared = ddAdd(ddSqr(primitiveWalk.lambdaRe), ddSqr(primitiveWalk.lambdaIm));
  if (!ddLessThanOne(magnitudeSquared)) {
    return undefined;
  }
  const magnitude = Math.sqrt(ddToNumber(magnitudeSquared));
  return {
    primitive,
    magnitude,
    angle:
      magnitude === 0
        ? 0
        : Math.atan2(ddToNumber(primitiveWalk.lambdaIm), ddToNumber(primitiveWalk.lambdaRe)),
  };
};

const ddLessThanOne = (a: DD): boolean => a.hi < 1 || (a.hi === 1 && a.lo < 0);

/**
 * Polish the proposed cycle start with Newton's method on
 * F_p(z) = f_c^p(z) - z (complex derivative lambda - 1), then certify.
 */
export const ddVerifyCycle = (
  cRe: number,
  cIm: number,
  start: DDPoint,
  proposedPeriod: number,
): DDOracleCycle | undefined => {
  const scale = Math.max(1, Math.abs(start.re.hi), Math.abs(start.im.hi));
  const acceptSquared = {
    hi:
      DD_ORACLE_OPTIONS.acceptanceTolerance * DD_ORACLE_OPTIONS.acceptanceTolerance * scale * scale,
    lo: 0,
  };
  const excludeSquared = {
    hi: DD_ORACLE_OPTIONS.exclusionTolerance * DD_ORACLE_OPTIONS.exclusionTolerance * scale * scale,
    lo: 0,
  };
  let current = start;
  for (let polish = 0; polish <= DD_ORACLE_OPTIONS.newtonSteps; polish += 1) {
    const {
      z: end,
      lambdaRe,
      lambdaIm,
    } = ddAdvanceWithMultiplier(current, cRe, cIm, proposedPeriod);
    if (!ddFinite(end) || !Number.isFinite(lambdaRe.hi) || !Number.isFinite(lambdaIm.hi)) {
      return undefined;
    }
    const residualSquared = ddAdd(
      ddSqr(ddSub(end.re, current.re)),
      ddSqr(ddSub(end.im, current.im)),
    );
    if (residualSquared.hi < acceptSquared.hi) {
      return ddCertifiedCycle(current, cRe, cIm, proposedPeriod, acceptSquared, excludeSquared);
    }
    const denominatorRe = ddSub(lambdaRe, { hi: 1, lo: 0 });
    if (ddAdd(ddSqr(denominatorRe), ddSqr(lambdaIm)).hi < 1e-48) {
      return undefined;
    }
    const quotient = ddComplexDiv(
      ddSub(end.re, current.re),
      ddSub(end.im, current.im),
      denominatorRe,
      lambdaIm,
    );
    current = {
      re: ddSub(current.re, quotient.re),
      im: ddSub(current.im, quotient.im),
    };
    if (!ddFinite(current)) {
      return undefined;
    }
  }
  return undefined;
};

const ddComplexDiv = (aRe: DD, aIm: DD, bRe: DD, bIm: DD): { readonly re: DD; readonly im: DD } => {
  const denominator = ddAdd(ddSqr(bRe), ddSqr(bIm));
  return {
    re: ddDiv(ddAdd(ddMul(aRe, bRe), ddMul(aIm, bIm)), denominator),
    im: ddDiv(ddSub(ddMul(aIm, bRe), ddMul(aRe, bIm)), denominator),
  };
};

/**
 * The minimal dd oracle: proximity scan over the dd orbit (scale-aware,
 * binary64 hi parts like the poc oracle), candidates verified by the
 * polished dd certification above. No analytic fast paths: cardioid and
 * bulb points are certified from the orbit itself.
 */
export const classifyDDMinimal = (cRe: number, cIm: number): DDOracleVerdict => {
  const options = DD_ORACLE_OPTIONS;
  const capacity = options.maxPeriod + 1;
  const historyRe = new Float64Array(capacity);
  const historyIm = new Float64Array(capacity);

  let z: DDPoint = { re: { hi: 0, lo: 0 }, im: { hi: 0, lo: 0 } };
  let verifications = 0;
  for (let iteration = 1; iteration <= options.maxIterations; iteration += 1) {
    z = ddStep(z, cRe, cIm);
    if (z.re.hi * z.re.hi + z.im.hi * z.im.hi > 4) {
      return { status: 'escaped', escapeIteration: iteration };
    }

    const slot = (iteration - 1) % capacity;
    historyRe[slot] = z.re.hi;
    historyIm[slot] = z.im.hi;
    if (iteration <= options.warmup) {
      continue;
    }

    // Scale-aware proximity (poc oracle convention).
    const scale = Math.max(1, Math.abs(z.re.hi), Math.abs(z.im.hi));
    const candidateBoundSquared =
      options.candidateTolerance * options.candidateTolerance * scale * scale;
    const largestPeriod = Math.min(options.maxPeriod, iteration - 1);
    for (let period = 1; period <= largestPeriod; period += 1) {
      if (verifications >= options.candidateVerifyBudget) {
        return { status: 'unresolved' };
      }
      const previous = (slot - period + capacity) % capacity;
      const deltaRe = z.re.hi - (historyRe[previous] ?? Number.NaN);
      const deltaIm = z.im.hi - (historyIm[previous] ?? Number.NaN);
      if (deltaRe * deltaRe + deltaIm * deltaIm > candidateBoundSquared) {
        continue;
      }
      verifications += 1;
      const cycle = ddVerifyCycle(cRe, cIm, z, period);
      if (cycle !== undefined) {
        return { status: 'attracting-cycle', cycle };
      }
      // A failed polish or ambiguous primitivity leaves the point to a
      // later, more converged iterate; unresolved stays honest.
    }
  }
  return { status: 'unresolved' };
};

// ---------------------------------------------------------------------------
// Memoized verdicts for the shared stratified differential grid.
// ---------------------------------------------------------------------------

const strataVerdicts: (DDOracleVerdict | undefined)[] = [];

/**
 * Oracle verdict for the index-th point of STRATA
 * (tests/unit/domain/legacy-differential.ts), computed once per process and
 * reused by every adjudication suite.
 */
export const strataOracleVerdict = (index: number, total: number): DDOracleVerdict => {
  const cached = strataVerdicts[index];
  if (cached !== undefined) {
    return cached;
  }
  if (index >= total) {
    throw new Error(`no oracle point at index ${String(index)}`);
  }
  const point = STRATA[index];
  if (point === undefined) {
    throw new Error('empty grid slot');
  }
  const verdict = classifyDDMinimal(point.re, point.im);
  strataVerdicts[index] = verdict;
  return verdict;
};
