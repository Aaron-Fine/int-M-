/**
 * Shared contracts and closed-form helpers for the PoC kernels.
 *
 * Kernels are allocation-free: c enters as two numbers, scratch storage is
 * preallocated per kernel instance, and the only per-classify allocation is
 * the returned result object (mirroring the production result boundary).
 */

import { VERIFIER_THRESHOLDS, verifyCycle } from '../verifier.ts';

export interface KernelMetrics {
  /** Primary deterministic cost metric: candidate lag distance evaluations. */
  lagComparisons: number;
  /** Verifier / multiplier verifications attempted on proposed candidates. */
  verifierCalls: number;
  /** Verifier verdicts of 'unresolved' (primitivity or closure ambiguous). */
  verifierAmbiguous: number;
  /** Verifier rejections by reason (plan section 3 verdict taxonomy). */
  rejectedNonFinite: number;
  rejectedNoClosure: number;
  rejectedNotAttracting: number;
  /**
   * Variant-specific counters, undefined for kernels that do not use them
   * (JSON omits undefined fields). Mutable: kernels initialize and
   * increment them on their own metrics record.
   * - deGuessRounds: DE-plausibility extension rounds entered (de-guess).
   * - transplantAttempts / transplantGuardRefusals: transplant pipeline
   *   attempts and first-order-guard refusals (transplant, trap).
   * - trapProposals / trapNewtonFailures / trapOrbitWork: trapping-disk
   *   proposals, failed Newton polishes, and the extra orbit steps the trap
   *   walk spent on polish/proposal work beyond the main orbit loop (trap).
   */
  deGuessRounds?: number;
  transplantAttempts?: number;
  transplantGuardRefusals?: number;
  /** The persistent seed's |lambda| at attempt time (transplant/trap). */
  transplantSeedLambda?: number;
  trapProposals?: number;
  trapNewtonFailures?: number;
  trapOrbitWork?: number;
}

/**
 * Discriminated result union: each status carries exactly the fields the
 * production result boundary would carry for that status.
 */
export type KernelResult =
  | {
      readonly status: 'attracting';
      readonly iterations: number;
      readonly evidence: string;
      readonly metrics: KernelMetrics;
      readonly period: number;
      readonly multiplierMagnitude: number;
      readonly multiplierAngle: number;
      readonly kappa: number;
    }
  | {
      readonly status: 'escaped';
      readonly iterations: number;
      readonly evidence: string;
      readonly metrics: KernelMetrics;
      readonly escapeIteration: number;
      readonly magnitudeSquared: number;
    }
  | {
      readonly status: 'unresolved';
      readonly iterations: number;
      readonly evidence: string;
      readonly metrics: KernelMetrics;
    };

export interface KernelOptions {
  readonly maxIterations: number;
  readonly maxPeriod: number;
  readonly cycleTolerance: number;
  readonly cycleWarmup: number;
  /** Default-on exhaustion scan for the schedule kernels (plan section 4). */
  readonly exhaustionScan: boolean;
}

export interface ClassificationKernel {
  readonly name:
    | 'control'
    | 'checkpoint'
    | 'trigger'
    | 'staggered'
    | 'de-guess'
    | 'neighbor'
    | 'transplant'
    | 'trap';
  classify(cRe: number, cIm: number, options: KernelOptions): KernelResult;
}

export const emptyMetrics = (): KernelMetrics => ({
  lagComparisons: 0,
  verifierCalls: 0,
  verifierAmbiguous: 0,
  rejectedNonFinite: 0,
  rejectedNoClosure: 0,
  rejectedNotAttracting: 0,
});

/** Principal square root, ported from src/domain/complex.ts to stay self-contained. */
export const complexSqrt = (re: number, im: number): [number, number] => {
  const magnitude = Math.hypot(re, im);
  const rootRe = Math.sqrt(Math.max(0, (magnitude + re) / 2));
  const rootImMagnitude = Math.sqrt(Math.max(0, (magnitude - re) / 2));
  return [rootRe, im < 0 ? -rootImMagnitude : rootImMagnitude];
};

export const kappaOf = (multiplierMagnitude: number, period: number): number =>
  multiplierMagnitude === 0 ? Number.POSITIVE_INFINITY : -Math.log(multiplierMagnitude) / period;

export interface AnalyticCycle {
  readonly period: number;
  readonly multiplierRe: number;
  readonly multiplierIm: number;
  readonly evidence: 'analytic-main-cardioid' | 'analytic-period-2-bulb';
}

/**
 * Main-cardioid and period-2 bulb membership with exact multiplier formulas,
 * ported from src/domain/orbit.ts analyticInterior (plan section 4 preserves
 * these cheap closed-form paths in every kernel).
 */
export const analyticInterior = (cRe: number, cIm: number): AnalyticCycle | undefined => {
  const x = cRe;
  const ySquared = cIm * cIm;
  const cardioidX = x - 0.25;
  const q = cardioidX * cardioidX + ySquared;

  if (q * (q + cardioidX) < 0.25 * ySquared) {
    const [rootRe, rootIm] = complexSqrt(1 - 4 * x, -4 * cIm);
    return {
      period: 1,
      multiplierRe: 1 - rootRe,
      multiplierIm: -rootIm,
      evidence: 'analytic-main-cardioid',
    };
  }

  const bulbX = x + 1;
  if (bulbX * bulbX + ySquared < 1 / 16) {
    return {
      period: 2,
      multiplierRe: 4 * bulbX,
      multiplierIm: 4 * cIm,
      evidence: 'analytic-period-2-bulb',
    };
  }

  return undefined;
};

