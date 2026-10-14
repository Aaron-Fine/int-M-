/**
 * Neighbor-informed lag ordering (plan section 5 PoC list).
 *
 * The production dispatcher classifies pixels in raster order, so a pixel's
 * LEFT neighbor is already classified when the pixel starts. This kernel
 * consumes the neighbor's detected primitive period as a hint and orders
 * its lag testing by that evidence instead of plain ascending order:
 *
 * 1. Analytic fast paths first (shared with every kernel).
 * 2. Orbit walk with the shared history ring.
 * 3. From cycleWarmup on, while the shared rejected-candidate budget lasts:
 *    a. Hinted comparison: when a hint h in [1, min(maxPeriod, n - 1)] is
 *       present, ONE lag comparison at lag h (counted). A tauCandidate
 *       proximity hit proposes (z_n, h) to the common verifier; on
 *       rejection the checkpoint schedule's frozen rejection-retry applies
 *       (doubling re-arm gap against the same state).
 *    b. Fallback trigger (fires only when the hint cannot): the frozen
 *       trigger step gate |z_n - z_{n-1}| <= gate * max(1, |z_n|)
 *       (TRIGGER_THRESHOLDS, quarter re-arm, 8-scan cap) runs one
 *       HINT-ORDERED full lag scan: the hinted lag first (unless it was
 *       already proposed this step), then lags 1..min(maxPeriod, n - 1)
 *       ascending. Under the DE model the neighbor's period is the most
 *       plausible lag, so a correct hint detects after one comparison
 *       where the ascending scan needs up to maxPeriod.
 * 4. On unresolved orbit-budget end the default-on exhaustion scan runs
 *    one hint-ordered full lag scan from the final state.
 *
 * Honest cost model (measured on the deterministic grids, not assumed):
 * a hint is only as good as the spatial coherence behind it. A wrong hint
 * costs one comparison per step (same order as the checkpoint schedule)
 * and a period >= 2 pixel under a wrong hint falls through to the
 * exhaustion scan - the grid report shows this as detection delay on
 * transition rows. The verifier alone classifies; a hint never weakens
 * acceptance.
 */

import {
  acceptedResult,
  analyticInterior,
  emptyMetrics,
  kappaOf,
  proposalThresholdSquared,
  ProposalBudget,
  verifyCandidate,
  type AcceptedCandidate,
  type KernelMetrics,
} from './shared.ts';
import { TRIGGER_THRESHOLDS } from './trigger.ts';
import type { ClassificationKernel, KernelOptions, KernelResult } from './shared.ts';

export const NEIGHBOR_REVISION = 'poc-neighbor-1.0.0';

export class NeighborKernel implements ClassificationKernel {
  public readonly name = 'neighbor' as const;
  #historyRe: Float64Array;
  #historyIm: Float64Array;
  #budget = new ProposalBudget();

  public constructor(maxPeriod = 64) {
    const capacity = Math.max(2, Math.ceil(maxPeriod) + 1);
    this.#historyRe = new Float64Array(capacity);
    this.#historyIm = new Float64Array(capacity);
  }

  public classify(cRe: number, cIm: number, options: KernelOptions): KernelResult {
    return this.classifyWithHint(cRe, cIm, options, 0);
  }

