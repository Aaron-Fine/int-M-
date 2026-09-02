/**
 * Power-of-two approximate checkpoint schedule for src/ (plan section 4,
 * workstream C, PR 4). Brent-inspired, not Brent cycle detection: attracting
 * orbits converge asymptotically and do not repeat exactly in binary64, so
 * checkpoint proximity only PROPOSES a lag to the common verifier — this
 * kernel never classifies on its own. Acceptance is exclusively
 * verifyCycleInto (src/domain/verifier.ts, frozen policy
 * src-verifier-1.0.0), which alone writes attracting records; every
 * non-accepted verdict leaves `out` untouched and the schedule continues or
 * ends unresolved.
 *
 * Frozen policy, ported EXACTLY from the PoC's battle-tested kernel
 * poc/performance/src/kernels/checkpoint.ts revision poc-checkpoint-1.0.1
 * (see poc/performance/README.md "PR 4 design inputs" for why this schedule
 * won the A/B):
 *
 * 1. The checkpoint starts at the orbit seed z_0 = 0 with interval 1.
 * 2. From cycleWarmup on, outside a rejection re-arm wait, and while the
 *    rejected-candidate budget lasts, every step compares z_n with the
 *    retained checkpoint z_k (lag q = n - k) at the scale-aware permissive
 *    VERIFIER_THRESHOLDS.tauCandidate; a hit with q <= maxPeriod (the
 *    systematic ceiling, so proposals stay in the systematic period bucket)
 *    proposes (z_n, q). The whole schedule bookkeeping — comparisons AND
 *    interval updates — is gated on cycleWarmup exactly like the legacy lag
 *    scan, keeping the schedule deterministic in the warmup option.
 * 3. Rejection-retry is frozen: a failed proposal suppresses comparisons
 *    AND checkpoint updates for a doubling re-arm gap (1, 2, 4, ...), then
 *    comparisons resume against the SAME retained state, so the failed
 *    candidate is retested after a longer, better-converged lag instead of
 *    being dropped through a full interval. The gap doubles again on each
 *    further failure.
 * 4. Outside a re-arm wait and without a proposal on that step, the
 *    interval-exhaustion update is evaluated on its own: when q >= interval
 *    the current state becomes the next checkpoint and the interval
 *    doubles, capped at maxPeriod. This includes proximity hits whose lag
 *    exceeds the ceiling — they roll the checkpoint like any other
 *    exhausted interval instead of stalling against a stale state (the PoC
 *    regression case; nesting the update under the distance test would let
 *    a stale checkpoint survive the whole budget).
 * 5. The shared rejected-candidate budget (CHECKPOINT_CANDIDATE_BUDGET)
 *    stops all proposals and their comparisons for the pixel once
 *    exhausted; the orbit walk continues so escape classification is
 *    unaffected, and the exhaustion scan is skipped.
 * 6. On unresolved orbit-budget end the default-on exhaustion scan runs one
 *    full lag scan from the final state (plan section 4), still
 *    verifier-gated: every scan hit goes to verifyCycleInto, and scan
 *    comparisons stop once the budget is exhausted.
 *
 * The first proposal on a period-p orbit typically carries lag q = m p (a
 * multiple of p): the verifier's proper-divisor reduction returns the
 * primitive period, which is what gets reported.
 *
 * Deviation from the PoC kernel, deliberate: the analytic fast paths (main
 * cardioid, period-2 bulb) are mirrored from classifyInto INCLUDING the
 * frozen attraction margin and its fall-through to the orbit walk. The PoC
 * kernel accepts its closed forms ungated; src/ has been verifier-gated
 * since PR 3 and this kernel keeps that policy, so margin-adjacent analytic
 * points walk (and may end unresolved) instead of being accepted outright.
 *
 * Allocation discipline (plan workstream B, carried into C): no object is
 * created per pixel, and the per-iteration loops allocate nothing. Doubles
 * that must survive the non-inlined verifyCycleInto call are round-tripped
 * through the preallocated OrbitScratch.checkpointSpill slots, so no
 * walk-loop phi is live at that call site — the V8 phi-boxing constraint
 * documented at classifyInto (a value live across a deoptimizable call
 * inside the orbit loop switches the loop's double representation to tagged
 * and allocates a HeapNumber every iteration; the pr2 microbench measured
 * ~120 MB per million-pixel interior-heavy pass for that shape, while the
 * walk and scan loops below measure zero scavenges). The walk and scan
 * loops therefore contain no deoptimizable calls; only V8-internal builtins
 * (Math.min/max/abs cannot lazily deopt the caller). The re-arm bookkeeping
 * clamps reArmAt/reArmGap at maxIterations + 1, which is observably
 * identical to the PoC's unbounded doubling (any gap beyond the remaining
 * budget suppresses the rest of the pixel either way) while keeping every
 * integer in SMI range.
 *
 * Measured verifier-call allocation (accepted deviation, documented for PR
 * 5+): verifyCycleInto itself boxes doubles at its call boundary and —
 * because its internal walk/divisor loops are too large for Turbofan's
 * unrolled fast path — boxes roughly two values per walked step in its
 * current shape (~0.3-2 KB per call depending on the proposed period,
 * measured with GC scavenge counts at a fixed semi-space). This matches the
 * PoC's own discipline boundary ("the verifier returns one object per call;
 * the allocation-free discipline of the kernels does not extend here"),
 * costs are bounded per pixel by CHECKPOINT_CANDIDATE_BUDGET, proposals are
 * rare (~0.24 calls/pixel on the hardest measured raster), and the same
 * per-acceptance boxing is already paid by the legacy scan's inline
 * verifier (Math.hypot/atan2/log). Fixing it would mean rewriting the
 * frozen PR 3 policy module's internals for a rare path; measured walkthrough:
 * proposal-path probes isolate the allocation inside verifyCycleInto's loops,
 * with the kernel-side walk, scan, spill, and call machinery at zero
 * scavenges (pr4 bench allocation passes).
 *
 * V8 constraint on the verify call sites: verifyCycleInto is far too large
 * for Turbofan to inline, so it must never appear inside the walk or scan
 * loops. Both loops exit with a proposal; verification happens between
 * walk/scan segments in the driver below.
 */

