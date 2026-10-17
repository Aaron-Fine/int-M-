import { describe, expect, it } from 'vitest';

import { DEFAULT_VIEWPORT, MAX_MAGNIFICATION, MIN_VIEWPORT_SPAN_Y } from '../../../src/domain';
import {
  COARSE_BASE_ITERATIONS,
  COARSE_RAMP,
  coarseIterationBudget,
  type CoarseRamp,
} from '../../../src/render/coarse-budget';

const RAMP: CoarseRamp = { startMagnification: 1000, deepIterations: 512 };
const spanAt = (magnification: number): number => DEFAULT_VIEWPORT.spanY / magnification;

describe('coarseIterationBudget', () => {
  it('returns the base budget at and below the ramp start', () => {
    expect(coarseIterationBudget(1024, DEFAULT_VIEWPORT.spanY, RAMP)).toBe(COARSE_BASE_ITERATIONS);
    expect(coarseIterationBudget(1024, spanAt(126), RAMP)).toBe(COARSE_BASE_ITERATIONS);
    expect(coarseIterationBudget(1024, spanAt(1000), RAMP)).toBe(COARSE_BASE_ITERATIONS);
  });

  it('reaches the deep budget at the product ceiling', () => {
    expect(coarseIterationBudget(1024, MIN_VIEWPORT_SPAN_Y, RAMP)).toBe(512);
    expect(coarseIterationBudget(1024, spanAt(MAX_MAGNIFICATION), RAMP)).toBe(512);
  });

  it('never exceeds the profile stable budget, and never drops below it for tiny budgets', () => {
    expect(coarseIterationBudget(384, MIN_VIEWPORT_SPAN_Y, RAMP)).toBe(384);
    expect(coarseIterationBudget(256, MIN_VIEWPORT_SPAN_Y, RAMP)).toBe(256);
    expect(coarseIterationBudget(32, DEFAULT_VIEWPORT.spanY, RAMP)).toBe(32);
    expect(coarseIterationBudget(16, MIN_VIEWPORT_SPAN_Y, RAMP)).toBe(16);
  });

  it('is non-decreasing in magnification and a multiple of 32', () => {
    let previous = 0;
    for (let exponent = 0; exponent <= 6.8; exponent += 0.1) {
      const budget = coarseIterationBudget(1024, spanAt(10 ** exponent), RAMP);
      expect(budget).toBeGreaterThanOrEqual(previous);
      expect(budget % 32).toBe(0);
      previous = budget;
    }
  });

  it('treats a non-finite or non-positive span as shallow instead of throwing', () => {
    for (const spanY of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(coarseIterationBudget(1024, spanY, RAMP)).toBe(COARSE_BASE_ITERATIONS);
    }
  });

  it('keeps the default ramp within [base, stable budget] at every magnification', () => {
    for (const maxIterations of [256, 512, 1024]) {
      for (const magnification of [1, 126, 1000, 50_000, MAX_MAGNIFICATION]) {
        const budget = coarseIterationBudget(maxIterations, spanAt(magnification));
        expect(budget).toBeGreaterThanOrEqual(COARSE_BASE_ITERATIONS);
        expect(budget).toBeLessThanOrEqual(maxIterations);
      }
    }
    expect(COARSE_RAMP.deepIterations).toBeGreaterThanOrEqual(COARSE_BASE_ITERATIONS);
  });
});
