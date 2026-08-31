/**
 * Shared contracts and closed-form helpers for the PoC kernels.
 *
 * Kernels are allocation-free: c enters as two numbers, scratch storage is
 * preallocated per kernel instance, and the only per-classify allocation is
 * the returned result object (mirroring the production result boundary).
 */

export type KernelStatus = 'escaped' | 'attracting' | 'unresolved';

export interface KernelMetrics {
  /** Primary deterministic cost metric: candidate lag distance evaluations. */
  lagComparisons: number;
  /** Verifier / multiplier verifications attempted on proposed candidates. */
  verifierCalls: number;
  /** Verifier verdicts of 'unresolved' (primitivity or closure ambiguous). */
  verifierAmbiguous: number;
  /** Verifier verdicts of 'rejected' (non-finite, no closure, not attracting). */
  rejectedCandidates: number;
}

export interface KernelResult {
  readonly status: KernelStatus;
  readonly iterations: number;
  readonly evidence: string;
  readonly metrics: KernelMetrics;
  readonly period?: number;
  readonly multiplierMagnitude?: number;
  readonly multiplierAngle?: number;
  readonly kappa?: number;
  readonly escapeIteration?: number;
  readonly magnitudeSquared?: number;
}

export interface KernelOptions {
  readonly maxIterations: number;
  readonly maxPeriod: number;
  readonly cycleTolerance: number;
  readonly cycleWarmup: number;
  /** Default-on exhaustion scan for the schedule kernels (plan section 4). */
  readonly exhaustionScan: boolean;
}

export interface ClassificationKernel {
  readonly name: 'control' | 'checkpoint' | 'trigger' | 'staggered';
  classify(cRe: number, cIm: number, options: KernelOptions): KernelResult;
}

export const emptyMetrics = (): KernelMetrics => ({
  lagComparisons: 0,
  verifierCalls: 0,
  verifierAmbiguous: 0,
  rejectedCandidates: 0,
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
