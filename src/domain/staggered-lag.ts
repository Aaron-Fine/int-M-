/**
 * Staggered harmonic lag schedule (classifierMode 'staggered-lag'): the
 * production port of the frozen prior-art policy in
 * poc/performance/src/kernels/staggered.ts, candidate-only toward the common
 * verifier (src/domain/verifier.ts). Acceptance is the frozen verifier's
 * alone; this module only decides WHICH (iteration, lag) pairs are proposed.
 *
 * Schedule. After cycleWarmup, iteration n tests only the lags p that divide
 * n (and p <= min(maxPeriod, n - 1)), in ascending order, against the
 * legacy proximity gate |z_n - z_{n-p}|^2 <= cycleTolerance^2. Lag p is
 * therefore tested once every p iterations instead of every iteration, and
 * the average comparison count per iteration falls from maxPeriod to about
 * the harmonic number H(maxPeriod) (about 4.06 at maxPeriod 32). Every
 * proposal is a pair the legacy scan also gates and verifies at the same
 * (iteration, lag), so an accepted pixel is always one the legacy scan would
 * accept; only the iteration at which the cycle is first seen can differ.
 *
 * Frozen policy (prior-art port):
 * - Rejected-candidate budget (STAGGERED_CANDIDATE_BUDGET). Every
 *   non-accepted verifier verdict consumes budget. Once exhausted, proposals,
 *   their comparisons and the final window scan stop for the rest of the
 *   pixel, while the orbit walk continues so escapes are still detected.
 * - Final window scan. When the walk ends unresolved with budget left, every
 *   lag the schedule skipped over the last maxPeriod iterations is compared
 *   (iterations max(first, maxIterations - maxPeriod + 1)..maxIterations, all
 *   lags 1..min(maxPeriod, n - 1) that the schedule did not test), read from a
 *   history of 2 * maxPeriod entries, verifier-gated like every candidate path.
 *   It recovers cycles whose divisor schedule did not fall on their phase in
 *   time, e.g. a period-9 cycle seen at n = 502, 505, 508, 511. Coverage is not
 *   guaranteed in general; the parity run is the arbiter.
 *
 * Detection delay. A converged cycle of period p is first proposed at the
 * next multiple of p after the legacy scan would have proposed it, so the
 * accepted iteration can be later than the legacy one (by less than p once
 * the orbit has converged). Status and period are unaffected; the cycle
 * start, and therefore the multiplier's rounding, can differ.
 *
 * The walk is allocation-free and follows the V8 rules of orbit.ts and
 * checkpoint.ts: the walk loop makes no calls, the verifier runs outside it
 * with the walk state round-tripped through scratch.checkpointSpill, and the
 * divisor schedule is a precomputed table read with bare typed-array loads.
 */

import type { OrbitOptions } from './types';
import { ORBIT_EVIDENCE_CODE } from './types';
import { periodBucketIndex } from './period-buckets';
// Type-only imports, erased at runtime (see checkpoint.ts for the cycle note).
import type { CheckpointMetrics } from './checkpoint';
import type { OrbitSample, OrbitScratch } from './orbit';
import { VERIFIER_THRESHOLDS, VERIFIER_VERDICT, verifyCycleInto } from './verifier';

/**
 * Revision of the frozen staggered schedule above. Ported from the PoC
 * harness 'poc-staggered-1.0.0'; this is the production port with the
 * src-side verifier-gated analytic paths.
 */
export const STAGGERED_REVISION = 'src-staggered-1.0.0';

/**
 * Frozen rejected-candidate budget per pixel: the same 64 as the prior-art
 * CANDIDATE_REJECTION_BUDGET and the double-double oracle's
 * candidateVerifyBudget (poc/performance/src/oracle/classify-dd.ts).
 */
export const STAGGERED_CANDIDATE_BUDGET = 64;

interface HarmonicLagTable {
  readonly maxIterations: number;
  readonly maxPeriod: number;
  /** Lags for iteration n occupy lags[offsets[n] .. offsets[n + 1]), ascending. */
  readonly offsets: Uint32Array;
  readonly lags: Uint32Array;
}

let cachedLagTable: HarmonicLagTable | undefined;

const buildHarmonicLagTable = (maxIterations: number, maxPeriod: number): HarmonicLagTable => {
  const offsets = new Uint32Array(maxIterations + 2);
  let total = 0;
  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    offsets[iteration] = total;
    const largestLag = Math.min(maxPeriod, iteration - 1);
    for (let lag = 1; lag <= largestLag; lag += 1) {
      if (iteration % lag === 0) {
        total += 1;
      }
    }
  }
  offsets[maxIterations + 1] = total;

  const lags = new Uint32Array(total);
  let cursor = 0;
  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    const largestLag = Math.min(maxPeriod, iteration - 1);
    for (let lag = 1; lag <= largestLag; lag += 1) {
      if (iteration % lag === 0) {
        lags[cursor] = lag;
        cursor += 1;
      }
    }
  }
  return { maxIterations, maxPeriod, offsets, lags };
};

