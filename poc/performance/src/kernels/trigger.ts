/**
 * Convergence-triggered single scan (plan section 4).
 *
 * Per iteration a scale-aware step gate compares |z_n - z_{n-1}| against a
 * threshold; only when it fires does the kernel run one full lag scan from
 * the current state via the shared fullLagScan. Frozen policy:
 *
 * 1. The gate threshold starts at the permissive proposal threshold
 *    tauCandidate (verifier policy) and is scale-aware: the step distance is
 *    compared against gate * max(1, |z_n|).
 * 2. A fired gate runs one full lag scan (lags 1..min(maxPeriod, n - 1))
 *    with tauCandidate proposals and common-verifier acceptance.
 * 3. A failed scan consumes one scan of the per-pixel scan cap (8, so the
 *    eighth re-arm threshold reaches ~tauCandidate / 4^7 ~ 1.5e-13, well
 *    below the tauAccept-based acceptance scale) and re-arms the trigger at
 *    a quarter of the previous threshold (plan section 4).
 * 4. The shared rejected-candidate budget bounds verifier calls across all
 *    scans and the exhaustion scan; when it is exhausted the gate and scans
 *    stop for the pixel (the orbit walk continues for escape status).
 * 5. On unresolved orbit-budget end the default-on exhaustion scan runs one
 *    final full lag scan (plan section 4).
 *
 * The gate evaluation itself is a step comparison, not a candidate lag
 * evaluation, so it is not counted in lagComparisons.
 */

import {
  acceptedResult,
  analyticInterior,
  emptyMetrics,
  fullLagScan,
  kappaOf,
  ProposalBudget,
  type LagScanContext,
} from './shared.ts';
import { VERIFIER_THRESHOLDS } from '../verifier.ts';
import type { ClassificationKernel, KernelOptions, KernelResult } from './shared.ts';

/**
 * Frozen trigger policy (plan section 4). Provenance: initialGate is the
 * verifier policy's permissive tauCandidate so trigger proposals and
 * checkpoint proposals share one proposal threshold; gateReArmDivisor = 4 is
 * the plan's quarter-threshold re-arm; maxScansPerPixel bounds the number of
 * O(maxPeriod) scans per pixel (plan: "a bounded number of scans").
 */
export const TRIGGER_REVISION = 'poc-trigger-1.0.0';

export const TRIGGER_THRESHOLDS = Object.freeze({
  initialGate: VERIFIER_THRESHOLDS.tauCandidate,
  gateReArmDivisor: 4,
  maxScansPerPixel: 8,
});

export class TriggerKernel implements ClassificationKernel {
  public readonly name = 'trigger' as const;
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
    this.#scan.metrics = metrics;
    this.#scan.cRe = cRe;
    this.#scan.cIm = cIm;
    this.#scan.maxPeriod = options.maxPeriod;

    let zRe = 0;
    let zIm = 0;
    let previousRe = 0;
    let previousIm = 0;
    let gate = TRIGGER_THRESHOLDS.initialGate;
    let scansUsed = 0;

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

      if (
        iteration >= options.cycleWarmup &&
        scansUsed < TRIGGER_THRESHOLDS.maxScansPerPixel &&
        !this.#budget.isExhausted()
      ) {
        const scale = Math.max(1, Math.abs(zRe), Math.abs(zIm));
        const stepRe = zRe - previousRe;
        const stepIm = zIm - previousIm;
        const gateSquared = gate * gate * scale * scale;
        if (stepRe * stepRe + stepIm * stepIm <= gateSquared) {
          this.#scan.zRe = zRe;
          this.#scan.zIm = zIm;
          this.#scan.iteration = iteration;
          const candidate = fullLagScan(this.#scan);
          if (candidate !== undefined) {
            return acceptedResult('trigger-scan', iteration, candidate, metrics);
          }
          // Failed scan: consume the cap and re-arm at a quarter threshold.
          scansUsed += 1;
          gate /= TRIGGER_THRESHOLDS.gateReArmDivisor;
        }
      }

      previousRe = zRe;
      previousIm = zIm;
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
