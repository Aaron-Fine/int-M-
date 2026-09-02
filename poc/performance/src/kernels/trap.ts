/**
 * Trap-radius early accept (plan workstream L, research-only, oracle-gated).
 *
 * Research question: can a numerically estimated trapping disk around a
 * verified NEIGHBOR cycle accept a pixel before the orbit converges to the
 * tauAccept closure scale, without weakening the common verifier?
 *
 * Pipeline (frozen before benchmarking):
 *
 * 1. Analytic fast paths first (shared with every kernel).
 * 2. Persistent seed: the last verified-accepting cycle (period p, cycle
 *    point z*, multiplier lambda, seed parameter) - identical machinery to
 *    the transplant kernel. Analytic acceptances never seed.
 * 3. Attempt gate: the seed must target the weak-attraction regime
 *    (|lambda| >= TRAP_THRESHOLDS.minLambda) and the plan section 6
 *    first-order displacement |B_cycle| * |dc| / |1 - lambda| must stay
 *    inside the frozen transplant guard; otherwise the pixel falls back to
 *    the checkpoint kernel whole (the guard degrades exactly as
 *    lambda -> 1, the graceful-degradation requirement of plan section 12).
 * 4. Trapping disk: center = the predicted neighboring cycle point, radius
 *    R = TRAP_THRESHOLDS.diskFactor * |1 - lambda| * max(1, |z_pred|).
 *    Provenance: inside such a disk the p-step map's quadratic deviation is
 *    O(R^2) while the linear drift is O(R * |1 - lambda|), so the disk sits
 *    in the linear (contracting) regime of f_c^p and Newton-from-entry
 *    converges in O(1) steps; the factor 4 keeps reach well above the
 *    tauCandidate proximity scale down to |1 - lambda| ~ 2.5e-9.
 * 5. Orbit walk from 0 with the escape check. On disk entry (and then every
 *    reproduceInterval steps while inside, at most maxProposals per pixel):
 *    compute the PER-PIXEL multiplier lambda_n = (f^p)'(z_n) by one p-step
 *    walk (counted in trapOrbitWork), require |lambda_n| < 1 - the
 *    verifier's attraction margin (per-pixel contraction; the criterion
 *    never assumes the seed's lambda), Newton-polish z_n against period p
 *    (at most newtonSteps steps in binary64, denominator floor as in the
 *    transplant), require the polished residual below the verifier's
 *    divisor-separation scale (polishTolerance), then propose to the common
 *    verifier - the sole acceptance authority, unchanged.
 * 6. Accepted: evidence 'trap-hit', the seed updates to the polished cycle.
 *    Anything else (proposal cap, budget death, orbit budget end) falls
 *    back to the checkpoint kernel for the whole pixel; its acceptance
 *    reseeds deterministically. There are NO lag comparisons in the trap
 *    walk - savings and overhead are iteration-counted.
 *
 * Oracle gate: the runner adjudicates every trap acceptance against the dd
 * oracle; any false attracting result or wrong primitive period fails the
 * run (plan workstream L kill gate), which this kernel accepts as the
 * experiment's outcome rather than defending against.
 */

import {
  acceptedResult,
  analyticInterior,
  emptyMetrics,
  kappaOf,
  ProposalBudget,
  verifyCandidate,
  type AcceptedCandidate,
} from './shared.ts';
import { VERIFIER_THRESHOLDS } from '../verifier.ts';
import { CheckpointKernel } from './checkpoint.ts';
import {
  buildSeed,
  cyclePointAt,
  predictCyclePoint,
  walkWithDerivative,
  type TransplantSeed,
} from './seed-common.ts';
import { TRANSPLANT_THRESHOLDS } from './transplant.ts';
import type { ClassificationKernel, KernelMetrics, KernelOptions, KernelResult } from './shared.ts';

export const TRAP_REVISION = 'poc-trap-1.0.0';

/**
 * Frozen trap policy. Provenance:
 * - minLambda = 0.8: below |lambda| ~ 0.8 the checkpoint schedule detects
 *   within ~85 iterations at corpus convergence scales, leaving little for
 *   the trap to save; the weak-attraction strata workstream L targets sit
 *   at |lambda| in [0.8, 1). PoC policy choice, frozen before benchmarking.
 * - diskFactor = 4: see the trapping-disk note above (linear-regime reach).
 * - reproduceInterval = 8: re-proposal cadence while the orbit remains
 *   inside the disk; bounds the per-pixel polish overhead.
 * - maxProposals = 8: per-pixel proposal cap; afterwards the pixel falls
 *   back to the schedule kernel (bounds the worst-case overhead at
 *   ~2x the checkpoint walk).
 * - newtonSteps = 4: polish depth (the dd oracle uses 8 in ~1e-32
 *   arithmetic; binary64 needs fewer steps at disk-entry distances).
 * - polishTolerance = 1e-6 = the verifier's tauExclude: a polish that
 *   cannot reach the divisor-separation scale will not close within
 *   acceptance, so the proposal is skipped instead of burning budget.
 * - denominatorMin = 1e-12: binary64 Newton denominator floor (transplant
 *   convention).
 */
