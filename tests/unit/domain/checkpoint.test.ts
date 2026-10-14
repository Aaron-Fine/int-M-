import { describe, expect, it } from 'vitest';

import {
  CHECKPOINT_CANDIDATE_BUDGET,
  CHECKPOINT_REVISION,
  classifyCheckpointInto,
  classifyInto,
  createCheckpointMetrics,
  createOrbitSample,
  materializeOrbitResult,
  OrbitScratch,
  resetCheckpointMetrics,
  resolveOrbitOptions,
  VERIFIER_REVISION,
  VERIFIER_THRESHOLDS,
  type OrbitResult,
} from '../../../src/domain';
import type { OrbitSample } from '../../../src/domain';

/**
 * Unit tests of the production checkpoint schedule (PR 4, plan section 4).
 *
 * Complementary pins:
 * - poc/performance/src/checkpoint-parity.test.ts pins this kernel to the
 *   frozen PoC reference (poc-checkpoint-1.0.1) on the whole PoC corpus,
 *   including the deterministic comparison/verifier counters.
 * - tests/unit/domain/checkpoint-differential.test.ts (PR 4 M2) pins the
 *   differential mode and the dd-oracle cleanliness on the stratified grid.
 *
 * The literals below were derived from the frozen schedule semantics (warmup
 * gate, interval doubling capped at maxPeriod, doubling re-arm, over-ceiling
 * roll) and hand-verified; a schedule regression changes them.
 */

const BALANCED = resolveOrbitOptions({});

const classifyCheckpoint = (
  cRe: number,
  cIm: number,
  options: ReturnType<typeof resolveOrbitOptions>,
  scratch: OrbitScratch,
  sample: OrbitSample,
  metrics: ReturnType<typeof createCheckpointMetrics>,
): OrbitResult => {
  classifyCheckpointInto(cRe, cIm, options, scratch, sample, metrics);
  return materializeOrbitResult(sample);
};

describe('checkpoint schedule policy constants', () => {
  it('pins the frozen revisions, budget, and proposal threshold', () => {
    expect(CHECKPOINT_REVISION).toBe('src-checkpoint-1.0.0');
    expect(CHECKPOINT_CANDIDATE_BUDGET).toBe(64);
    // Provenance: PoC policy value (poc-checkpoint-1.0.1 / poc-verifier-1.0.0),
    // which matches the dd oracle's candidate budget of 64. The proposal
    // threshold must stay strictly above the acceptance bound.
    expect(VERIFIER_THRESHOLDS.tauCandidate).toBe(1e-8);
    expect(VERIFIER_THRESHOLDS.tauCandidate).toBeGreaterThan(VERIFIER_THRESHOLDS.tauAccept);
    expect(VERIFIER_REVISION).toBe('src-verifier-1.0.0');
  });
});

describe('checkpoint schedule detection', () => {
  it('detects known primitive periods (p3 rabbit, p4 center, p5, p8)', () => {
    const scratch = new OrbitScratch(64);
    const sample = createOrbitSample();
    const metrics = createCheckpointMetrics();

    const rabbit = classifyCheckpoint(
      -0.1225611668766535,
      0.7448617666197435,
      BALANCED,
      scratch,
      sample,
      metrics,
    );
    expect(rabbit.status).toBe('attracting-cycle');
    expect(rabbit.status === 'attracting-cycle' && rabbit.period).toBe(3);
    expect(rabbit.status === 'attracting-cycle' && rabbit.verifierRevision).toBe(
      'src-verifier-1.0.0',
    );

    const p4 = classifyCheckpoint(
      -0.1565201668337543,
      1.0322471089228327,
      BALANCED,
      scratch,
      sample,
      metrics,
    );
    expect(p4.status).toBe('attracting-cycle');
    expect(p4.status === 'attracting-cycle' && p4.period).toBe(4);

    const p5 = classifyCheckpoint(-1.625413732, 0, BALANCED, scratch, sample, metrics);
    expect(p5.status).toBe('attracting-cycle');
    expect(p5.status === 'attracting-cycle' && p5.period).toBe(5);

    const p8 = classifyCheckpoint(
      -1.38154848,
      0,
      resolveOrbitOptions({ maxIterations: 1024, maxPeriod: 64 }),
      scratch,
      sample,
      metrics,
    );
    expect(p8.status).toBe('attracting-cycle');
    expect(p8.status === 'attracting-cycle' && p8.period).toBe(8);
  });

  it('leaves the analytic fast paths bit-identical to the legacy scan, margin refusal included', () => {
    // Interior cardioid/bulb points plus one margin-adjacent point with the
    // exact closed-form |lambda| = 1 - 1e-12 (the analytic construction
    // c = z* - z*^2, z* = lambda/2): both kernels must refuse the analytic
    // acceptance there (frozen attraction margin) and fall through to the
    // orbit walk, ending unresolved at this budget.
    const lambdaRe = 1 - VERIFIER_THRESHOLDS.attractMargin;
    const points: readonly (readonly [number, number])[] = [
      [0.1, 0.1],
      [0.3, -0.2],
      [0.499999, 0.01],
      [-1.1, 0.05],
      [-1.24, 0.001],
      [lambdaRe / 2 - (lambdaRe * lambdaRe) / 4, 0],
    ];
    const scratch = new OrbitScratch(32);
    const sample = createOrbitSample();
    const metrics = createCheckpointMetrics();
    for (const [re, im] of points) {
      classifyInto(re, im, BALANCED, scratch, sample);
      const legacy = materializeOrbitResult(sample);
      const checkpoint = classifyCheckpoint(re, im, BALANCED, scratch, sample, metrics);
      expect(checkpoint).toEqual(legacy);
      resetCheckpointMetrics(metrics);
    }
  });

  it('writes escape records identical to the legacy scan', () => {
    const points: readonly (readonly [number, number])[] = [
      [-1, 1],
      [0.6, 1.2],
      [-2.2, 0.1],
      [10, 10],
    ];
    const scratch = new OrbitScratch(32);
    const sample = createOrbitSample();
    const metrics = createCheckpointMetrics();
    for (const [re, im] of points) {
      classifyInto(re, im, BALANCED, scratch, sample);
      const legacy = materializeOrbitResult(sample);
      const checkpoint = classifyCheckpoint(re, im, BALANCED, scratch, sample, metrics);
      expect(checkpoint).toEqual(legacy);
      resetCheckpointMetrics(metrics);
    }
  });
});

