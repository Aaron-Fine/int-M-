import { classifyPeriodFourInto } from './analytic-period-four';
import { classifyPeriodThreeInto } from './analytic-period-three';
import type { OrbitSample, OrbitScratch } from './orbit';
import { inPeriodFourGate } from './period-four-gate';
import { inPeriodThreeGate } from './period-three-gate';
import { VERIFIER_VERDICT, verifyCycleInto } from './verifier';
import { ORBIT_EVIDENCE_CODE, type OrbitOptions } from './types';

/**
 * Triggered lag-scan kernel: the production orbit loop behind classifyInto.
 *
 * A full lag scan (every lag 1..maxPeriod against the proposal gate on every
 * iteration) throws away almost all of its distances. This kernel keeps the
 * one product of a scan that predicts the next proposal — the lag whose
 * distance was smallest — and between full scans tests only that WATCHED lag,
 * with the proposal test of the full scan (squared distance <= cycleTolerance^2).
 * A full scan, identical to the full scan of that iteration (ascending lags,
 * inline verifier), runs when
 *
 * - the watched lag proposes (a "fire"). Fires are not capped: while the
 *   verifier keeps refusing a proposing lag, the pixel scans every iteration,
 *   exactly as the legacy scan does there. (A per-pixel cap let refusals
 *   at an ambiguous closure or divisor exhaust the fires before the
 *   iteration where legacy accepts, which could then be missed for good.)
 * - on a schedule: at the first scanning iteration, then after gaps of
 *   TRIGGERED_SCAN_INTERVAL_FIRST iterations doubling up to
 *   TRIGGERED_SCAN_INTERVAL_MAX (re-chooses the watched lag; catches a
 *   proposal at a lag that is not the watched one), and
 * - at the final iteration of the budget.
 *
 * Because the watched lag is tested on every iteration, the orbit phase at
 * which a period-p cycle first proposes is never skipped for that lag, which
 * is what the old end-of-budget tail window (every iteration, every lag)
 * existed to guarantee. Every acceptance is a legacy acceptance at the same
 * or a later iteration: each full scan is the legacy scan of that iteration.
 *
 * Other refinements versus the legacy body (all bit-identical):
 * - the history ring has power-of-two capacity, indexed with a mask instead
 *   of an integer modulo per lag;
 * - the verifier's proper-divisor walks are prefixes of its forward walk over
 *   the full period (same start, same recurrence, same operation order), so
 *   each divisor's residual and derivative are read off the forward walk at
 *   step d instead of re-walking d steps. A non-finite prefix state implies a
 *   non-finite final state (NaN and Inf are absorbing under z^2 + c), which
 *   the full-period checks reject first, so the per-step divisor finiteness
 *   checks of verifyCycleInto are subsumed.
 *
 * Hot-loop rules from orbit.ts apply: no non-inlined calls inside the orbit
 * loop and bare typed-array loads.
 */

/**
 * Full-scan cadence: the first scan runs at the first scanning iteration; the
 * gap to the next scan starts at TRIGGERED_SCAN_INTERVAL_FIRST and doubles
 * after each scheduled scan up to TRIGGERED_SCAN_INTERVAL_MAX.
 */
export const TRIGGERED_SCAN_INTERVAL_FIRST = 16;
export const TRIGGERED_SCAN_INTERVAL_MAX = 128;

// OrbitScratch.checkpointSpill slots used across the verifier call.
const SPILL_Z_RE = 0;
const SPILL_Z_IM = 1;
const SPILL_NEAREST = 2;

/**
 * Orbit loop of the triggered kernel, from z = 0. The caller has already
 * handled the period-1 and period-2 analytic fast paths; the period-3 closed
 * form and the period-4 cubic solve run inside the loop at the first scanning
 * iteration (ADR 0010, ADR 0013). `scratch` must have power-of-two capacity
 * of at least maxPeriod + 1 (OrbitScratch guarantees it).
 */
