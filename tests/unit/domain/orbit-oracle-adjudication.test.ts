import { describe, expect, it } from 'vitest';

import {
  classifyInto,
  createOrbitSample,
  materializeOrbitResult,
  resolveOrbitOptions,
  OrbitScratch,
  VERIFIER_REVISION,
  type OrbitOptions,
  type OrbitResult,
} from '../../../src/domain';
import { legacyClassifyOrbit, STRATA } from './legacy-differential';

/**
 * Oracle adjudication of every legacy-versus-verifier disagreement (PR 3 M3,
 * plan section 3 semantic compatibility contract: "Categorical status and
 * primitive period are judged against independent high-precision fixtures
 * and deterministic stratified holdouts. A changed legacy answer may ship
 * only when the oracle supports the change. False attracting results and
 * wrong primitive periods are release blockers; numerically ambiguous cases
 * remain unresolved").
 *
 * The grid is the deterministic stratified differential grid (10 strata,
 * 3225 points, tests/unit/domain/legacy-differential.ts) under three
 * profiles. The baseline is the verbatim legacy port; the adjudicator is a
 * minimal double-double oracle replicated in this file because tsconfig.app
 * (extensionless imports) cannot import the poc/ oracle — the dd arithmetic
 * below is copied verbatim from poc/performance/src/oracle/dd.ts (Dekker
 * two-product / Knuth two-sum), and the certification policy mirrors
 * poc/performance/src/oracle/classify-dd.ts with one deliberate
 * improvement: the Newton polish divides by the complex lambda - 1 (the poc
 * oracle divides by its real part only, which converges just linearly for
 * cycles with Im(lambda) != 0; the complex step is quadratically
 * convergent, so 8 polish steps reach the acceptance bound everywhere on
 * this grid).
 *
 * The oracle deliberately lacks the analytic fast paths (like its poc
 * counterpart), so oracle agreement on cardioid/bulb points is genuine
 * cross-validation of the closed forms.
 *
 * Superattracting points compare by identity (plan section 3): a production
 * |lambda| = 0 requires the oracle multiplier to be numerically zero as
 * well; kappa is never compared arithmetically.
 */

