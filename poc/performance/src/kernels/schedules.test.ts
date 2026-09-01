import { describe, expect, it } from 'vitest';

import { buildCorpus } from '../corpus.ts';
import { CANDIDATE_REJECTION_BUDGET } from './shared.ts';
import { CheckpointKernel } from './checkpoint.ts';
import { ControlKernel } from './control.ts';
import { StaggeredKernel } from './staggered.ts';
import { TriggerKernel } from './trigger.ts';

// Shared schedule contract (plan section 4): known-cycle detection, cost
// ratios on unresolved/late strata, rejection-budget enforcement, and
// exhaustion-scan toggling semantics. All numbers below are frozen from the
// deterministic corpus and kernels; they double as regression guards.

const balanced = {
  maxIterations: 512,
  maxPeriod: 32,
  cycleTolerance: 1e-10,
  cycleWarmup: 24,
  exhaustionScan: true,
};

const quick = { ...balanced, maxIterations: 256, maxPeriod: 16 };

const RABBIT_CENTER = [-0.1225611668766535, 0.7448617666197435] as const;
const PERIOD_4_CENTER = [-1.3107026413368348, 0] as const;
// Exact float64 repelling period-2 cycle (orbit i -> -1+i -> -i -> -1+i):
// every proposal closes but the multiplier |4(1+i)| = 4 sqrt(2) repels, so
// proposals fail with 'not-attracting' until the rejection budget ends.
const REPELLING_CYCLE = [0, 1] as const;
// Real-axis Feigenbaum point: unresolved at every PoC budget.
const FEIGENBAUM = [-1.4011551890920506, 0] as const;

const SCHEDULES = {
  checkpoint: () => new CheckpointKernel(64),
  trigger: () => new TriggerKernel(64),
  staggered: () => new StaggeredKernel(64),
} as const;

type ScheduleName = keyof typeof SCHEDULES;

describe('schedule kernels: known-cycle detection', () => {
  const cases = [
    { label: 'cardioid p1', cRe: 0.1, cIm: 0.1, period: 1, analytic: true },
    { label: 'period-2 bulb p2', cRe: -1.1, cIm: 0, period: 2, analytic: true },
    {
      label: 'rabbit center p3',
      cRe: RABBIT_CENTER[0],
      cIm: RABBIT_CENTER[1],
      period: 3,
      analytic: false,
    },
    {
      label: 'period-4 center',
      cRe: PERIOD_4_CENTER[0],
      cIm: PERIOD_4_CENTER[1],
      period: 4,
      analytic: false,
    },
  ] as const;

  for (const [name, make] of Object.entries(SCHEDULES) as [
    ScheduleName,
    typeof SCHEDULES.checkpoint,
  ][]) {
    const kernel = make();

    for (const fixture of cases) {
      it(`${name} detects ${fixture.label} with the primitive period`, () => {
        const result = kernel.classify(fixture.cRe, fixture.cIm, balanced);

        expect(result.status).toBe('attracting');
        if (result.status !== 'attracting') {
          throw new Error('expected an attracting classification');
        }
        expect(result.period).toBe(fixture.period);
        if (fixture.analytic) {
          // The closed-form paths are preserved in every kernel (plan 4).
          expect(result.iterations).toBe(0);
          expect(result.metrics.lagComparisons).toBe(0);
          expect(result.evidence.startsWith('analytic-')).toBe(true);
        } else {
          expect(result.metrics.lagComparisons).toBeGreaterThan(0);
        }
      });
    }

    it(`${name} detects the corpus period-5 point with the primitive period`, () => {
      const point = buildCorpus().find((p) => p.id === 'period-5-0');
      if (point === undefined) {
        throw new Error('missing period-5 corpus fixture');
      }
      const result = kernel.classify(point.cRe, point.cIm, balanced);

      expect(result).toMatchObject({ status: 'attracting', period: 5 });
      expect(result.metrics.lagComparisons).toBeGreaterThan(0);
    });
  }

  it('checkpoint reduces a multiple-of-p checkpoint lag to the primitive period', () => {
    // Frozen trace: the first post-warmup window ends at the period-5
    // checkpoint lag q = 5 with a single verifier call and no rejections.
    const point = buildCorpus().find((p) => p.id === 'period-5-0');
    if (point === undefined) {
      throw new Error('missing period-5 corpus fixture');
    }
    const result = new CheckpointKernel(64).classify(point.cRe, point.cIm, balanced);

    expect(result).toMatchObject({
      status: 'attracting',
      period: 5,
      iterations: 35,
      evidence: 'checkpoint-candidate',
    });
    expect(result.metrics).toMatchObject({
      lagComparisons: 12,
      verifierCalls: 1,
      verifierAmbiguous: 0,
      rejectedNotAttracting: 0,
    });
  });

  it('checkpoint reduces the rabbit-center proposal lag 9 (= 3 * 3) to period 3', () => {
    const result = new CheckpointKernel(64).classify(RABBIT_CENTER[0], RABBIT_CENTER[1], balanced);

    expect(result).toMatchObject({
      status: 'attracting',
      period: 3,
      iterations: 24,
      evidence: 'checkpoint-candidate',
      metrics: { lagComparisons: 1, verifierCalls: 1 },
    });
  });
});