import type { OrbitOptions } from './types';
import { ORBIT_EVIDENCE_CODE } from './types';
// Type-only: OrbitScratch and OrbitSample are defined in orbit.ts, which
// dispatches into this module in PR 4's differential mode. Type imports are
// erased at runtime, so no runtime dependency (and no cycle) exists; the
// kernel only reads fields off caller-owned objects.
import type { OrbitSample, OrbitScratch } from './orbit';
import { VERIFIER_THRESHOLDS, VERIFIER_VERDICT, verifyCycleInto } from './verifier';

/**
 * Revision of the frozen checkpoint schedule above. Distinct from the PoC
 * harness revision 'poc-checkpoint-1.0.1': the PoC kernel remains the
 * reference implementation; this is the production port with the src-side
 * verifier-gated analytic paths.
 */
export const CHECKPOINT_REVISION = 'src-checkpoint-1.0.0';

/**
 * Frozen rejected-candidate budget per pixel. Provenance: matches the PoC
 * schedule kernels' CANDIDATE_REJECTION_BUDGET, which matches the double-
 * double oracle's candidateVerifyBudget = 64
 * (poc/performance/src/oracle/classify-dd.ts), so the schedule never spends
 * more verifier calls on adversarial repeats than the oracle itself allows.
 * Every non-accepted verdict (rejected or ambiguous) consumes budget; once
 * exhausted, proposals, their comparisons, and the exhaustion scan stop for
 * the rest of the pixel while the orbit walk continues.
 */
export const CHECKPOINT_CANDIDATE_BUDGET = 64;

/**
 * Mutable per-pixel counters of the checkpoint schedule (plan section 8
 * opt-in diagnostics vocabulary). Preallocated and reused across pixels;
 * resetCheckpointMetrics zeroes it. lagComparisons is the deterministic
 * primary cost metric used by the workstream C gate.
 */
export interface CheckpointMetrics {
  /** Candidate lag distance evaluations (walk comparisons + scan). */
  lagComparisons: number;
  /** verifyCycleInto calls (proposals from the walk or the scan). */
  verifierCalls: number;
  /** Verifier verdicts of 'unresolved' (closure or divisor ambiguous). */
  verifierAmbiguous: number;
  rejectedNonFinite: number;
  rejectedNoClosure: number;
  rejectedNotAttracting: number;
  /** Interval-exhaustion checkpoint updates (rolls). */
  checkpointRolls: number;
  /** Rejection re-arms entered (doubling gap restarts). */
  reArms: number;
}