/**
 * Bounded rejected-candidate budget per pixel, shared by the schedule
 * kernels. Provenance: matches the dd oracle's candidateVerifyBudget = 64
 * (poc/performance/src/oracle/classify-dd.ts), so no kernel spends more
 * verifier calls on adversarial repeats than the oracle itself allows.
 * Every non-accepted verdict (rejected or ambiguous) consumes budget; once
 * exhausted the kernel stops proposing (and stops paying for the
 * comparisons that only exist to propose) for the rest of the pixel,
 * including the exhaustion scan. The orbit walk continues so escape
 * classification stays independent of the budget.
 */
export const CANDIDATE_REJECTION_BUDGET = 64;

export class ProposalBudget {
  #failed = 0;

  public reset(): void {
    this.#failed = 0;
  }

  // Deliberately a method, not a getter: calls invalidate control-flow
  // narrowing, so per-step budget re-checks after verifyCandidate typecheck.
  public isExhausted(): boolean {
    return this.#failed >= CANDIDATE_REJECTION_BUDGET;
  }

  public recordFailure(): void {
    this.#failed += 1;
  }
}

export interface AcceptedCandidate {
  readonly period: number;
  readonly multiplierMagnitude: number;
  readonly multiplierAngle: number;
  readonly kappa: number;
}

/**
 * Proposal path to the common verifier: counts the call and the verdict by
 * reason, consumes rejection budget, and returns the accepted primitive
 * cycle only. tauCandidate versus tauAccept: proposals fire at the permissive
 * tauCandidate below; acceptance is the verifier's strict tauAccept policy.
 */
export const verifyCandidate = (
  cRe: number,
  cIm: number,
  cycleStartRe: number,
  cycleStartIm: number,
  proposedPeriod: number,
  metrics: KernelMetrics,
  budget: ProposalBudget,
): AcceptedCandidate | undefined => {
  metrics.verifierCalls += 1;
  const verdict = verifyCycle(cRe, cIm, cycleStartRe, cycleStartIm, proposedPeriod);
  if (verdict.verdict === 'accepted') {
    return {
      period: verdict.period,
      multiplierMagnitude: verdict.multiplierMagnitude,
      multiplierAngle: verdict.multiplierAngle,
      kappa: verdict.kappa,
    };
  }
  if (verdict.verdict === 'unresolved') {
    metrics.verifierAmbiguous += 1;
  } else if (verdict.reason === 'non-finite') {
    metrics.rejectedNonFinite += 1;
  } else if (verdict.reason === 'no-closure') {
    metrics.rejectedNoClosure += 1;
  } else {
    metrics.rejectedNotAttracting += 1;
  }
  budget.recordFailure();
  return undefined;
};

/**
 * Scale-aware proposal threshold (plan section 4: large-magnitude transients
 * must not dominate the trigger). Provenance: tauCandidate comes from the
 * frozen verifier policy (the permissive proposal threshold, looser than the
 * strict tauAccept acceptance bound); the scale factor matches the verifier's
 * own scaleOf convention and the dd oracle's proximity scan.
 */
export const proposalThresholdSquared = (zRe: number, zIm: number): number => {
  const scale = Math.max(1, Math.abs(zRe), Math.abs(zIm));
  return VERIFIER_THRESHOLDS.tauCandidate * VERIFIER_THRESHOLDS.tauCandidate * scale * scale;
};

/**
 * Preallocated context for the shared full lag scan (trigger convergence
 * scans and the exhaustion scan). Kernels mutate one instance per classify;
 * the scan itself allocates nothing.
 */
export interface LagScanContext {
  cRe: number;
  cIm: number;
  zRe: number;
  zIm: number;
  /** Iteration index of (zRe, zIm); lags run up to min(maxPeriod, iteration - 1). */
  iteration: number;
  maxPeriod: number;
  historyRe: Float64Array;
  historyIm: Float64Array;
  metrics: KernelMetrics;
  budget: ProposalBudget;
}

/**
 * One full lag scan from a single state (plan section 4 exhaustion scan and
 * convergence-triggered scan): compares every lag 1..min(maxPeriod,
 * iteration - 1) at the permissive proposal threshold and verifies hits with
 * the common verifier. Comparison counting is honest even when the
 * rejection budget stops proposals mid-scan.
 */
export const fullLagScan = (scan: LagScanContext): AcceptedCandidate | undefined => {
  const capacity = scan.historyRe.length;
  const largestPeriod = Math.min(scan.maxPeriod, scan.iteration - 1);
  const candidateSquared = proposalThresholdSquared(scan.zRe, scan.zIm);
  for (let period = 1; period <= largestPeriod; period += 1) {
    if (scan.budget.isExhausted()) {
      return undefined;
    }
    const previousIndex = (scan.iteration - 1 - period) % capacity;
    const distanceRe = scan.zRe - (scan.historyRe[previousIndex] ?? Number.NaN);
    const distanceIm = scan.zIm - (scan.historyIm[previousIndex] ?? Number.NaN);
    scan.metrics.lagComparisons += 1;
    if (distanceRe * distanceRe + distanceIm * distanceIm > candidateSquared) {
      continue;
    }
    const candidate = verifyCandidate(
      scan.cRe,
      scan.cIm,
      scan.zRe,
      scan.zIm,
      period,
      scan.metrics,
      scan.budget,
    );
    if (candidate !== undefined) {
      return candidate;
    }
  }
  return undefined;
};

/** Common attracting-result assembly for the schedule kernels. */
export const acceptedResult = (
  evidence: string,
  iterations: number,
  candidate: AcceptedCandidate,
  metrics: KernelMetrics,
): KernelResult => ({
  status: 'attracting',
  iterations,
  evidence,
  metrics,
  period: candidate.period,
  multiplierMagnitude: candidate.multiplierMagnitude,
  multiplierAngle: candidate.multiplierAngle,
  kappa: candidate.kappa,
});