  /**
   * One hinted lag comparison. Outcomes: the accepted candidate, the
   * literal 'rejected' (proximity hit, verifier refused: the caller applies
   * the frozen doubling re-arm), or the literal 'idle' (suppressed by
   * re-arm/budget/history bounds, or compared without proximity).
   */
  #hintStep(
    h: number,
    largestPeriod: number,
    iteration: number,
    reArmAt: number,
    slot: number,
    cRe: number,
    cIm: number,
    zRe: number,
    zIm: number,
    metrics: KernelMetrics,
  ): AcceptedCandidate | 'rejected' | 'idle' {
    if (h < 1 || h > largestPeriod || iteration < reArmAt || this.#budget.isExhausted()) {
      return 'idle';
    }
    const capacity = this.#historyRe.length;
    metrics.lagComparisons += 1;
    const previousIndex = (slot - h + capacity) % capacity;
    const dRe = zRe - (this.#historyRe[previousIndex] ?? Number.NaN);
    const dIm = zIm - (this.#historyIm[previousIndex] ?? Number.NaN);
    if (dRe * dRe + dIm * dIm > proposalThresholdSquared(zRe, zIm)) {
      return 'idle';
    }
    const candidate = verifyCandidate(cRe, cIm, zRe, zIm, h, metrics, this.#budget);
    return candidate ?? 'rejected';
  }

  /**
   * Fallback trigger evaluation (frozen trigger policy). Outcomes: the
   * accepted candidate, 'fired-empty' (gate fired, scan found nothing:
   * caller consumes the scan cap and re-arms), or 'not-fired'.
   */
  #gateStep(
    gate: number,
    scansUsed: number,
    hint: number,
    iteration: number,
    maxPeriod: number,
    zRe: number,
    zIm: number,
    previousRe: number,
    previousIm: number,
    cRe: number,
    cIm: number,
    metrics: KernelMetrics,
  ): AcceptedCandidate | 'fired-empty' | 'not-fired' {
    if (scansUsed >= TRIGGER_THRESHOLDS.maxScansPerPixel || this.#budget.isExhausted()) {
      return 'not-fired';
    }
    const scale = Math.max(1, Math.abs(zRe), Math.abs(zIm));
    const stepRe = zRe - previousRe;
    const stepIm = zIm - previousIm;
    const gateSquared = gate * gate * scale * scale;
    if (stepRe * stepRe + stepIm * stepIm > gateSquared) {
      return 'not-fired';
    }
    const candidate = this.#hintOrderedScan(
      cRe,
      cIm,
      zRe,
      zIm,
      iteration,
      hint,
      maxPeriod,
      metrics,
    );
    return candidate ?? 'fired-empty';
  }

  /** Exhaustion scan plus the honest unresolved epilogue. */
  #epilogue(
    cRe: number,
    cIm: number,
    zRe: number,
    zIm: number,
    options: KernelOptions,
    hint: number,
    metrics: KernelMetrics,
  ): KernelResult {
    if (options.exhaustionScan && !this.#budget.isExhausted()) {
      const candidate = this.#hintOrderedScan(
        cRe,
        cIm,
        zRe,
        zIm,
        options.maxIterations,
        hint,
        options.maxPeriod,
        metrics,
      );
      if (candidate !== undefined) {
        return acceptedResult('exhaustion-scan', options.maxIterations, candidate, metrics);
      }
    }
    return {
      status: 'unresolved',
      iterations: options.maxIterations,
      evidence: this.#budget.isExhausted() ? 'candidate-budget-exhausted' : 'iteration-limit',
      metrics,
    };
  }

  /**
   * Classify with a neighbor-period hint (0 = no hint). The hint is the
   * previously classified neighboring pixel's PRIMITIVE period as reported
   * by this harness's common verifier; it is a proposal ordering device
   * only and never weakens the verifier.
   */
  public classifyWithHint(
    cRe: number,
    cIm: number,
    options: KernelOptions,
    hint: number,
  ): KernelResult {
    const metrics = emptyMetrics();
    this.#budget.reset();

    const analytic = analyticInterior(cRe, cIm);
    if (analytic !== undefined) {
      const magnitude = Math.hypot(analytic.multiplierRe, analytic.multiplierIm);
      return {
        status: 'attracting',
        iterations: 0,
        evidence: analytic.evidence,
        metrics,
        period: analytic.period,
        multiplierMagnitude: magnitude,
        multiplierAngle:
          magnitude === 0 ? 0 : Math.atan2(analytic.multiplierIm, analytic.multiplierRe),
        kappa: kappaOf(magnitude, analytic.period),
      };
    }

    const capacity = this.#historyRe.length;
    const maxPeriod = options.maxPeriod;
    // A hint outside the systematic bucket or the orbit history is dropped.
    const h = hint >= 1 && hint <= maxPeriod ? hint : 0;

    let zRe = 0;
    let zIm = 0;
    let previousRe = 0;
    let previousIm = 0;
    let gate = TRIGGER_THRESHOLDS.initialGate;
    let scansUsed = 0;
    let reArmAt = 0;
    let reArmGap = 1;

    for (let iteration = 1; iteration <= options.maxIterations; iteration += 1) {
      const nextRe = zRe * zRe - zIm * zIm + cRe;
      zIm = 2 * zRe * zIm + cIm;
      zRe = nextRe;
      const magnitudeSquared = zRe * zRe + zIm * zIm;

      if (magnitudeSquared > 4) {
        return {
          status: 'escaped',
          iterations: iteration,
          evidence: 'escape-radius',
          metrics,
          escapeIteration: iteration,
          magnitudeSquared,
        };
      }

      const slot = (iteration - 1) % capacity;
      this.#historyRe[slot] = zRe;
      this.#historyIm[slot] = zIm;

      if (iteration >= options.cycleWarmup && !this.#budget.isExhausted()) {
        const largestPeriod = Math.min(maxPeriod, iteration - 1);

        // (a) Hinted comparison: one lag evaluation at the neighbor's
        // period, proposals verifier-decided, frozen rejection-retry.
        const hintOutcome = this.#hintStep(
          h,
          largestPeriod,
          iteration,
          reArmAt,
          slot,
          cRe,
          cIm,
          zRe,
          zIm,
          metrics,
        );
        if (hintOutcome === 'rejected') {
          reArmAt = iteration + reArmGap;
          reArmGap *= 2;
        } else if (hintOutcome !== 'idle') {
          return acceptedResult('neighbor-hint', iteration, hintOutcome, metrics);
        }
        const hintProposedThisStep = hintOutcome === 'rejected';

        // (b) Fallback trigger (frozen trigger policy) with a hint-ordered
        // full scan; fires when the hint cannot (no hint, or a hint that
        // does not match this pixel's cycle).
        const gateOutcome = this.#gateStep(
          gate,
          scansUsed,
          hintProposedThisStep ? 0 : h,
          iteration,
          maxPeriod,
          zRe,
          zIm,
          previousRe,
          previousIm,
          cRe,
          cIm,
          metrics,
        );
        if (gateOutcome === 'fired-empty') {
          scansUsed += 1;
          gate /= TRIGGER_THRESHOLDS.gateReArmDivisor;
        } else if (gateOutcome !== 'not-fired') {
          return acceptedResult('neighbor-scan', iteration, gateOutcome, metrics);
        }
      }

      previousRe = zRe;
      previousIm = zIm;
    }

    return this.#epilogue(cRe, cIm, zRe, zIm, options, h, metrics);
  }

  /**
   * Full lag scan in hint-first order: the hinted lag (when valid and not
   * already proposed this step) is compared and proposed first, then lags
   * 1..min(maxPeriod, n - 1) ascending. Same proposal semantics and honest
   * comparison counting as the shared fullLagScan.
   */
  #hintOrderedScan(
    cRe: number,
    cIm: number,
    zRe: number,
    zIm: number,
    iteration: number,
    hint: number,
    maxPeriod: number,
    metrics: KernelMetrics,
  ): AcceptedCandidate | undefined {
    const capacity = this.#historyRe.length;
    const largestPeriod = Math.min(maxPeriod, iteration - 1);
    const candidateSquared = proposalThresholdSquared(zRe, zIm);

    for (let period = 0; period <= largestPeriod; period += 1) {
      // period 0 encodes "the hinted lag first"; the loop then walks the
      // ascending lags and skips the hint (already handled).
      const lag = period === 0 ? hint : period;
      if (lag < 1 || lag > largestPeriod || (period !== 0 && lag === hint)) {
        continue;
      }
      if (this.#budget.isExhausted()) {
        return undefined;
      }
      const previousIndex = (iteration - 1 - lag) % capacity;
      const distanceRe = zRe - (this.#historyRe[previousIndex] ?? Number.NaN);
      const distanceIm = zIm - (this.#historyIm[previousIndex] ?? Number.NaN);
      metrics.lagComparisons += 1;
      if (distanceRe * distanceRe + distanceIm * distanceIm > candidateSquared) {
        continue;
      }
      const candidate = verifyCandidate(cRe, cIm, zRe, zIm, lag, metrics, this.#budget);
      if (candidate !== undefined) {
        return candidate;
      }
    }
    return undefined;
  }
}