export const TRAP_THRESHOLDS = Object.freeze({
  minLambda: 0.8,
  diskFactor: 4,
  reproduceInterval: 8,
  maxProposals: 8,
  newtonSteps: 4,
  polishTolerance: VERIFIER_THRESHOLDS.tauExclude,
  denominatorMin: 1e-12,
});

export class TrapKernel implements ClassificationKernel {
  public readonly name = 'trap' as const;
  readonly #fallback: CheckpointKernel;
  readonly #budget = new ProposalBudget();
  #seed: TransplantSeed | undefined;

  public constructor(maxPeriod = 64) {
    this.#fallback = new CheckpointKernel(maxPeriod);
  }

  /** Clear the persistent seed (each runner pass starts unseeded). */
  public resetSeed(): void {
    this.#seed = undefined;
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

    const seed = this.#seed;
    if (
      seed !== undefined &&
      seed.lambdaMagnitude >= TRAP_THRESHOLDS.minLambda &&
      seed.lambdaMagnitude < 1 - VERIFIER_THRESHOLDS.attractMargin
    ) {
      metrics.transplantAttempts = (metrics.transplantAttempts ?? 0) + 1;
      metrics.transplantSeedLambda = seed.lambdaMagnitude;
      const prediction = predictCyclePoint(seed, cRe, cIm, TRANSPLANT_THRESHOLDS.guardDisplacement);
      if (prediction !== undefined) {
        const trapped = this.#trapWalk(
          cRe,
          cIm,
          options,
          seed,
          prediction.zPredRe,
          prediction.zPredIm,
          metrics,
        );
        if (trapped !== undefined) {
          this.#mergeTrapMetrics(trapped.metrics, metrics);
          return trapped;
        }
      } else {
        metrics.transplantGuardRefusals = (metrics.transplantGuardRefusals ?? 0) + 1;
      }
    }

