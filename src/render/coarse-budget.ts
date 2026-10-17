import { DEFAULT_VIEWPORT, MAX_MAGNIFICATION } from '../domain';

/** The coarse pass's budget at shallow zoom: the pre-ramp constant. */
export const COARSE_BASE_ITERATIONS = 256;

/**
 * The coarse budget rises log-linearly in magnification from the base at
 * `startMagnification` to `deepIterations` at MAX_MAGNIFICATION. The deep
 * value comes from tools/benchmark/coarse-budget-study.ts (see
 * docs/verification/COARSE-BUDGET-STUDY-2026-10-16.md).
 */
export interface CoarseRamp {
  readonly startMagnification: number;
  readonly deepIterations: number;
}

export const COARSE_RAMP: CoarseRamp = Object.freeze({
  startMagnification: 1000,
  deepIterations: 256,
});

const GRANULARITY = 32;

/**
 * Iteration budget of the coarse pass for a view: deeper views get more
 * iterations so near-parabolic interior resolves in the first frame, capped
 * by the profile's stable budget so the coarse pass never out-spends the
 * stable one. A non-finite or non-positive span counts as shallow.
 */
export const coarseIterationBudget = (
  maxIterations: number,
  spanY: number,
  ramp: CoarseRamp = COARSE_RAMP,
): number => {
  const magnification = DEFAULT_VIEWPORT.spanY / spanY;
  const ramped =
    Number.isFinite(magnification) && magnification > ramp.startMagnification
      ? Math.min(
          1,
          Math.log(magnification / ramp.startMagnification) /
            Math.log(MAX_MAGNIFICATION / ramp.startMagnification),
        )
      : 0;
  const raw = COARSE_BASE_ITERATIONS + ramped * (ramp.deepIterations - COARSE_BASE_ITERATIONS);
  const rounded = Math.max(COARSE_BASE_ITERATIONS, Math.round(raw / GRANULARITY) * GRANULARITY);
  return Math.min(maxIterations, rounded);
};
