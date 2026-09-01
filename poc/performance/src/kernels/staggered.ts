/**
 * Staggered harmonic lag testing (plan section 4).
 *
 * Lag p is tested only every p-th iteration (p divides n), which drops the
 * average comparisons per iteration from maxPeriod to H(maxPeriod) ~ 4 at
 * 32 and delays detection by less than p iterations. Frozen policy:
 *
 * 1. From cycleWarmup on, and while the shared rejected-candidate budget
 *    lasts, iteration n evaluates lags p <= min(maxPeriod, n - 1) with
 *    p | n at the scale-aware permissive tauCandidate; hits propose (z_n, p)
 *    to the common verifier.
 * 2. Unlike checkpoint and trigger, no explicit re-arm is needed: a failed
 *    candidate for lag p is retried naturally at the next multiple n + p.
 * 3. The shared rejected-candidate budget stops all comparisons and
 *    proposals for the pixel once exhausted (an exact float64 repelling
 *    cycle would otherwise re-propose every p steps forever); the orbit
 *    walk continues so escape classification is unaffected.
 * 4. On unresolved orbit-budget end the default-on exhaustion scan runs one
 *    full lag scan from the final state (plan section 4).
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

export const STAGGERED_REVISION = 'poc-staggered-1.0.0';

export class StaggeredKernel implements ClassificationKernel {
  public readonly name = 'staggered' as const;
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
    const budget = this.#budget;
    budget.reset();

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

      if (iteration >= options.cycleWarmup && !budget.isExhausted()) {
        const largestPeriod = Math.min(maxPeriod, iteration - 1);
        const candidateSquared = proposalThresholdSquared(zRe, zIm);
        for (let period = 1; period <= largestPeriod; period += 1) {
          if (iteration % period !== 0) {
            continue;
          }
          const previousIndex = (iteration - 1 - period) % capacity;
          const distanceRe = zRe - (this.#historyRe[previousIndex] ?? Number.NaN);
          const distanceIm = zIm - (this.#historyIm[previousIndex] ?? Number.NaN);
          metrics.lagComparisons += 1;
          if (distanceRe * distanceRe + distanceIm * distanceIm > candidateSquared) {
            continue;
          }
          if (budget.isExhausted()) {
            break;
          }
          const candidate = verifyCandidate(cRe, cIm, zRe, zIm, period, metrics, budget);
          if (candidate !== undefined) {
            return acceptedResult('staggered-lag', iteration, candidate, metrics);
          }
        }
      }
    }

    if (options.exhaustionScan && !budget.isExhausted()) {
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
      evidence: budget.isExhausted() ? 'candidate-budget-exhausted' : 'iteration-limit',
      metrics,
    };
  }
}