    // Fallback: the schedule kernel classifies the whole pixel.
    const result = this.#fallback.classify(cRe, cIm, options);
    this.#mergeTrapMetrics(result.metrics, metrics);
    if (result.status === 'attracting' && !result.evidence.startsWith('analytic-')) {
      const cycle = cyclePointAt(cRe, cIm, result.iterations);
      if (cycle !== undefined) {
        this.#seed = buildSeed(cRe, cIm, result, cycle[0], cycle[1]);
      }
    }
    return result;
  }

  /** Merge this classify's trap/seed counters into the returned record. */
  #mergeTrapMetrics(into: KernelMetrics, from: KernelMetrics): void {
    if (from.transplantAttempts !== undefined) {
      into.transplantAttempts = from.transplantAttempts;
    }
    if (from.transplantGuardRefusals !== undefined) {
      into.transplantGuardRefusals = from.transplantGuardRefusals;
    }
    if (from.transplantSeedLambda !== undefined) {
      into.transplantSeedLambda = from.transplantSeedLambda;
    }
    if (from.trapProposals !== undefined) {
      into.trapProposals = from.trapProposals;
    }
    if (from.trapNewtonFailures !== undefined) {
      into.trapNewtonFailures = from.trapNewtonFailures;
    }
    if (from.trapOrbitWork !== undefined) {
      into.trapOrbitWork = from.trapOrbitWork;
    }
  }

  /**
   * Newton polish of (zRe, zIm) against the seed period at this pixel.
   * Returns the polished point, or undefined when the polish failed
   * (non-finite, denominator floor, or residual above polishTolerance).
   * Counts every p-step walk in orbitWork.
   */
  #polish(
    cRe: number,
    cIm: number,
    zRe: number,
    zIm: number,
    period: number,
    scale: number,
    orbitWork: { value: number },
  ): [number, number] | undefined {
    let pzRe = zRe;
    let pzIm = zIm;
    for (let step = 0; step < TRAP_THRESHOLDS.newtonSteps; step += 1) {
      const walked = walkWithDerivative(cRe, cIm, pzRe, pzIm, period);
      orbitWork.value += period;
      if (!walked.finite) {
        return undefined;
      }
      const residualRe = walked.endRe - pzRe;
      const residualIm = walked.endIm - pzIm;
      if (Math.hypot(residualRe, residualIm) <= TRAP_THRESHOLDS.polishTolerance * scale) {
        return [pzRe, pzIm];
      }
      const denomRe = walked.lambdaRe - 1;
      const denomIm = walked.lambdaIm;
      const denomSq = denomRe * denomRe + denomIm * denomIm;
      if (Math.sqrt(denomSq) < TRAP_THRESHOLDS.denominatorMin || denomSq === 0) {
        return undefined;
      }
      pzRe -= (residualRe * denomRe + residualIm * denomIm) / denomSq;
      pzIm -= (residualIm * denomRe - residualRe * denomIm) / denomSq;
      if (!Number.isFinite(pzRe) || !Number.isFinite(pzIm)) {
        return undefined;
      }
    }
    return undefined;
  }

  /**
   * The trapping walk. Returns the final KernelResult, or undefined when
   * the pixel must fall back to the schedule kernel.
   */
  #trapWalk(
    cRe: number,
    cIm: number,
    options: KernelOptions,
    seed: TransplantSeed,
    zPredRe: number,
    zPredIm: number,
    metrics: KernelMetrics,
  ): KernelResult | undefined {
    const period = seed.period;
    const scale = Math.max(1, Math.abs(zPredRe), Math.abs(zPredIm));
    const radius = TRAP_THRESHOLDS.diskFactor * (1 - seed.lambdaMagnitude) * scale;
    const radiusSquared = radius * radius;
    const attractBound = 1 - VERIFIER_THRESHOLDS.attractMargin;
    let zRe = 0;
    let zIm = 0;
    let proposals = 0;
    let stepsSinceProposal = Number.POSITIVE_INFINITY;
    let orbitWork = 0;

    for (let iteration = 1; iteration <= options.maxIterations; iteration += 1) {
      const nextRe = zRe * zRe - zIm * zIm + cRe;
      zIm = 2 * zRe * zIm + cIm;
      zRe = nextRe;
      if (zRe * zRe + zIm * zIm > 4) {
        return {
          status: 'escaped',
          iterations: iteration,
          evidence: 'escape-radius',
          metrics,
          escapeIteration: iteration,
          magnitudeSquared: zRe * zRe + zIm * zIm,
        };
      }
      if (iteration < options.cycleWarmup || this.#budget.isExhausted()) {
        continue;
      }
      const dRe = zRe - zPredRe;
      const dIm = zIm - zPredIm;
      const inside = dRe * dRe + dIm * dIm <= radiusSquared;
      stepsSinceProposal += 1;
      if (
        !inside ||
        proposals >= TRAP_THRESHOLDS.maxProposals ||
        (proposals > 0 && stepsSinceProposal < TRAP_THRESHOLDS.reproduceInterval)
      ) {
        continue;
      }

      proposals += 1;
      stepsSinceProposal = 0;
      metrics.trapProposals = (metrics.trapProposals ?? 0) + 1;
      // Per-pixel multiplier at the trapped point (contracting check).
      const trapped = walkWithDerivative(cRe, cIm, zRe, zIm, period);
      orbitWork += period;
      if (!trapped.finite) {
        return {
          status: 'escaped',
          iterations: iteration,
          evidence: 'escape-radius',
          metrics,
          escapeIteration: iteration,
          magnitudeSquared: trapped.endRe * trapped.endRe + trapped.endIm * trapped.endIm,
        };
      }
      const lambdaMagnitude = Math.hypot(trapped.lambdaRe, trapped.lambdaIm);
      if (lambdaMagnitude >= attractBound) {
        continue;
      }
      const work = { value: orbitWork };
      const polishedPoint = this.#polish(cRe, cIm, zRe, zIm, period, scale, work);
      orbitWork = work.value;
      if (polishedPoint === undefined) {
        metrics.trapNewtonFailures = (metrics.trapNewtonFailures ?? 0) + 1;
        continue;
      }
      const candidate: AcceptedCandidate | undefined = verifyCandidate(
        cRe,
        cIm,
        polishedPoint[0],
        polishedPoint[1],
        period,
        metrics,
        this.#budget,
      );
      if (candidate !== undefined) {
        metrics.trapOrbitWork = orbitWork;
        this.#seed = buildSeed(cRe, cIm, candidate, polishedPoint[0], polishedPoint[1]);
        return acceptedResult('trap-hit', iteration, candidate, metrics);
      }
    }
    metrics.trapOrbitWork = orbitWork;
    return undefined;
  }
}