describe('schedule kernels: cost on unresolved/late strata', () => {
  const control = new ControlKernel(64);
  const corpus = buildCorpus();

  // Control scans all 32 lags from iteration 24 on: 243 + 480 * 32 = 15603
  // evaluations at this budget. The schedules must sit far below that.
  const CONTROL_COMPARISONS = 15603;

  for (const pointId of ['unresolved-budget-0', 'boundary-0']) {
    it(`${pointId}: every schedule stays far below the control lag-comparison count`, () => {
      const point = corpus.find((p) => p.id === pointId);
      if (point === undefined) {
        throw new Error(`missing corpus fixture ${pointId}`);
      }
      const baseline = control.classify(point.cRe, point.cIm, balanced);
      expect(baseline.metrics.lagComparisons).toBe(CONTROL_COMPARISONS);
      expect(baseline.status).toBe('unresolved');

      for (const make of Object.values(SCHEDULES)) {
        const result = make().classify(point.cRe, point.cIm, balanced);
        expect(result.metrics.lagComparisons).toBeLessThan(0.25 * CONTROL_COMPARISONS);
        expect(result.status).toBe('unresolved');
      }
    });
  }

  it('trigger step gates stay at zero scans on the unresolved-budget stratum', () => {
    // The plan-literal step gate |z_n - z_{n-1}| does not fire on chaotic
    // orbits: the trigger pays for the exhaustion scan only.
    const result = new TriggerKernel(64).classify(FEIGENBAUM[0], FEIGENBAUM[1], balanced);

    expect(result.metrics.lagComparisons).toBe(32);
    expect(result.evidence).toBe('iteration-limit');
  });
});

describe('schedule kernels: rejected-candidate budget', () => {
  it('staggered exhausts the budget on an exact float64 repelling cycle', () => {
    const kernel = new StaggeredKernel(64);
    const withScan = kernel.classify(REPELLING_CYCLE[0], REPELLING_CYCLE[1], balanced);
    const withoutScan = kernel.classify(REPELLING_CYCLE[0], REPELLING_CYCLE[1], {
      ...balanced,
      exhaustionScan: false,
    });

    for (const result of [withScan, withoutScan]) {
      expect(result.status).toBe('unresolved');
      expect(result.evidence).toBe('candidate-budget-exhausted');
      expect(result.metrics.rejectedNotAttracting).toBe(CANDIDATE_REJECTION_BUDGET);
      expect(result.metrics.verifierCalls).toBe(CANDIDATE_REJECTION_BUDGET);
    }
    // A dead budget suppresses the exhaustion scan entirely: identical cost.
    expect(withScan.metrics.lagComparisons).toBe(withoutScan.metrics.lagComparisons);

    const control = new ControlKernel(64).classify(
      REPELLING_CYCLE[0],
      REPELLING_CYCLE[1],
      balanced,
    );
    expect(withScan.metrics.lagComparisons).toBeLessThan(control.metrics.lagComparisons);
  });

  it('checkpoint spends the budget only through doubling re-arm gaps', () => {
    const result = new CheckpointKernel(64).classify(
      REPELLING_CYCLE[0],
      REPELLING_CYCLE[1],
      balanced,
    );

    expect(result.status).toBe('unresolved');
    expect(result.evidence).toBe('iteration-limit');
    expect(result.metrics.rejectedNotAttracting).toBeGreaterThan(0);
    expect(result.metrics.rejectedNotAttracting).toBeLessThan(CANDIDATE_REJECTION_BUDGET);
  });

  it('trigger never fires its step gate on the exact repelling cycle', () => {
    const kernel = new TriggerKernel(64);
    const withoutScan = kernel.classify(REPELLING_CYCLE[0], REPELLING_CYCLE[1], {
      ...balanced,
      exhaustionScan: false,
    });
    expect(withoutScan.metrics).toMatchObject({ lagComparisons: 0, verifierCalls: 0 });

    const withScan = kernel.classify(REPELLING_CYCLE[0], REPELLING_CYCLE[1], balanced);
    // Only the exhaustion scan proposes (one scan's worth of even lags).
    expect(withScan.metrics.lagComparisons).toBe(32);
    expect(withScan.metrics.rejectedNotAttracting).toBe(16);
  });
});

