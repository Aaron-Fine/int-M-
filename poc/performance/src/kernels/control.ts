/**
 * Control kernel: faithful port of src/domain/orbit.ts observable semantics.
 *
 * Differences from production are limited to the harness boundary: c enters
 * as (cRe, cIm) numbers, results carry PoC metric counters, and smooth
 * escape iteration (a rendering concern) is omitted. The analytic fast
 * paths, ring-buffer history of maxPeriod + 1 slots, warmup, all-lag scan,
 * forward-closure relaxation, and |lambda| < 1 requirement replicate
 * production exactly so the differential runner can treat control answers
 * as the legacy baseline.
 */

import { analyticInterior, emptyMetrics, kappaOf } from './shared.ts';
import type { ClassificationKernel, KernelOptions, KernelResult } from './shared.ts';

/** Legacy verification constants (src/domain/orbit.ts DEFAULT_ORBIT_OPTIONS). */
const LEGACY_CLOSURE_RELAXATION = 100;

export class ControlKernel implements ClassificationKernel {
  public readonly name = 'control' as const;
  #historyRe: Float64Array;
  #historyIm: Float64Array;

  public constructor(maxPeriod = 64) {
    const capacity = Math.max(2, Math.ceil(maxPeriod) + 1);
    this.#historyRe = new Float64Array(capacity);
    this.#historyIm = new Float64Array(capacity);
  }

  public ensureCapacity(maxPeriod: number): void {
    const required = maxPeriod + 1;
    if (this.#historyRe.length >= required) {
      return;
    }
    this.#historyRe = new Float64Array(required);
    this.#historyIm = new Float64Array(required);
  }

  public classify(cRe: number, cIm: number, options: KernelOptions): KernelResult {
    this.ensureCapacity(options.maxPeriod);
    const metrics = emptyMetrics();

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

    const historyRe = this.#historyRe;
    const historyIm = this.#historyIm;
    const capacity = historyRe.length;
    const toleranceSquared = options.cycleTolerance * options.cycleTolerance;
    // Recurrence is the primary evidence; the forward closure allows 100x
    // more linear error for accumulated rounding (legacy semantics).
    const closureToleranceSquared =
      options.cycleTolerance *
      LEGACY_CLOSURE_RELAXATION *
      (options.cycleTolerance * LEGACY_CLOSURE_RELAXATION);

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

      const currentIndex = (iteration - 1) % capacity;
      historyRe[currentIndex] = zRe;
      historyIm[currentIndex] = zIm;
      if (iteration < options.cycleWarmup) {
        continue;
      }

      const largestPeriod = Math.min(options.maxPeriod, iteration - 1);
      for (let period = 1; period <= largestPeriod; period += 1) {
        const previousIndex = (currentIndex - period + capacity) % capacity;
        const distanceRe = zRe - (historyRe[previousIndex] ?? Number.NaN);
        const distanceIm = zIm - (historyIm[previousIndex] ?? Number.NaN);
        metrics.lagComparisons += 1;
        if (distanceRe * distanceRe + distanceIm * distanceIm > toleranceSquared) {
          continue;
        }

        // Legacy verification: forward closure plus strict attraction.
        metrics.verifierCalls += 1;
        const verified = forwardClosure(cRe, cIm, zRe, zIm, period, closureToleranceSquared);
        if (!verified.closes) {
          metrics.rejectedNoClosure += 1;
          continue;
        }
        if (!Number.isFinite(verified.magnitude)) {
          metrics.rejectedNonFinite += 1;
          continue;
        }
        if (verified.magnitude >= 1) {
          metrics.rejectedNotAttracting += 1;
          continue;
        }
        return {
          status: 'attracting',
          iterations: iteration,
          evidence: 'converged-cycle',
          metrics,
          period,
          multiplierMagnitude: verified.magnitude,
          multiplierAngle:
            verified.magnitude === 0 ? 0 : Math.atan2(verified.multiplierIm, verified.multiplierRe),
          kappa: kappaOf(verified.magnitude, period),
        };
      }
    }

    return {
      status: 'unresolved',
      iterations: options.maxIterations,
      evidence: 'iteration-limit',
      metrics,
    };
  }
}

interface LegacyMultiplier {
  readonly multiplierRe: number;
  readonly multiplierIm: number;
  readonly magnitude: number;
  readonly closes: boolean;
}

const forwardClosure = (
  cRe: number,
  cIm: number,
  cycleStartRe: number,
  cycleStartIm: number,
  period: number,
  closureToleranceSquared: number,
): LegacyMultiplier => {
  let zRe = cycleStartRe;
  let zIm = cycleStartIm;
  let derivativeRe = 1;
  let derivativeIm = 0;

  for (let index = 0; index < period; index += 1) {
    const nextDerivativeRe = derivativeRe * (2 * zRe) - derivativeIm * (2 * zIm);
    derivativeIm = derivativeRe * (2 * zIm) + derivativeIm * (2 * zRe);
    derivativeRe = nextDerivativeRe;

    const nextRe = zRe * zRe - zIm * zIm + cRe;
    zIm = 2 * zRe * zIm + cIm;
    zRe = nextRe;
  }

  const closureRe = zRe - cycleStartRe;
  const closureIm = zIm - cycleStartIm;
  return {
    multiplierRe: derivativeRe,
    multiplierIm: derivativeIm,
    magnitude: Math.hypot(derivativeRe, derivativeIm),
    closes: closureRe * closureRe + closureIm * closureIm <= closureToleranceSquared,
  };
};