/**
 * Harmonic divisor table for (maxIterations, maxPeriod), memoized on a single
 * slot: a render uses one option pair, so the table is built once per render
 * and the per-pixel call is two integer comparisons outside every loop.
 */
const harmonicLagTableFor = (maxIterations: number, maxPeriod: number): HarmonicLagTable => {
  const cached = cachedLagTable;
  if (cached?.maxIterations === maxIterations && cached.maxPeriod === maxPeriod) {
    return cached;
  }
  const table = buildHarmonicLagTable(maxIterations, maxPeriod);
  cachedLagTable = table;
  return table;
};

const noteSystematicDetection = (metrics: CheckpointMetrics, period: number): void => {
  const bucket = periodBucketIndex(period);
  if (bucket === 0) metrics.systematic1to4 += 1;
  else if (bucket === 1) metrics.systematic5to8 += 1;
  else if (bucket === 2) metrics.systematic9to12 += 1;
  else metrics.systematic13Plus += 1;
};

const noteOpportunisticDetection = (metrics: CheckpointMetrics, period: number): void => {
  const bucket = periodBucketIndex(period);
  if (bucket === 0) metrics.opportunistic1to4 += 1;
  else if (bucket === 1) metrics.opportunistic5to8 += 1;
  else if (bucket === 2) metrics.opportunistic9to12 += 1;
  else metrics.opportunistic13Plus += 1;
};

// Spill slot indices for OrbitScratch.checkpointSpill: the walk state must
// not be live across the verifyCycleInto call (see checkpoint.ts).
const SPILL_Z_RE = 0;
const SPILL_Z_IM = 1;

/**
 * Allocation-free staggered classification core. Classifies
 * c = cRe + i*cIm into the preallocated `out` record. Options must be
 * pre-resolved with resolveOrbitOptions; scratch and out must not be shared
 * with a concurrently running classification; metrics is the caller's
 * preallocated CheckpointMetrics (zeroed by resetCheckpointMetrics; the
 * checkpoint-only rolls and re-arms stay zero here).
 *
 * Observable contract versus the legacy lag scan (classifyInto): identical
 * escape records, identical analytic fast paths (verbatim mirror of the
 * classifyInto block), identical unresolved boundary (status 0,
 * iterations = maxIterations, iteration-limit evidence). Attracting results
 * are written by the common verifier only.
 */