describe('checkpoint schedule mechanics (frozen policy)', () => {
  it('rolls the checkpoint on a near-return whose lag exceeds the systematic ceiling', () => {
    // Regression case (PoC kernels/checkpoint.ts policy 4): the rabbit
    // center's orbit converges onto its cycle (through the seed z_0 = 0)
    // before the first comparison, so the first proximity hit happens at
    // lag = cycleWarmup = 24 > maxPeriod = 4. The hit must NOT propose and
    // must NOT strand the checkpoint at z_0: the interval-exhaustion update
    // rolls the checkpoint (rolls = 2), after which the lag-3 hit proposes
    // and the verifier accepts the primitive period. A stale checkpoint
    // (the pre-fix PoC behavior) would compare against z_0 at ever-growing
    // lags, never propose, and end unresolved.
    const scratch = new OrbitScratch(64);
    const sample = createOrbitSample();
    const metrics = createCheckpointMetrics();
    const options = resolveOrbitOptions({
      maxIterations: 512,
      maxPeriod: 4,
      exhaustionScan: false,
    });
    const result = classifyCheckpoint(
      -0.1225611668766535,
      0.7448617666197435,
      options,
      scratch,
      sample,
      metrics,
    );
    expect(result.status).toBe('attracting-cycle');
    expect(result.status === 'attracting-cycle' && result.period).toBe(3);
    expect(result.iterations).toBe(29);
    // Comparisons at iterations 24..29; the first (lag 24) and third (lag 24
    // rolled, then lag 2) comparisons roll the checkpoint.
    expect(metrics.lagComparisons).toBe(6);
    expect(metrics.checkpointRolls).toBe(2);
    expect(metrics.verifierCalls).toBe(1);
    expect(metrics.reArms).toBe(0);
  });

  it('retests a rejected candidate against the same retained state after a doubling re-arm gap', () => {
    // Hard-view anchor center (PoC corpus hard-view-anchor-24, parity-tested
    // against the reference kernel): its first proposal is divisor/closure
    // ambiguous and is REJECTED, consuming budget and re-arming; the retained
    // checkpoint is then retested at a longer, better-converged lag and the
    // second proposal is accepted.
    const scratch = new OrbitScratch(64);
    const sample = createOrbitSample();
    const metrics = createCheckpointMetrics();
    const result = classifyCheckpoint(0.305376533, 0.552677981, BALANCED, scratch, sample, metrics);
    expect(result.status).toBe('attracting-cycle');
    expect(result.status === 'attracting-cycle' && result.period).toBe(4);
    expect(metrics.verifierCalls).toBe(2);
    expect(metrics.verifierAmbiguous).toBe(1);
    expect(metrics.reArms).toBe(1);
    expect(metrics.lagComparisons).toBe(195);
    expect(metrics.verifierCalls).toBeLessThanOrEqual(CHECKPOINT_CANDIDATE_BUDGET);
  });

  it('keeps the whole schedule bookkeeping gated on cycleWarmup', () => {
    const scratch = new OrbitScratch(64);
    const sample = createOrbitSample();

    // Warmup at the orbit budget: the walk never activates (one comparison at
    // iteration 512, whose over-ceiling hit rolls the checkpoint), and the
    // exhaustion scan recovers the period-5 detection from the final state.
    const metrics = createCheckpointMetrics();
    const options = resolveOrbitOptions({ cycleWarmup: 512 });
    const result = classifyCheckpoint(-1.625413732, 0, options, scratch, sample, metrics);
    expect(result.status).toBe('attracting-cycle');
    expect(result.status === 'attracting-cycle' && result.period).toBe(5);
    expect(result.iterations).toBe(512);
    expect(metrics.lagComparisons).toBe(6); // 1 walk comparison + 5 scan lags
    expect(metrics.checkpointRolls).toBe(1);
    expect(metrics.verifierCalls).toBe(1);

    // Shifting the warmup by one shifts detection by one and leaves the
    // comparison count identical (determinism in the warmup option).
    const shifted = createCheckpointMetrics();
    const shiftedResult = classifyCheckpoint(
      -1.625413732,
      0,
      resolveOrbitOptions({ cycleWarmup: 25, exhaustionScan: false }),
      scratch,
      sample,
      shifted,
    );
    expect(shiftedResult.iterations).toBe(36);
    expect(shifted.lagComparisons).toBe(12);
    const baseline = createCheckpointMetrics();
    classifyCheckpoint(
      -1.625413732,
      0,
      resolveOrbitOptions({ exhaustionScan: false }),
      scratch,
      sample,
      baseline,
    );
    expect(baseline.lagComparisons).toBe(12);
    expect(baseline.verifierCalls).toBe(1);
  });

  it('runs the exhaustion scan only when enabled, verifier-gated, and budget-permitting', () => {
    const scratch = new OrbitScratch(64);
    const sample = createOrbitSample();
    const options = resolveOrbitOptions({ maxIterations: 512, maxPeriod: 3, cycleWarmup: 511 });

    // Exhaustion scan off: the single warmup-end comparison hits at lag 511
    // (over-ceiling, rolls) and the walk ends unresolved.
    const offMetrics = createCheckpointMetrics();
    const off = classifyCheckpoint(
      -0.1225611668766535,
      0.7448617666197435,
      resolveOrbitOptions({ ...options, exhaustionScan: false }),
      scratch,
      sample,
      offMetrics,
    );
    expect(off.status).toBe('unresolved');
    expect(off.iterations).toBe(512);
    expect(offMetrics.lagComparisons).toBe(2);
    expect(offMetrics.verifierCalls).toBe(0);

    // Exhaustion scan on (default): the final state is on the cycle, the
    // lag-3 scan hit proposes, and the verifier accepts the primitive
    // period 3 at the orbit-budget iteration.
    const onMetrics = createCheckpointMetrics();
    const on = classifyCheckpoint(
      -0.1225611668766535,
      0.7448617666197435,
      options,
      scratch,
      sample,
      onMetrics,
    );
    expect(on.status).toBe('attracting-cycle');
    expect(on.status === 'attracting-cycle' && on.period).toBe(3);
    expect(on.iterations).toBe(512);
    expect(onMetrics.lagComparisons).toBe(5); // 2 walk comparisons + 3 scan lags
    expect(onMetrics.checkpointRolls).toBe(1);
    expect(onMetrics.verifierCalls).toBe(1);
  });

  it('reuses scratch across pixels deterministically in any visit order', () => {
    const points: readonly (readonly [number, number])[] = [
      [-0.1225611668766535, 0.7448617666197435],
      [0.305376533, 0.552677981],
      [-1.625413732, 0],
      [-1.4011551890920506, 0],
      [-1, 1],
      [0.1, 0.1],
      [-0.1565201668337543, 1.0322471089228327],
    ];
    const run = (
      order: number[],
    ): {
      status: number;
      iterations: number;
      period: number;
      magnitude: number;
      comparisons: number;
      rolls: number;
    }[] => {
      const scratch = new OrbitScratch(64);
      const sample = createOrbitSample();
      const metrics = createCheckpointMetrics();
      const records: {
        status: number;
        iterations: number;
        period: number;
        magnitude: number;
        comparisons: number;
        rolls: number;
      }[] = [];
      for (const index of order) {
        const [re, im] =
          points[index] ??
          (() => {
            throw new Error('bad index');
          })();
        classifyCheckpointInto(re, im, BALANCED, scratch, sample, metrics);
        // OrbitSample contract: period/magnitude are defined only for
        // attracting records; capture zero otherwise.
        const attracting = sample.status === 2;
        records.push({
          status: sample.status,
          iterations: sample.iterations,
          period: attracting ? sample.period : 0,
          magnitude: attracting ? sample.multiplierMagnitude : 0,
          comparisons: metrics.lagComparisons,
          rolls: metrics.checkpointRolls,
        });
        resetCheckpointMetrics(metrics);
      }
      return records;
    };
    const forward = run(points.map((_, index) => index));
    const reversed = run([...points.keys()].reverse());
    expect(reversed.reverse()).toEqual(forward);
  });
});