describe('schedule kernels: exhaustion scan toggling', () => {
  const corpus = buildCorpus();
  const recoveryStrata = {
    checkpoint: new Map<string, number>(),
    trigger: new Map<string, number>(),
    staggered: new Map<string, number>(),
  };

  it('toggling only affects points the schedule missed, and recovers trigger p>=2 detections', () => {
    let totalRecoveries = 0;

    for (const point of corpus) {
      for (const [name, make] of Object.entries(SCHEDULES) as [
        ScheduleName,
        typeof SCHEDULES.checkpoint,
      ][]) {
        const kernel = make();
        const without = kernel.classify(point.cRe, point.cIm, {
          ...balanced,
          exhaustionScan: false,
        });
        const withScan = kernel.classify(point.cRe, point.cIm, balanced);

        if (without.status !== 'unresolved') {
          // Exhaustion never runs after a main-loop detection (attracting
          // or escaped): identical results.
          expect(JSON.stringify(withScan)).toBe(JSON.stringify(without));
          continue;
        }
        if (withScan.status === 'attracting') {
          expect(withScan.evidence).toBe('exhaustion-scan');
          const strata = recoveryStrata[name];
          strata.set(point.stratum, (strata.get(point.stratum) ?? 0) + 1);
          totalRecoveries += 1;
        } else {
          expect(withScan.status).toBe('unresolved');
          // Unresolved both ways: the toggle may only add the scan cost.
          const delta = withScan.metrics.lagComparisons - without.metrics.lagComparisons;
          expect(delta).toBeGreaterThanOrEqual(0);
          expect(delta).toBeLessThanOrEqual(balanced.maxPeriod);
        }
      }
    }

    expect(totalRecoveries).toBeGreaterThan(0);
  });

  it('recovers exactly the trigger strata seen at this profile', () => {
    expect([...recoveryStrata.trigger.entries()].sort()).toEqual(
      [
        ['hard-view-anchor', 11],
        ['period-5', 3],
        ['rabbit-neighborhood', 24],
        ['superattracting', 9],
      ].sort(),
    );
    expect(recoveryStrata.checkpoint.size).toBe(0);
    expect(recoveryStrata.staggered.size).toBe(0);
  });

  it('recovers a rabbit-neighborhood period-3 point via the exhaustion scan', () => {
    const point = corpus.find((p) => p.id === 'rabbit-neighborhood-0');
    if (point === undefined) {
      throw new Error('missing rabbit-neighborhood corpus fixture');
    }
    const kernel = new TriggerKernel(64);
    const without = kernel.classify(point.cRe, point.cIm, { ...balanced, exhaustionScan: false });
    const withScan = kernel.classify(point.cRe, point.cIm, balanced);

    expect(without.status).toBe('unresolved');
    expect(withScan).toMatchObject({
      status: 'attracting',
      period: 3,
      evidence: 'exhaustion-scan',
    });
  });

  it('trigger also recovers p>=2 detections at the quick profile', () => {
    const kernel = new TriggerKernel(64);
    let recoveries = 0;
    for (const point of corpus) {
      const without = kernel.classify(point.cRe, point.cIm, { ...quick, exhaustionScan: false });
      const withScan = kernel.classify(point.cRe, point.cIm, quick);
      if (without.status === 'unresolved' && withScan.status === 'attracting') {
        recoveries += 1;
      }
    }
    expect(recoveries).toBe(45);
  });
});

describe('schedule kernels: parity with control on interior strata', () => {
  const corpus = buildCorpus();
  const control = new ControlKernel(64);
  const strata = new Set([
    'cardioid',
    'period-2-bulb',
    'rabbit-neighborhood',
    'period-5',
    'superattracting',
    'weak-attraction',
  ]);

  for (const [name, make] of Object.entries(SCHEDULES) as [
    ScheduleName,
    typeof SCHEDULES.checkpoint,
  ][]) {
    it(`${name} matches control status and period on ${[...strata].length} interior strata`, () => {
      const kernel = make();
      let compared = 0;
      for (const point of corpus) {
        if (!strata.has(point.stratum)) {
          continue;
        }
        compared += 1;
        const baseline = control.classify(point.cRe, point.cIm, balanced);
        const result = kernel.classify(point.cRe, point.cIm, balanced);
        expect(result.status).toBe(baseline.status);
        if (baseline.status === 'attracting' && result.status === 'attracting') {
          expect(result.period).toBe(baseline.period);
        }
      }
      expect(compared).toBe(122);
    });
  }
});