export const classifyStaggeredInto = (
  cRe: number,
  cIm: number,
  options: OrbitOptions,
  scratch: OrbitScratch,
  out: OrbitSample,
  metrics: CheckpointMetrics,
  // eslint-disable-next-line complexity -- the branch count is the frozen schedule itself: analytic mirrors, the staggered walk, the verifier-retry driver, and the final window scan; splitting it would put calls inside the walk loop (see the module comment)
): void => {
  // Analytic fast paths: verbatim mirror of the classifyInto block, so the
  // two kernels agree bit for bit on every analytic and margin-adjacent pixel.
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
    const multiplierRe = 1 - rootRe;
    const multiplierIm = sqrtArgIm < 0 ? rootImMagnitude : -rootImMagnitude;
    const multiplierMagnitude = Math.hypot(multiplierRe, multiplierIm);
    if (multiplierMagnitude < 1 - VERIFIER_THRESHOLDS.attractMargin) {
      out.status = 2;
      out.iterations = 0;
      out.evidence = ORBIT_EVIDENCE_CODE.analyticMainCardioid;
      out.period = 1;
      out.multiplierRe = multiplierRe;
      out.multiplierIm = multiplierIm;
      out.multiplierMagnitude = multiplierMagnitude;
      out.multiplierAngle = multiplierMagnitude === 0 ? 0 : Math.atan2(multiplierIm, multiplierRe);
      out.stabilityExponent =
        multiplierMagnitude === 0 ? Number.POSITIVE_INFINITY : -Math.log(multiplierMagnitude);
      metrics.analyticHits += 1;
      return;
    }
  } else {
    const bulbX = x + 1;
    if (bulbX * bulbX + ySquared < 1 / 16) {
      const multiplierRe = 4 * bulbX;
      const multiplierIm = 4 * cIm;
      const multiplierMagnitude = Math.hypot(multiplierRe, multiplierIm);
      if (multiplierMagnitude < 1 - VERIFIER_THRESHOLDS.attractMargin) {
        out.status = 2;
        out.iterations = 0;
        out.evidence = ORBIT_EVIDENCE_CODE.analyticPeriod2Bulb;
        out.period = 2;
        out.multiplierRe = multiplierRe;
        out.multiplierIm = multiplierIm;
        out.multiplierMagnitude = multiplierMagnitude;
        out.multiplierAngle =
          multiplierMagnitude === 0 ? 0 : Math.atan2(multiplierIm, multiplierRe);
        out.stabilityExponent =
          multiplierMagnitude === 0 ? Number.POSITIVE_INFINITY : -Math.log(multiplierMagnitude) / 2;
        metrics.analyticHits += 1;
        return;
      }
    }
  }

  // History spans 2 * maxPeriod so the final window scan can read z_{n-p} for
  // n in the last maxPeriod iterations (n - p >= maxIterations - 2 * maxPeriod + 1).
  scratch.ensureCapacity(2 * options.maxPeriod);
  const historyRe = scratch.historyRe;
  const historyIm = scratch.historyIm;
  const capacity = historyRe.length;
  const spill = scratch.checkpointSpill;
  const maxIterations = options.maxIterations;
  const maxPeriod = options.maxPeriod;
  const warmup = options.cycleWarmup;
  // Exhaustion scan default-on (prior-art policy); !== false keeps the default
  // for raw option objects, resolveOrbitOptions normalizes it.
  const exhaustionScan = options.exhaustionScan !== false;
  // The baseline proximity gate (cycleTolerance), so every verifier call is a
  // (cycle start, period) pair the legacy scan would also verify. The
  // permissive tauCandidate gate (prior art) was tried and admitted verifier
  // acceptances the baseline never makes: an unresolved baseline pixel was
  // converted to attracting, which the semantic-revision parity forbids.
  const toleranceSquared = options.cycleTolerance * options.cycleTolerance;
  const table = harmonicLagTableFor(maxIterations, maxPeriod);
  const offsets = table.offsets;
  const lags = table.lags;
  // The first iteration with comparisons is max(cycleWarmup, 1); the cursor
  // starts at its first divisor-table entry and advances with the walk.
  const firstIteration = Math.min(Math.max(warmup, 1), maxIterations + 1);
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- in-bounds: firstIteration <= maxIterations + 1 < offsets.length
  let cursor = offsets[firstIteration]!;

  let zRe = 0;
  let zIm = 0;
  // Iteration whose state is currently in zRe/zIm (0 = none yet). A verifier
  // rejection resumes the SAME iteration at the cursor, so the state is not
  // advanced twice.
  let advancedTo = 0;
  let budgetFailed = 0;
  let iteration = 1;

  // Driver: alternate walk segments (no calls) with verification (no walk
  // state live across the call; the z pair round-trips through the spill).
  walk: for (;;) {
    let proposal = 0;
    // ---- walk phase: pure arithmetic, history ring, staggered comparisons ----
    while (iteration <= maxIterations) {
      if (advancedTo !== iteration) {
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

        const currentSlot = (iteration - 1) % capacity;
        historyRe[currentSlot] = zRe;
        historyIm[currentSlot] = zIm;
        advancedTo = iteration;
      }

      // Frozen budget: an exhausted budget stops comparisons for the rest of
      // the pixel while the walk above keeps running for escape.
      if (iteration < warmup || budgetFailed >= STAGGERED_CANDIDATE_BUDGET) {
        iteration += 1;
        continue;
      }

      const currentSlot = (iteration - 1) % capacity;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- in-bounds: iteration + 1 <= maxIterations + 1 < offsets.length
      const end = offsets[iteration + 1]!;
      for (; cursor < end; cursor += 1) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- in-bounds: cursor < offsets[iteration + 1] <= lags.length
        const lag = lags[cursor]!;
        metrics.lagComparisons += 1;
        // Lag p compares z_n with z_{n-p}, stored p slots behind the current
        // slot. 1 <= lag <= min(maxPeriod, n - 1) and maxPeriod < capacity,
        // so one conditional wrap yields an index in [0, capacity).
        let previousSlot = currentSlot - lag;
        if (previousSlot < 0) {
          previousSlot += capacity;
        }
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- in-bounds proof above
        const distanceRe = zRe - historyRe[previousSlot]!;
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- in-bounds proof above
        const distanceIm = zIm - historyIm[previousSlot]!;
        if (distanceRe * distanceRe + distanceIm * distanceIm > toleranceSquared) {
          continue;
        }
        proposal = lag;
        cursor += 1;
        break;
      }
      if (proposal !== 0) {
        break;
      }
      iteration += 1;
    }
    if (proposal === 0) {
      break walk;
    }

    // ---- proposal phase: the common verifier decides, nothing else ----
    spill[SPILL_Z_RE] = zRe;
    spill[SPILL_Z_IM] = zIm;
    metrics.verifierCalls += 1;
    const verdict = verifyCycleInto(
      cRe,
      cIm,
      zRe,
      zIm,
      proposal,
      iteration,
      ORBIT_EVIDENCE_CODE.convergedCycle,
      out,
    );
    // Reload after the call: nothing was live across the deoptimizable call.
    zRe = spill[SPILL_Z_RE];
    zIm = spill[SPILL_Z_IM];
    if (verdict === VERIFIER_VERDICT.accepted) {
      noteSystematicDetection(metrics, out.period);
      return;
    }
    if (
      verdict === VERIFIER_VERDICT.unresolvedClosureAmbiguous ||
      verdict === VERIFIER_VERDICT.unresolvedDivisorAmbiguous
    ) {
      metrics.verifierAmbiguous += 1;
    } else if (verdict === VERIFIER_VERDICT.rejectedNonFinite) {
      metrics.rejectedNonFinite += 1;
    } else if (verdict === VERIFIER_VERDICT.rejectedNoClosure) {
      metrics.rejectedNoClosure += 1;
    } else {
      metrics.rejectedNotAttracting += 1;
    }
    budgetFailed += 1;
    // The cursor already points past the rejected lag, so the walk resumes
    // the remaining divisors of this same iteration.
  }

  // ---- final window scan (widens the prior-art exhaustion scan): every lag
  // the schedule did not test over the last maxPeriod iterations, ascending n
  // then p, read from the orbit history. The walk already verified the divisor
  // pairs of each iteration, so they are skipped instead of being re-sent to
  // the verifier. Budget-gated and verifier-authoritative like every candidate.
  // Skipped entirely when the budget is exhausted (comparisons stopped).
  if (exhaustionScan && budgetFailed < STAGGERED_CANDIDATE_BUDGET) {
    let scanIteration = Math.max(firstIteration, maxIterations - maxPeriod + 1);
    let scanLag = 1;
    scan: for (;;) {
      let proposal = 0;
      // ---- window comparison phase: no calls ----
      while (scanIteration <= maxIterations && budgetFailed < STAGGERED_CANDIDATE_BUDGET) {
        if (scanLag > Math.min(maxPeriod, scanIteration - 1)) {
          scanIteration += 1;
          scanLag = 1;
          continue;
        }
        const lag = scanLag;
        scanLag += 1;
        if (scanIteration % lag === 0) {
          continue;
        }
        const slot = (scanIteration - 1) % capacity;
        let previousSlot = slot - lag;
        if (previousSlot < 0) {
          previousSlot += capacity;
        }
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- in-bounds: slot and previousSlot are both wrapped into [0, capacity)
        const distanceRe = historyRe[slot]! - historyRe[previousSlot]!;
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- in-bounds proof above
        const distanceIm = historyIm[slot]! - historyIm[previousSlot]!;
        metrics.lagComparisons += 1;
        if (distanceRe * distanceRe + distanceIm * distanceIm > toleranceSquared) {
          continue;
        }
        proposal = lag;
        break;
      }
      if (proposal === 0) {
        break scan;
      }
      // ---- window proposal phase: the verifier receives the baseline's pair,
      // the cycle start z_n (from history) with period p and iterations n ----
      const proposalSlot = (scanIteration - 1) % capacity;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- in-bounds: proposalSlot is in [0, capacity)
      const proposalRe = historyRe[proposalSlot]!;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- in-bounds proof above
      const proposalIm = historyIm[proposalSlot]!;
      metrics.verifierCalls += 1;
      const verdict = verifyCycleInto(
        cRe,
        cIm,
        proposalRe,
        proposalIm,
        proposal,
        scanIteration,
        ORBIT_EVIDENCE_CODE.convergedCycle,
        out,
      );
      if (verdict === VERIFIER_VERDICT.accepted) {
        noteOpportunisticDetection(metrics, out.period);
        return;
      }
      if (
        verdict === VERIFIER_VERDICT.unresolvedClosureAmbiguous ||
        verdict === VERIFIER_VERDICT.unresolvedDivisorAmbiguous
      ) {
        metrics.verifierAmbiguous += 1;
      } else if (verdict === VERIFIER_VERDICT.rejectedNonFinite) {
        metrics.rejectedNonFinite += 1;
      } else if (verdict === VERIFIER_VERDICT.rejectedNoClosure) {
        metrics.rejectedNoClosure += 1;
      } else {
        metrics.rejectedNotAttracting += 1;
      }
      budgetFailed += 1;
    }
  }

  out.status = 0;
  out.iterations = maxIterations;
  out.evidence = ORBIT_EVIDENCE_CODE.iterationLimit;
};
