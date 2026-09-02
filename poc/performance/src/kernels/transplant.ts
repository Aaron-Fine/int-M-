/**
 * Adjacent-pixel transplantation with the multiplier-map attempt guard
 * (plan section 6 conditioning guard, workstream G pipeline shape).
 *
 * The kernel keeps the last verified-accepting cycle (period p, cycle point
 * z*, multiplier lambda at parameter c_seed) as a persistent seed. For a
 * new pixel it predicts the neighboring cycle point via the plan section 6
 * parameter derivative
 *
 *     B_{j+1} = 2 z_j B_j + 1 (B_0 = 0) over one cycle  =>  B_cycle = df^p/dc,
 *     dz-star/dc = B_cycle / (1 - lambda),
 *     z_pred = z* + (dz-star/dc) * (c - c_seed),
 *
 * with B_cycle computed by running the seed's cycle forward ONCE with the
 * B recurrence (bounded, once per attempt). The first-order displacement
 * |B_cycle| * |dc| / |1 - lambda| is the plan's attempt-region guard: it is
 * derived from the multiplier map rather than tuned constants and degrades
 * exactly as lambda -> 1 (near parabolic boundaries the guard refuses the
 * attempt and the pixel falls back to the schedule kernel). At
 * superattracting centers lambda = 0 the formula is well-conditioned
 * (1 - lambda = 1); the plan's Koenigs/Bottcher caveat concerns linearization
 * theory beyond this PoC and does not affect the first-order seed.
 *
 * Frozen policy:
 * 1. Analytic fast paths first (shared with every kernel).
 * 2. Attempt only when a seed exists and the guard passes; refusals and
 *    missing seeds fall back to the checkpoint kernel for the whole pixel
 *    (its acceptance updates the seed through a deterministic orbit
 *    replay; analytic acceptances carry no cycle point and never seed -
 *    documented PoC simplification).
 * 3. Newton correction: at most TRANSPLANT_THRESHOLDS.newtonSteps (3,
 *    workstream G gate) iterations of z <- z - (f^p(z) - z)/(lambda - 1) in
 *    binary64 against the NEW parameter, lambda recomputed per step by the
 *    p-step derivative walk. A denominator |lambda - 1| below the frozen
 *    floor, or any non-finite state, abandons the attempt.
 * 4. One verifier proposal per attempt with the corrected seed; the common
 *    verifier alone classifies (transplant hits are ordinary accepted
 *    cycles; Newton converging to a repelling or lower-period root is the
 *    verifier's divisor/rejection problem, not the transplant's). The
 *    attempt consumes at most one verifier call beyond the fallback
 *    kernel's own per-pixel budget instance (bounded, counted in
 *    verifierCalls).
 * 5. The shared rejected-candidate budget applies; a rejected attempt
 *    falls back to the schedule kernel for the pixel.
 *
 * The seed persists across classify calls (raster order = call order);
 * classifySeedless equivalence holds whenever the guard refuses (far dc,
 * lambda near 1) - which is what the bucket report measures.
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
import { CheckpointKernel } from './checkpoint.ts';
import {
  buildSeed,
  cyclePointAt,
  predictCyclePoint,
  walkWithDerivative,
  type TransplantSeed,
} from './seed-common.ts';
import type { ClassificationKernel, KernelMetrics, KernelOptions, KernelResult } from './shared.ts';

export const TRANSPLANT_REVISION = 'poc-transplant-1.0.0';

/**
 * Frozen transplant policy. Provenance:
 * - guardDisplacement = 1e-2: the plan section 6 conditioning guard bounds
 *   the first-order seed displacement |B_cycle|*|dc|/|1-lambda|; 1e-2 keeps
 *   the predicted seed two orders below unit scale, safely inside the local
 *   basin of a hyperbolic cycle at corpus parameter scales. An
 *   over-permissive guard costs wasted attempts (verifier-rejected), never
 *   wrong results, and the bound degrades exactly as lambda -> 1.
 * - newtonSteps = 3: the workstream G ship gate assumes convergence within
 *   3 corrections (">=90% of eligible attempts converge in <=3 corrections").
 * - newtonDenominatorMin = 1e-12: binary64 floor for |lambda - 1|; below it
 *   the Newton direction is numerically meaningless. Belt-and-braces only -
 *   the displacement guard already refuses the lambda -> 1 regime.
 */