export const createCheckpointMetrics = (): CheckpointMetrics => ({
  lagComparisons: 0,
  verifierCalls: 0,
  verifierAmbiguous: 0,
  rejectedNonFinite: 0,
  rejectedNoClosure: 0,
  rejectedNotAttracting: 0,
  checkpointRolls: 0,
  reArms: 0,
});

export const resetCheckpointMetrics = (metrics: CheckpointMetrics): void => {
  metrics.lagComparisons = 0;
  metrics.verifierCalls = 0;
  metrics.verifierAmbiguous = 0;
  metrics.rejectedNonFinite = 0;
  metrics.rejectedNoClosure = 0;
  metrics.rejectedNotAttracting = 0;
  metrics.checkpointRolls = 0;
  metrics.reArms = 0;
};

/**
 * Preallocated, reusable disagreement record of the differential classifier
 * mode ('differential': both kernels run per pixel, the legacy answer stays
 * the reported one, and every semantic divergence is counted here). The
 * allocation-free discipline applies: ONE record per classifier/pass is
 * reused across pixels — never a per-pixel object.
 *
 * Disagreement fields:
 * - statusDisagreements: differing status codes (0/1/2);
 * - periodDisagreements: both attracting with different period bits;
 * - multiplierMagnitudeDisagreements: both attracting with different |lambda|
 *   bits (the last-ulp rounding can legitimately differ when the two
 *   schedules propose the cycle from different start phases; the differential
 *   counts honestly and the dd-oracle test adjudicates the class).
 *
 * Context fields: pixels classified, attracting/unresolved totals per kernel
 * (the unresolved delta drives the workstream C kill gate: checkpoint may
 * never push MORE pixels unresolved than the legacy scan).
 */
export interface DifferentialStats {
  pixels: number;
  statusDisagreements: number;
  periodDisagreements: number;
  multiplierMagnitudeDisagreements: number;
  legacyAttracting: number;
  checkpointAttracting: number;
  legacyUnresolved: number;
  checkpointUnresolved: number;
}

export const createDifferentialStats = (): DifferentialStats => ({
  pixels: 0,
  statusDisagreements: 0,
  periodDisagreements: 0,
  multiplierMagnitudeDisagreements: 0,
  legacyAttracting: 0,
  checkpointAttracting: 0,
  legacyUnresolved: 0,
  checkpointUnresolved: 0,
});

export const resetDifferentialStats = (stats: DifferentialStats): void => {
  stats.pixels = 0;
  stats.statusDisagreements = 0;
  stats.periodDisagreements = 0;
  stats.multiplierMagnitudeDisagreements = 0;
  stats.legacyAttracting = 0;
  stats.checkpointAttracting = 0;
  stats.legacyUnresolved = 0;
  stats.checkpointUnresolved = 0;
};

/**
 * Counts one legacy-versus-checkpoint pixel pair into `stats`. `legacy` must
 * carry the legacy scan's answer, `checkpoint` the schedule's; the reported
 * (legacy) record is never modified.
 */
export const recordDifferentialInto = (
  stats: DifferentialStats,
  legacy: Readonly<OrbitSample>,
  checkpoint: Readonly<OrbitSample>,
): void => {
  stats.pixels += 1;
  if (legacy.status !== checkpoint.status) {
    stats.statusDisagreements += 1;
  }
  if (legacy.status === 2) {
    stats.legacyAttracting += 1;
  } else if (legacy.status === 0) {
    stats.legacyUnresolved += 1;
  }
  if (checkpoint.status === 2) {
    stats.checkpointAttracting += 1;
  } else if (checkpoint.status === 0) {
    stats.checkpointUnresolved += 1;
  }
  if (legacy.status === 2 && checkpoint.status === 2) {
    if (legacy.period !== checkpoint.period) {
      stats.periodDisagreements += 1;
    }
    if (legacy.multiplierMagnitude !== checkpoint.multiplierMagnitude) {
      stats.multiplierMagnitudeDisagreements += 1;
    }
  }
};

// Spill slot indices for OrbitScratch.checkpointSpill: the walk state and
// the retained checkpoint must survive the verifyCycleInto call without
// being live across it (V8 phi-boxing constraint, see the module comment).
const SPILL_Z_RE = 0;
const SPILL_Z_IM = 1;
const SPILL_CHECKPOINT_RE = 2;
const SPILL_CHECKPOINT_IM = 3;