// ---------------------------------------------------------------------------
// Double-double arithmetic (verbatim from poc/performance/src/oracle/dd.ts).
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Minimal dd oracle (policy of poc/performance/src/oracle/classify-dd.ts,
// complex-Newton polish).
// ---------------------------------------------------------------------------

const DD_ORACLE_OPTIONS = Object.freeze({
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

interface DDPoint {
  re: DD;
  im: DD;
}

interface DDOracleCycle {
  readonly primitive: number;
  readonly magnitude: number;
  readonly angle: number;
}

type DDOracleVerdict =
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
const ddVerifyCycle = (
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
const classifyDDMinimal = (cRe: number, cIm: number): DDOracleVerdict => {
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
// Adjudication over the differential grid.
// ---------------------------------------------------------------------------

const PROFILES: readonly { readonly label: string; readonly options: Partial<OrbitOptions> }[] = [
  { label: 'quick', options: { maxIterations: 256, maxPeriod: 16 } },
  { label: 'balanced', options: {} },
  { label: 'detailed', options: { maxIterations: 1024, maxPeriod: 64 } },
];

interface Adjudication {
  changed: number;
  periodReductions: string[];
  falseAttracting: number;
  wrongPrimitivePeriod: number;
  unsupported: string[];
  unresolvedDelta: number;
}

describe('dd-oracle adjudication of every legacy-versus-verifier disagreement', () => {
  const oracleByIndex = new Map<number, DDOracleVerdict>();
  for (let index = 0; index < STRATA.length; index += 1) {
    const point = STRATA[index];
    if (point === undefined) {
      throw new Error('empty grid slot');
    }
    oracleByIndex.set(index, classifyDDMinimal(point.re, point.im));
  }

  for (const profile of PROFILES) {
    // eslint-disable-next-line complexity -- the branch count is the adjudication decision table itself; see the plan section 3 rules it implements
    it(`supports every changed legacy answer and certifies every attracting claim (${profile.label})`, () => {
      const options = resolveOrbitOptions(profile.options);
      const scratch = new OrbitScratch(64);
      const sample = createOrbitSample();
      const classifyProduction = (point: {
        readonly re: number;
        readonly im: number;
      }): OrbitResult => {
        classifyInto(point.re, point.im, options, scratch, sample);
        return materializeOrbitResult(sample);
      };

      const adjudication: Adjudication = {
        changed: 0,
        periodReductions: [],
        falseAttracting: 0,
        wrongPrimitivePeriod: 0,
        unsupported: [],
        unresolvedDelta: 0,
      };

      for (let index = 0; index < STRATA.length; index += 1) {
        const point = STRATA[index];
        if (point === undefined) {
          throw new Error('empty grid slot');
        }
        const production = classifyProduction(point);
        const legacy = legacyClassifyOrbit(point, options);
        const oracle = oracleByIndex.get(index);
        if (oracle === undefined) {
          throw new Error(`missing oracle adjudication for grid point ${index}`);
        }

        if (production.status === 'unresolved') {
          adjudication.unresolvedDelta += 1;
        }
        if (legacy.status === 'unresolved') {
          adjudication.unresolvedDelta -= 1;
        }

        // Zero false attracting (release blocker): production claims
        // attracting where the oracle proves escape.
        if (production.status === 'attracting-cycle' && oracle.status === 'escaped') {
          adjudication.falseAttracting += 1;
        }
        // Zero wrong primitive periods (release blocker).
        if (
          production.status === 'attracting-cycle' &&
          oracle.status === 'attracting-cycle' &&
          production.period !== oracle.cycle.primitive
        ) {
          adjudication.wrongPrimitivePeriod += 1;
        }

        if (
          production.status === legacy.status &&
          (production.status !== 'attracting-cycle' ||
            legacy.status !== 'attracting-cycle' ||
            (production.period === legacy.period &&
              production.multiplierMagnitude === legacy.multiplierMagnitude))
        ) {
          continue;
        }

        // A legacy-versus-verifier disagreement: it may ship only when the
        // oracle supports the change (plan section 3).
        adjudication.changed += 1;

        if (
          production.status === 'attracting-cycle' &&
          legacy.status === 'attracting-cycle' &&
          production.period < legacy.period &&
          legacy.period % production.period === 0
        ) {
          // The documented legacy flaw: a non-primitive multiple reported
          // by the legacy scan. Supported iff the oracle certifies the same
          // primitive period.
          adjudication.periodReductions.push(`${index}:${legacy.period}->${production.period}`);
          if (
            oracle.status !== 'attracting-cycle' ||
            oracle.cycle.primitive !== production.period
          ) {
            adjudication.unsupported.push(
              `${index}: reduction ${legacy.period}->${production.period} not oracle-supported (oracle ${oracle.status})`,
            );
          }
          continue;
        }

        adjudication.unsupported.push(
          `${index}: unsupported change shape ${legacy.status}->${production.status} (periods ${legacy.status === 'attracting-cycle' ? String(legacy.period) : '-'}->${production.status === 'attracting-cycle' ? String(production.period) : '-'})`,
        );
      }

      // Unresolved-rate delta vs legacy, quantified: zero on this grid
      // (every disagreement is a period reduction, no status flips).
      expect(adjudication.unresolvedDelta).toBe(0);
      expect(adjudication.falseAttracting).toBe(0);
      expect(adjudication.wrongPrimitivePeriod).toBe(0);
      expect(adjudication.unsupported).toEqual([]);
      // Pin the disagreement shape and size per profile: every changed
      // legacy answer on this grid is a primitive-period reduction (the
      // documented flaw the verifier's three-way divisor policy fixes).
      const expectedReductions: Record<string, number> = { quick: 6, balanced: 13, detailed: 17 };
      expect(adjudication.periodReductions.length).toBe(expectedReductions[profile.label]);
      expect(adjudication.periodReductions.length).toBe(adjudication.changed);
    });
  }

  it('certifies every production attracting claim or leaves it honestly unadjudicated', () => {
    const options = resolveOrbitOptions({});
    const scratch = new OrbitScratch(64);
    const sample = createOrbitSample();
    let certified = 0;
    let unadjudicatedAttracting = 0;
    let missedDetections = 0;
    for (let index = 0; index < STRATA.length; index += 1) {
      const point = STRATA[index];
      const oracle = oracleByIndex.get(index);
      if (point === undefined || oracle === undefined) {
        throw new Error('empty grid slot');
      }
      classifyInto(point.re, point.im, options, scratch, sample);
      const production = materializeOrbitResult(sample);

      if (production.status === 'attracting-cycle') {
        if (oracle.status !== 'attracting-cycle') {
          // The oracle's budget cannot reach this cycle (near-parabolic
          // attraction or analytic fast paths it deliberately lacks):
          // unadjudicated, never false.
          unadjudicatedAttracting += 1;
          continue;
        }
        certified += 1;
        expect(production.period).toBe(oracle.cycle.primitive);
        if (production.multiplierMagnitude === 0) {
          // Superattracting identity: both sides |lambda| ~ 0 (plan
          // section 3; never arithmetic on infinities).
          expect(oracle.cycle.magnitude).toBeLessThanOrEqual(MULTIPLIER_IDENTITY_TOLERANCE);
        } else {
          expect(
            Math.abs(production.multiplierMagnitude - oracle.cycle.magnitude),
          ).toBeLessThanOrEqual(MULTIPLIER_TOLERANCE);
        }
      } else if (production.status === 'unresolved' && oracle.status === 'attracting-cycle') {
        // Profile-budget miss against a certified oracle cycle: an honest
        // budget limitation, not a false claim. Pinned below.
        missedDetections += 1;
      }
    }
    expect(certified).toBeGreaterThan(0);
    expect(unadjudicatedAttracting).toBeGreaterThan(0);
    expect(missedDetections).toBe(14);
    expect(VERIFIER_REVISION).toBe('src-verifier-1.0.0');
  });
});

/** Declared binary64 multiplier tolerance (fixtures/orbits.v1.json policy). */
const MULTIPLIER_TOLERANCE = 1e-7;

/** Superattracting identity band: |lambda| this small is effectively zero. */
const MULTIPLIER_IDENTITY_TOLERANCE = 1e-7;