export const TRANSPLANT_THRESHOLDS = Object.freeze({
  guardDisplacement: 1e-2,
  newtonSteps: 3,
  newtonDenominatorMin: 1e-12,
});

type AttemptOutcome =
  | {
      readonly kind: 'hit';
      readonly candidate: AcceptedCandidate;
      readonly zRe: number;
      readonly zIm: number;
    }
  | { readonly kind: 'guard-refused' }
  | { readonly kind: 'rejected' };

export class TransplantKernel implements ClassificationKernel {
  public readonly name = 'transplant' as const;
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
      // Analytic results carry no cycle point: the seed is unchanged.
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
    if (seed !== undefined) {
      metrics.transplantAttempts = (metrics.transplantAttempts ?? 0) + 1;
      metrics.transplantSeedLambda = seed.lambdaMagnitude;
      const outcome = this.#attempt(cRe, cIm, seed, metrics);
      if (outcome.kind === 'guard-refused') {
        metrics.transplantGuardRefusals = (metrics.transplantGuardRefusals ?? 0) + 1;
      } else if (outcome.kind === 'hit') {
        const { candidate } = outcome;
        this.#seed = buildSeed(cRe, cIm, candidate, outcome.zRe, outcome.zIm);
        return acceptedResult('transplant-hit', 0, candidate, metrics);
      }
    }

    // Fallback: the schedule kernel classifies the whole pixel. The
    // attempt counters live on this classify's metrics record, so they are
    // merged into the fallback result (the fallback builds its own).
    const result = this.#fallback.classify(cRe, cIm, options);
    if (metrics.transplantAttempts !== undefined) {
      result.metrics.transplantAttempts = metrics.transplantAttempts;
    }
    if (metrics.transplantGuardRefusals !== undefined) {
      result.metrics.transplantGuardRefusals = metrics.transplantGuardRefusals;
    }
    if (metrics.transplantSeedLambda !== undefined) {
      result.metrics.transplantSeedLambda = metrics.transplantSeedLambda;
    }
    if (result.status === 'attracting' && !result.evidence.startsWith('analytic-')) {
      // Deterministic orbit replay recovers the accepted cycle point at the
      // acceptance iteration (only on fallback acceptances: rare on
      // coherent grids).
      const cycle = cyclePointAt(cRe, cIm, result.iterations);
      if (cycle !== undefined) {
        this.#seed = buildSeed(cRe, cIm, result, cycle[0], cycle[1]);
      }
    }
    return result;
  }

  /**
   * One transplant attempt: guard, predict, Newton, verify. Allocation-free
   * beyond the verifier call the shared proposal path already makes.
   */
  #attempt(cRe: number, cIm: number, seed: TransplantSeed, metrics: KernelMetrics): AttemptOutcome {
    const prediction = predictCyclePoint(seed, cRe, cIm, TRANSPLANT_THRESHOLDS.guardDisplacement);
    if (prediction === undefined) {
      return { kind: 'guard-refused' };
    }
    let pzRe = prediction.zPredRe;
    let pzIm = prediction.zPredIm;

    // Newton corrections in binary64 against the NEW parameter.
    for (let step = 0; step < TRANSPLANT_THRESHOLDS.newtonSteps; step += 1) {
      const walked = walkWithDerivative(cRe, cIm, pzRe, pzIm, seed.period);
      if (!walked.finite) {
        return { kind: 'rejected' };
      }
      const fRe = walked.endRe - pzRe;
      const fIm = walked.endIm - pzIm;
      const denomRe = walked.lambdaRe - 1;
      const denomIm = walked.lambdaIm;
      const denomSq = denomRe * denomRe + denomIm * denomIm;
      if (Math.sqrt(denomSq) < TRANSPLANT_THRESHOLDS.newtonDenominatorMin || denomSq === 0) {
        return { kind: 'rejected' };
      }
      pzRe -= (fRe * denomRe + fIm * denomIm) / denomSq;
      pzIm -= (fIm * denomRe - fRe * denomIm) / denomSq;
      if (!Number.isFinite(pzRe) || !Number.isFinite(pzIm)) {
        return { kind: 'rejected' };
      }
    }

    const candidate = verifyCandidate(cRe, cIm, pzRe, pzIm, seed.period, metrics, this.#budget);
    if (candidate === undefined) {
      return { kind: 'rejected' };
    }
    return { kind: 'hit', candidate, zRe: pzRe, zIm: pzIm };
  }
}
