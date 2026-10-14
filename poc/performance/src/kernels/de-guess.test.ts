import { describe, expect, it } from 'vitest';

import { buildCorpus } from '../corpus.ts';
import { CheckpointKernel } from './checkpoint.ts';
import { ControlKernel } from './control.ts';
import { DE_GUESS_THRESHOLDS, DE_OPPORTUNISTIC_CEILING, DeGuessKernel } from './de-guess.ts';

// DE-guess contract: B-recurrence arming gate (exterior short-circuit),
// B-consistency-ordered extension proposals through the common verifier,
// rejection-budget enforcement, and the systematic/opportunistic bucket
// split. Numbers are frozen from the deterministic corpus and kernels; they
// double as regression guards.

const balanced = {
  maxIterations: 512,
  maxPeriod: 32,
  cycleTolerance: 1e-10,
  cycleWarmup: 24,
  exhaustionScan: true,
};

const detailed = { ...balanced, maxIterations: 1024, maxPeriod: 64 };

const RABBIT_CENTER = [-0.1225611668766535, 0.7448617666197435] as const;
const PERIOD_4_CENTER = [-1.3107026413368348, 0] as const;
// Exact float64 repelling period-2 cycle: proposals close but repel, so the
// rejection budget must end the guessing.
const REPELLING_CYCLE = [0, 1] as const;
// Real-axis Feigenbaum point: |B| grows without bound, so the arming gate
// must disarm the proposal machinery early and keep the proposal cost low.
const FEIGENBAUM = [-1.4011551890920506, 0] as const;

const corpusPoint = (id: string) => {
  const point = buildCorpus().find((p) => p.id === id);
  if (point === undefined) {
    throw new Error(`missing corpus fixture ${id}`);
  }
  return point;
};

describe('de-guess: known-cycle detection through the common verifier', () => {
  const cases = [
    { label: 'rabbit center p3', c: RABBIT_CENTER, period: 3, options: balanced },
    { label: 'period-4 center', c: PERIOD_4_CENTER, period: 4, options: balanced },
    {
      label: 'corpus period-5 point',
      c: [-0.504505098022, 0.5629264446],
      period: 5,
      options: balanced,
    },
  ] as const;

  for (const fixture of cases) {
    it(`detects the ${fixture.label} with the primitive period`, () => {
      const result = new DeGuessKernel(64).classify(fixture.c[0], fixture.c[1], fixture.options);

      expect(result.status).toBe('attracting');
      if (result.status !== 'attracting') {
        throw new Error('expected an attracting classification');
      }
      expect(result.period).toBe(fixture.period);
      expect(['de-guess-candidate', 'de-guess-round']).toContain(result.evidence);
      expect(result.metrics.verifierCalls).toBeGreaterThan(0);
    });
  }

  it('disarms on exterior-bound orbits: the exact repelling cycle costs one exhaustion scan', () => {
    // On a repelling cycle |B_n| grows like the multiplier, so the arming
    // gate disarms the proposal machinery before warmup ends - the orbit
    // looks exterior-bound to the same recurrence the exterior distance
    // estimate uses. Without the exhaustion scan the pixel is free.
    const kernel = new DeGuessKernel(64);
    const off = kernel.classify(REPELLING_CYCLE[0], REPELLING_CYCLE[1], {
      ...balanced,
      exhaustionScan: false,
    });
    expect(off).toMatchObject({
      status: 'unresolved',
      evidence: 'iteration-limit',
      metrics: { lagComparisons: 0, verifierCalls: 0, deGuessRounds: 0 },
    });

    const withScan = kernel.classify(REPELLING_CYCLE[0], REPELLING_CYCLE[1], balanced);
    // Only the exhaustion scan proposes (even lags within the cap), and the
    // shared budget absorbs the rejections without exhausting.
    expect(withScan.status).toBe('unresolved');
    expect(withScan.evidence).toBe('iteration-limit');
    expect(withScan.metrics).toMatchObject({
      lagComparisons: balanced.maxPeriod,
      verifierCalls: 16,
      rejectedNotAttracting: 16,
      deGuessRounds: 0,
    });
  });

  it('never wastes proposals on the chaotic Feigenbaum orbit', () => {
    const result = new DeGuessKernel(64).classify(FEIGENBAUM[0], FEIGENBAUM[1], detailed);
    const checkpoint = new CheckpointKernel(64).classify(FEIGENBAUM[0], FEIGENBAUM[1], detailed);

    expect(result).toMatchObject({
      status: 'unresolved',
      evidence: 'iteration-limit',
      metrics: { deGuessRounds: 0, verifierCalls: 0 },
    });
    // Near-zero-Lyapunov growth stays below the conservative disarm
    // threshold within the budget, so cost is at parity with the checkpoint
    // host - never above it.
    expect(result.metrics.lagComparisons).toBeGreaterThan(0);
    expect(result.metrics.lagComparisons).toBeLessThanOrEqual(checkpoint.metrics.lagComparisons);
  });
});

