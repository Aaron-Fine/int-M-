import { describe, expect, it } from 'vitest';

import { buildGrids } from '../grids.ts';
import { CheckpointKernel } from './checkpoint.ts';
import { TRAP_THRESHOLDS, TrapKernel } from './trap.ts';

// Trap (workstream L, research) contract: the frozen policy gates, the
// verifier-only acceptance, the measured iteration savings on the
// weak-attraction grids, and the zero false/wrong expectation the runner
// oracle gate enforces. Numbers are frozen from the deterministic grids.

const balanced = {
  maxIterations: 512,
  maxPeriod: 32,
  cycleTolerance: 1e-10,
  cycleWarmup: 24,
  exhaustionScan: true,
};

const detailed = { ...balanced, maxIterations: 1024, maxPeriod: 64 };

describe('trap: frozen policy and gate behavior', () => {
  it('thresholds carry their documented values', () => {
    expect(TRAP_THRESHOLDS.minLambda).toBe(0.8);
    expect(TRAP_THRESHOLDS.diskFactor).toBe(4);
    expect(TRAP_THRESHOLDS.maxProposals).toBe(8);
    expect(TRAP_THRESHOLDS.newtonSteps).toBe(4);
    expect(TRAP_THRESHOLDS.polishTolerance).toBe(1e-6);
  });

  it('accepts weakly attracting grid pixels at disk entry through the verifier', () => {
    const kernel = new TrapKernel(64);
    // Verifier-based baseline (the control kernel lacks divisor reduction
    // and reports known wrong primitive periods on these grids).
    const checkpoint = new CheckpointKernel(64);
    const points = buildGrids().filter((p) => p.grid === 'weak-p6a');
    let hits = 0;
    let trapIterations = 0;
    let checkpointIterations = 0;
    for (const point of points) {
      const result = kernel.classify(point.cRe, point.cIm, detailed);
      const baseline = checkpoint.classify(point.cRe, point.cIm, detailed);
      trapIterations += result.iterations;
      checkpointIterations += baseline.iterations;
      if (result.evidence === 'trap-hit') {
        hits += 1;
        // Verifier-only acceptance: same primitive period as the baseline
        // on every hit.
        if (
          result.status !== 'attracting' ||
          baseline.status !== 'attracting' ||
          result.period !== baseline.period
        ) {
          throw new Error(`trap hit period mismatch at ${point.id}`);
        }
        expect(result.metrics.lagComparisons).toBe(0);
      }
    }
    // The whole grid chains hits; the savings are the workstream L claim.
    expect(hits).toBe(255);
    expect(trapIterations).toBeLessThan(0.06 * checkpointIterations);
  });

  it('never attempts on strongly attracting cycles (minLambda gate)', () => {
    const kernel = new TrapKernel(64);
    const points = buildGrids().filter((p) => p.grid === 'rabbit');
    let attempts = 0;
    for (const point of points) {
      const result = kernel.classify(point.cRe, point.cIm, balanced);
      attempts += result.metrics.transplantAttempts ?? 0;
    }
    // The rabbit grid's cycle multipliers sit far below minLambda.
    expect(attempts).toBe(0);
  });

  it('keeps escape classifications exact on exterior pixels', () => {
    const kernel = new TrapKernel(64);
    const checkpoint = new CheckpointKernel(64);
    for (const point of buildGrids()) {
      const baseline = checkpoint.classify(point.cRe, point.cIm, balanced);
      const result = kernel.classify(point.cRe, point.cIm, balanced);
      if (baseline.status === 'escaped') {
        expect(result.status).toBe('escaped');
        expect(result.iterations).toBe(baseline.iterations);
      }
    }
  });
});