export const classifyTriggeredOrbitInto = (
  cRe: number,
  cIm: number,
  options: OrbitOptions,
  scratch: OrbitScratch,
  out: OrbitSample,
): void => {
  const historyRe = scratch.historyRe;
  const historyIm = scratch.historyIm;
  const mask = historyRe.length - 1;
  const spill = scratch.checkpointSpill;
  const toleranceSquared = options.cycleTolerance * options.cycleTolerance;
  const maxIterations = options.maxIterations;
  const maxPeriod = options.maxPeriod;
  // Iteration 1 has no history to compare (the legacy scan is empty there);
  // starting at 2 also keeps the watched-lag load off ring slots left over
  // from the previous pixel.
  const scanStart = Math.max(options.cycleWarmup, 2);
  let zRe = 0;
  let zIm = 0;
  let watch = 1;
  let due = scanStart;
  let interval = TRIGGERED_SCAN_INTERVAL_FIRST;

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
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

    const currentIndex = (iteration - 1) & mask;
    historyRe[currentIndex] = zRe;
    historyIm[currentIndex] = zIm;
    if (iteration < scanStart) {
      continue;
    }

    // Watched-lag proposal test: the legacy proposal test for one lag. The
    // watched lag is at most the largest lag of the scan that chose it, so
    // its ring slot holds the orbit point `watch` iterations back.
    const watchIndex = (currentIndex - watch) & mask;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- masked index < capacity
    const watchRe = zRe - historyRe[watchIndex]!;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- masked index < capacity
    const watchIm = zIm - historyIm[watchIndex]!;
    const fired = watchRe * watchRe + watchIm * watchIm <= toleranceSquared;
    if (!fired && iteration !== due && iteration !== maxIterations) {
      continue;
    }
    // Analytic period-3 and period-4 fast paths (ADR 0010, ADR 0013): once
    // per pixel, at the first scanning iteration and before its full scan. A
    // pixel that escapes earlier never reaches this test. The period-3 and
    // period-4 boxes are disjoint, so at most one solve runs. Each record
    // depends on c alone, so it is the same wherever it runs. The orbit
    // doubles round-trip through the spill across the call (hot-loop rule).
    if (iteration === scanStart) {
      const periodThree = inPeriodThreeGate(cRe, cIm);
      if (periodThree || inPeriodFourGate(cRe, cIm)) {
        spill[SPILL_Z_RE] = zRe;
        spill[SPILL_Z_IM] = zIm;
        if (
          periodThree
            ? classifyPeriodThreeInto(cRe, cIm, out)
            : classifyPeriodFourInto(cRe, cIm, out)
        ) {
          return;
        }
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- fixed-size spill
        zRe = spill[SPILL_Z_RE]!;
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- fixed-size spill
        zIm = spill[SPILL_Z_IM]!;
      }
    }
    if (iteration === due) {
      due = iteration + interval;
      interval = Math.min(2 * interval, TRIGGERED_SCAN_INTERVAL_MAX);
    }

    // Full scan: the legacy lag scan of this iteration, plus the argmin of
    // the lag distances it computes anyway (the next watched lag).
    const largestPeriod = Math.min(maxPeriod, iteration - 1);
    let nearestLag = 1;
    let nearestSquared = Number.POSITIVE_INFINITY;
    for (let period = 1; period <= largestPeriod; period += 1) {
      const previousIndex = (currentIndex - period) & mask;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- masked index < capacity
      const distanceRe = zRe - historyRe[previousIndex]!;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- masked index < capacity
      const distanceIm = zIm - historyIm[previousIndex]!;
      const distanceSquared = distanceRe * distanceRe + distanceIm * distanceIm;
      if (distanceSquared < nearestSquared) {
        nearestSquared = distanceSquared;
        nearestLag = period;
      }
      if (distanceSquared > toleranceSquared) {
        continue;
      }

      // Proposal: the canonical verifier decides. The call sits inside the
      // orbit loop, so every double the loop carries round-trips through the
      // scratch spill and is reloaded afterwards: nothing of the orbit state
      // is live across the call (orbit.ts hot-loop rule). Proposals are rare
      // here (about one per accepted pixel), so the call costs little.
      spill[SPILL_Z_RE] = zRe;
      spill[SPILL_Z_IM] = zIm;
      spill[SPILL_NEAREST] = nearestSquared;
      const verdict = verifyCycleInto(
        cRe,
        cIm,
        zRe,
        zIm,
        period,
        iteration,
        ORBIT_EVIDENCE_CODE.convergedCycle,
        out,
      );
      if (verdict === VERIFIER_VERDICT.accepted) {
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- fixed-size spill
      zRe = spill[SPILL_Z_RE]!;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- fixed-size spill
      zIm = spill[SPILL_Z_IM]!;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- fixed-size spill
      nearestSquared = spill[SPILL_NEAREST]!;
    }
    watch = nearestLag;
  }

  out.status = 0;
  out.iterations = maxIterations;
  out.evidence = ORBIT_EVIDENCE_CODE.iterationLimit;
};