describe('de-guess: systematic vs capped-opportunistic buckets', () => {
  it('opportunistic ceiling is frozen at the dd oracle adjudication range', () => {
    expect(DE_OPPORTUNISTIC_CEILING).toBe(96);
  });

  it('a period above maxPeriod is invisible to systematic mode and found by opportunistic mode', () => {
    // The corpus period-5 point under a maxPeriod-3 profile: systematic
    // proposals cap at lag 3, so the cycle stays unproposed everywhere.
    const point = corpusPoint('period-5-0');
    const options = { ...balanced, maxPeriod: 3, maxIterations: 256 };
    const systematic = new DeGuessKernel(64).classify(point.cRe, point.cIm, options);
    expect(systematic.status).toBe('unresolved');

    const opportunistic = new DeGuessKernel(64, true).classify(point.cRe, point.cIm, options);
    expect(opportunistic.status).toBe('attracting');
    if (opportunistic.status !== 'attracting') {
      throw new Error('expected an opportunistic acceptance');
    }
    expect(opportunistic.period).toBe(5);
    expect(opportunistic.period).toBeGreaterThan(options.maxPeriod);
    expect(opportunistic.period).toBeLessThanOrEqual(DE_OPPORTUNISTIC_CEILING);
  });

  it('arming thresholds keep their frozen hysteresis ordering', () => {
    expect(DE_GUESS_THRESHOLDS.rearmInteriorB).toBeLessThan(DE_GUESS_THRESHOLDS.disarmExteriorB);
  });
});

describe('de-guess: exhaustion scan and stratum parity', () => {
  it('toggling the exhaustion scan only changes unresolved-end points', () => {
    const kernel = new DeGuessKernel(64);
    for (const point of buildCorpus()) {
      const without = kernel.classify(point.cRe, point.cIm, { ...balanced, exhaustionScan: false });
      const withScan = kernel.classify(point.cRe, point.cIm, balanced);
      if (without.status !== 'unresolved') {
        expect(JSON.stringify(withScan)).toBe(JSON.stringify(without));
      } else if (withScan.status === 'attracting') {
        expect(withScan.evidence).toBe('exhaustion-scan');
      } else {
        const delta = withScan.metrics.lagComparisons - without.metrics.lagComparisons;
        expect(delta).toBeGreaterThanOrEqual(0);
        expect(delta).toBeLessThanOrEqual(balanced.maxPeriod);
      }
    }
  });

  it('matches checkpoint status and period on the interior strata', () => {
    const deGuess = new DeGuessKernel(64);
    const checkpoint = new CheckpointKernel(64);
    const strata = new Set([
      'cardioid',
      'period-2-bulb',
      'rabbit-neighborhood',
      'period-5',
      'superattracting',
    ]);
    let compared = 0;
    for (const point of buildCorpus()) {
      if (!strata.has(point.stratum)) {
        continue;
      }
      compared += 1;
      const baseline = checkpoint.classify(point.cRe, point.cIm, balanced);
      const result = deGuess.classify(point.cRe, point.cIm, balanced);
      expect(result.status).toBe(baseline.status);
      if (baseline.status === 'attracting' && result.status === 'attracting') {
        expect(result.period).toBe(baseline.period);
      }
    }
    expect(compared).toBe(102);
  });

  it('never classifies where the control kernel proves escape', () => {
    const deGuess = new DeGuessKernel(64);
    const control = new ControlKernel(64);
    for (const point of buildCorpus()) {
      const baseline = control.classify(point.cRe, point.cIm, balanced);
      const result = deGuess.classify(point.cRe, point.cIm, balanced);
      if (baseline.status === 'escaped') {
        expect(result.status).toBe('escaped');
      }
    }
  });
});
