/**
 * Power-of-two approximate checkpoint schedule (plan section 4).
 *
 * Brent-inspired, not Brent cycle detection: attracting orbits converge
 * asymptotically and do not repeat exactly in binary64, so checkpoint
 * proximity only PROPOSES a lag to the common verifier, it never
 * classifies. Frozen policy (the plan requires freezing the schedule,
 * tolerances, rejection budget, and fallback before benchmarking):
 *
 * 1. The checkpoint starts at the orbit seed z_0 = 0 with interval 1.
 * 2. From cycleWarmup on, outside a rejection re-arm wait, and while the
 *    rejected-candidate budget lasts, every step compares z_n with the
 *    retained checkpoint z_k (lag q = n - k) at the scale-aware permissive
 *    tauCandidate; a hit with q <= maxPeriod (the systematic ceiling, so
 *    proposals stay in the systematic period bucket) proposes (z_n, q).
 *    The whole Brent bookkeeping (comparisons and interval updates) is
 *    gated on cycleWarmup exactly like the legacy scan, keeping the
 *    schedule deterministic in the warmup option.
 * 3. Rejection-retry is frozen: a failed proposal suppresses comparisons
 *    AND checkpoint updates for a doubling re-arm gap (1, 2, 4, ...), then
 *    comparisons resume against the SAME retained state, so the failed
 *    candidate is retested after a longer, better-converged lag instead of
 *    being dropped through a full interval. The gap doubles again on each
 *    further failure.
 * 4. Outside a re-arm wait and without a proposal on that step, when
 *    q >= interval the current state becomes the next checkpoint and the
 *    interval doubles, capped at maxPeriod (the systematic period ceiling).
 * 5. The shared rejected-candidate budget (ProposalBudget) stops all
 *    proposals and their comparisons for the pixel once exhausted; the
 *    orbit walk continues so escape classification is unaffected.
 * 6. On unresolved orbit-budget end the default-on exhaustion scan runs one
 *    full lag scan from the final state (plan section 4).
 *
 * The first proposal on a period-p orbit typically carries lag q = m p
 * (a multiple of p): the verifier's proper-divisor reduction returns the
 * primitive period, which is what gets reported.
 */

import {
  acceptedResult,
  analyticInterior,
  emptyMetrics,
  fullLagScan,
  kappaOf,
  proposalThresholdSquared,
  ProposalBudget,
  verifyCandidate,
  type LagScanContext,
} from './shared.ts';
import type { ClassificationKernel, KernelOptions, KernelResult } from './shared.ts';

export const CHECKPOINT_REVISION = 'poc-checkpoint-1.0.0';

export class CheckpointKernel implements ClassificationKernel {
  public readonly name = 'checkpoint' as const;
  // History of the last maxPeriod + 1 states, used only by the exhaustion scan.
  #historyRe: Float64Array;
  #historyIm: Float64Array;
  #budget = new ProposalBudget();
  #scan: LagScanContext;

  public constructor(maxPeriod = 64) {
    const capacity = Math.max(2, Math.ceil(maxPeriod) + 1);
    this.#historyRe = new Float64Array(capacity);
    this.#historyIm = new Float64Array(capacity);
    this.#scan = {
      cRe: 0,
      cIm: 0,
      zRe: 0,
      zIm: 0,
      iteration: 0,
      maxPeriod,
      historyRe: this.#historyRe,
      historyIm: this.#historyIm,
      metrics: emptyMetrics(),
      budget: this.#budget,
    };
  }

  public classify(cRe: number, cIm: number, options: KernelOptions): KernelResult {
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
    this.#scan.metrics = metrics;
    this.#scan.cRe = cRe;
    this.#scan.cIm = cIm;
    this.#scan.maxPeriod = maxPeriod;

    let zRe = 0;
    let zIm = 0;
    let checkpointRe = 0;
    let checkpointIm = 0;
    let checkpointIteration = 0;
    let interval = 1;
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

      if (iteration >= options.cycleWarmup && iteration >= reArmAt && !this.#budget.isExhausted()) {
        const lag = iteration - checkpointIteration;
        metrics.lagComparisons += 1;
        const distanceRe = zRe - checkpointRe;
        const distanceIm = zIm - checkpointIm;
        if (
          distanceRe * distanceRe + distanceIm * distanceIm <= proposalThresholdSquared(zRe, zIm) &&
          lag <= maxPeriod
        ) {
          const candidate = verifyCandidate(cRe, cIm, zRe, zIm, lag, metrics, this.#budget);
          if (candidate !== undefined) {
            return acceptedResult('checkpoint-candidate', iteration, candidate, metrics);
          }
          // Frozen rejection-retry: retain the checkpoint and re-arm.
          reArmAt = iteration + reArmGap;
          reArmGap *= 2;
        } else if (lag >= interval) {
          // Interval exhausted: the current state becomes the next checkpoint.
          checkpointRe = zRe;
          checkpointIm = zIm;
          checkpointIteration = iteration;
          interval = Math.min(interval * 2, maxPeriod);
        }
      }
    }

    if (options.exhaustionScan && !this.#budget.isExhausted()) {
      this.#scan.zRe = zRe;
      this.#scan.zIm = zIm;
      this.#scan.iteration = options.maxIterations;
      const candidate = fullLagScan(this.#scan);
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
}