/**
 * Allocation-free checkpoint classification core (plan workstream C).
 * Classifies c = cRe + i*cIm into the preallocated `out` record without
 * creating objects. Options must be pre-resolved with resolveOrbitOptions;
 * scratch must not be shared between concurrently running classifications;
 * out must not be either. metrics must be preallocated (per classifier or
 * per pass) and is zeroed by the caller via resetCheckpointMetrics.
 *
 * Observable contract versus the legacy lag scan (classifyInto): identical
 * escape records (same smooth-iteration formula), identical analytic fast
 * paths including the margin fall-through, identical unresolved boundary
 * (status 0, iterations = maxIterations, iteration-limit evidence). Attracting
 * results carry the same fields as the verifier writes them — period,
 * multiplier, angle, kappa — with detection iteration and possibly the
 * proposed lag differing by schedule (the differential mode measures this;
 * acceptance itself is the same frozen verifier policy).
 */
export const classifyCheckpointInto = (
  cRe: number,
  cIm: number,
  options: OrbitOptions,
  scratch: OrbitScratch,
  out: OrbitSample,
  metrics: CheckpointMetrics,
  // eslint-disable-next-line complexity -- the branch count is the frozen schedule itself: analytic mirrors, the walk phase, the rejection-retry driver, and the exhaustion scan; splitting it into helpers would put deoptimizable calls inside the walk loop (see the module comment)
): void => {
  // Analytic fast paths: verbatim mirror of the classifyInto block (same
  // closed forms, same attraction margin, same fall-through on refusal) so
  // the two kernels agree bit for bit on every analytic and margin-adjacent
  // pixel. The differential tests pin this mirror to the original.
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
        return;
      }
    }
  }

  scratch.ensureCapacity(options.maxPeriod);
  const historyRe = scratch.historyRe;
  const historyIm = scratch.historyIm;
  const capacity = historyRe.length;
  const spill = scratch.checkpointSpill;
  const maxIterations = options.maxIterations;
  const maxPeriod = options.maxPeriod;
  const warmup = options.cycleWarmup;
  // Exhaustion scan default-on (plan section 4); !== false keeps the default
  // for raw (unresolved) option objects, resolveOrbitOptions normalizes it.
  const exhaustionScan = options.exhaustionScan !== false;
  // Scale-aware permissive proposal threshold (VERIFIER_THRESHOLDS.tauCandidate,
  // frozen policy); the verifier's stricter acceptance bound is applied by
  // verifyCycleInto, not here.
  const tauCandidateSquared = VERIFIER_THRESHOLDS.tauCandidate * VERIFIER_THRESHOLDS.tauCandidate;
  // SMI clamp ceiling for the re-arm bookkeeping (observably identical to
  // the PoC's unbounded doubling; see the module comment).
  const iterationCeiling = maxIterations + 1;

  let zRe = 0;
  let zIm = 0;
  let checkpointRe = 0;
  let checkpointIm = 0;
  let checkpointIteration = 0;
  let interval = 1;
  let reArmAt = 0;
  let reArmGap = 1;
  let budgetFailed = 0;
  let iteration = 1;

  // Driver: alternate walk segments (no calls) with verification (no walk
  // state live across the call — doubles round-trip through the spill).
  walk: for (;;) {
    let proposal = 0;
    let escaped = false;
    // ---- walk phase: pure arithmetic, history ring, schedule bookkeeping ----
    for (; iteration <= maxIterations; iteration += 1) {
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
        escaped = true;
        break;
      }

      const slot = (iteration - 1) % capacity;
      historyRe[slot] = zRe;
      historyIm[slot] = zIm;
      // The whole schedule bookkeeping is gated on cycleWarmup exactly like
      // the legacy lag scan; re-arm waits and an exhausted budget freeze
      // comparisons AND checkpoint updates (frozen rejection-retry policy).
      if (
        iteration < warmup ||
        iteration < reArmAt ||
        budgetFailed >= CHECKPOINT_CANDIDATE_BUDGET
      ) {
        continue;
      }

      const lag = iteration - checkpointIteration;
      metrics.lagComparisons += 1;
      // Scale-aware proposal threshold, same max(1, |zRe|, |zIm|) convention
      // as the verifier's scaleOf and the PoC's proposalThresholdSquared.
      const scale = Math.max(1, Math.abs(zRe), Math.abs(zIm));
      const distanceRe = zRe - checkpointRe;
      const distanceIm = zIm - checkpointIm;
      if (
        distanceRe * distanceRe + distanceIm * distanceIm <= tauCandidateSquared * scale * scale &&
        lag <= maxPeriod
      ) {
        // Proposal: exits the walk phase so verification happens outside the
        // loop (V8 constraint).
        proposal = lag;
        break;
      }
      // Interval-exhaustion update, evaluated independently of the proposal
      // branch (the PoC fix): any step that did not make a proposal —
      // including a proximity hit whose lag exceeds the systematic ceiling —
      // rolls the checkpoint when the interval is exhausted, so no stale
      // checkpoint survives the budget.
      if (lag >= interval) {
        checkpointRe = zRe;
        checkpointIm = zIm;
        checkpointIteration = iteration;
        interval = Math.min(interval * 2, maxPeriod);
        metrics.checkpointRolls += 1;
      }
    }
    if (escaped) {
      return;
    }
    if (proposal === 0) {
      break walk;
    }

    // ---- proposal phase: the common verifier decides, nothing else ----
    spill[SPILL_Z_RE] = zRe;
    spill[SPILL_Z_IM] = zIm;
    spill[SPILL_CHECKPOINT_RE] = checkpointRe;
    spill[SPILL_CHECKPOINT_IM] = checkpointIm;
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
    // Reload after the call: the locals are new values, so nothing was live
    // across the deoptimizable call boundary.
    zRe = spill[SPILL_Z_RE];
    zIm = spill[SPILL_Z_IM];
    checkpointRe = spill[SPILL_CHECKPOINT_RE];
    checkpointIm = spill[SPILL_CHECKPOINT_IM];
    if (verdict === VERIFIER_VERDICT.accepted) {
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
    // Frozen rejection-retry: retain the checkpoint and re-arm with a
    // doubling gap; comparisons resume against the SAME retained state.
    const reArmCandidate = iteration + reArmGap;
    reArmAt = reArmCandidate <= iterationCeiling ? reArmCandidate : iterationCeiling;
    const gapCandidate = reArmGap * 2;
    reArmGap = gapCandidate <= iterationCeiling ? gapCandidate : iterationCeiling;
    metrics.reArms += 1;
    iteration += 1;
  }

  // ---- exhaustion scan (plan section 4): one full lag scan from the final
  // state, default-on, skipped when the budget is exhausted (policy 5), and
  // verifier-gated like every candidate path. Uses the orbit history ring.
  if (exhaustionScan && budgetFailed < CHECKPOINT_CANDIDATE_BUDGET) {
    const largestPeriod = Math.min(maxPeriod, maxIterations - 1);
    let scanLag = 1;
    scan: for (;;) {
      let proposal = 0;
      // ---- scan comparison phase: no calls ----
      for (; scanLag <= largestPeriod; scanLag += 1) {
        const previousIndex = (maxIterations - 1 - scanLag) % capacity;
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- in-bounds: scanLag <= largestPeriod <= maxIterations - 1 < capacity, mirroring the legacy lag-scan indexing proof
        const distanceRe = zRe - historyRe[previousIndex]!;
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- in-bounds proof above
        const distanceIm = zIm - historyIm[previousIndex]!;
        metrics.lagComparisons += 1;
        const scale = Math.max(1, Math.abs(zRe), Math.abs(zIm));
        if (
          distanceRe * distanceRe + distanceIm * distanceIm >
          tauCandidateSquared * scale * scale
        ) {
          continue;
        }
        proposal = scanLag;
        break;
      }
      if (proposal === 0) {
        break scan;
      }
      // ---- scan proposal phase: verifier outside the scan loop ----
      spill[SPILL_Z_RE] = zRe;
      spill[SPILL_Z_IM] = zIm;
      metrics.verifierCalls += 1;
      const verdict = verifyCycleInto(
        cRe,
        cIm,
        zRe,
        zIm,
        proposal,
        maxIterations,
        ORBIT_EVIDENCE_CODE.convergedCycle,
        out,
      );
      zRe = spill[SPILL_Z_RE];
      zIm = spill[SPILL_Z_IM];
      if (verdict === VERIFIER_VERDICT.accepted) {
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
      scanLag += 1;
    }
  }

  out.status = 0;
  out.iterations = maxIterations;
  out.evidence = ORBIT_EVIDENCE_CODE.iterationLimit;
};
