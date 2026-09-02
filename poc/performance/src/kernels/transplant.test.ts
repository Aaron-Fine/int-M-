import { describe, expect, it } from 'vitest';

import { buildCorpus } from '../corpus.ts';
import { buildGrids } from '../grids.ts';
import { CheckpointKernel } from './checkpoint.ts';
import { ControlKernel } from './control.ts';
import { TRANSPLANT_THRESHOLDS, TransplantKernel } from './transplant.ts';

// Transplant contract: multiplier-map guard, bounded Newton, common
// verifier acceptance, seed chaining, and graceful refusal as |lambda| -> 1.
// Numbers are frozen from the deterministic corpus, grids, and kernels.

const balanced = {
  maxIterations: 512,
  maxPeriod: 32,
  cycleTolerance: 1e-10,
  cycleWarmup: 24,
  exhaustionScan: true,
};

const RABBIT_CENTER = [-0.1225611668766535, 0.7448617666197435] as const;
const RABBIT_NEAR = [-0.1210611668766535, 0.7451117666197435] as const; // ~1.8e-3 away

describe('transplant: guard, prediction, and verifier acceptance', () => {
  it('frozen thresholds keep their documented ordering and plan values', () => {
    expect(TRANSPLANT_THRESHOLDS.newtonSteps).toBe(3);
    expect(TRANSPLANT_THRESHOLDS.guardDisplacement).toBeGreaterThan(0);
    expect(TRANSPLANT_THRESHOLDS.newtonDenominatorMin).toBeLessThan(1e-6);
  });

  it('seeds from a verified cycle and hits the adjacent pixel', () => {
    const kernel = new TransplantKernel(64);
    // Seed pixel: full classification, non-analytic acceptance.
    const seedResult = kernel.classify(RABBIT_CENTER[0], RABBIT_CENTER[1], balanced);
    expect(seedResult).toMatchObject({ status: 'attracting', period: 3 });

    // Adjacent pixel (~1.8e-3 away, same component): the attempt must be
    // made and accepted without orbit work.
    const result = kernel.classify(RABBIT_NEAR[0], RABBIT_NEAR[1], balanced);
    expect(result).toMatchObject({
      status: 'attracting',
      period: 3,
      evidence: 'transplant-hit',
      iterations: 0,
    });
    expect(result.metrics.transplantAttempts).toBe(1);
    expect(result.metrics.transplantGuardRefusals ?? 0).toBe(0);
    expect(result.metrics.verifierCalls).toBe(1);
    expect(result.metrics.lagComparisons).toBe(0);
  });

  it('a far seed is refused by the guard and falls back to the schedule', () => {
    const kernel = new TransplantKernel(64);
    kernel.classify(RABBIT_CENTER[0], RABBIT_CENTER[1], balanced);
    // Different component entirely: |dc| ~ O(1) blows the displacement cap.
    const result = kernel.classify(-0.5, 0.55, balanced);
    expect(result.metrics.transplantGuardRefusals ?? 0).toBe(1);
    expect(result.evidence).not.toBe('transplant-hit');
    // The fallback still classifies honestly.
    expect(['attracting', 'escaped', 'unresolved']).toContain(result.status);
  });

  it('an unseeded kernel behaves exactly like the checkpoint fallback', () => {
    const transplant = new TransplantKernel(64);
    const checkpoint = new CheckpointKernel(64);
    for (const point of buildCorpus()) {
      const expected = checkpoint.classify(point.cRe, point.cIm, balanced);
      transplant.resetSeed();
      const actual = transplant.classify(point.cRe, point.cIm, balanced);
      expect(actual.status).toBe(expected.status);
      expect(actual.metrics.lagComparisons).toBe(expected.metrics.lagComparisons);
      if (expected.status === 'attracting' && actual.status === 'attracting') {
        expect(actual.period).toBe(expected.period);
      }
    }
  });

  it('resets the seed on demand', () => {
    const kernel = new TransplantKernel(64);
    kernel.classify(RABBIT_CENTER[0], RABBIT_CENTER[1], balanced);
    kernel.resetSeed();
    const result = kernel.classify(RABBIT_NEAR[0], RABBIT_NEAR[1], balanced);
    expect(result.metrics.transplantAttempts ?? 0).toBe(0);
  });
});

describe('transplant: raster chaining on the grids', () => {
  it('chains hits across a coherent grid and keeps the zero gate', () => {
    const kernel = new TransplantKernel(64);
    const control = new ControlKernel(64);
    const points = buildGrids().filter((p) => p.grid === 'rabbit');
    let hits = 0;
    let attempts = 0;
    for (const point of points) {
      const baseline = control.classify(point.cRe, point.cIm, balanced);
      const result = kernel.classify(point.cRe, point.cIm, balanced);
      if (result.evidence === 'transplant-hit') {
        hits += 1;
        attempts += result.metrics.transplantAttempts ?? 0;
        // A hit must agree with the oracle-truth stratum: same cycle.
        expect(baseline.status === 'attracting' || baseline.status === 'unresolved').toBe(true);
        if (baseline.status === 'attracting') {
          if (result.status !== 'attracting' || result.period !== baseline.period) {
            throw new Error(`period mismatch at ${point.id}`);
          }
        }
      }
    }
    // The rabbit grid is a coherent period-3 block: the first non-analytic
    // acceptance seeds the rest.
    expect(hits).toBeGreaterThan(100);
    expect(attempts).toBeGreaterThanOrEqual(hits);
  });
});
