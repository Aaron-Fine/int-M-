import { describe, expect, it } from 'vitest';

import { buildCorpus } from './corpus.ts';
import { CheckpointKernel, CHECKPOINT_REVISION } from './kernels/checkpoint.ts';
import {
  CHECKPOINT_CANDIDATE_BUDGET,
  CHECKPOINT_REVISION as SRC_CHECKPOINT_REVISION,
  classifyCheckpointInto,
  createCheckpointMetrics,
  createOrbitSample,
  OrbitScratch,
  resetCheckpointMetrics,
  resolveOrbitOptions,
} from '../../../src/domain';

// Tests may cross the poc/ boundary into src/: runtime kernels never do.
// PR 4 port parity: the production checkpoint schedule (src/domain/
// checkpoint.ts) must replicate the frozen PoC reference kernel
// (poc-checkpoint-1.0.1) exactly on the PoC corpus — status, iterations,
// period, multiplier bits, and the deterministic lag-comparison and
// verifier-call counters — under every profile, with the exhaustion scan on
// and off. The one documented divergence class is analytic: the PoC kernel
// accepts its closed forms ungated, while src has applied the frozen
// attraction margin since PR 3, so a margin-adjacent analytic point falls
// through to the schedule in src. Every such divergence must be a PoC
// analytic acceptance that src refuses to walk (never the reverse).

const PROFILES: readonly {
  readonly label: string;
  readonly maxIterations: number;
  readonly maxPeriod: number;
}[] = [
  { label: 'quick', maxIterations: 256, maxPeriod: 16 },
  { label: 'balanced', maxIterations: 512, maxPeriod: 32 },
  { label: 'detailed', maxIterations: 1024, maxPeriod: 64 },
];

describe('src checkpoint schedule parity with the poc-checkpoint-1.0.1 reference', () => {
  const corpus = buildCorpus();

  for (const profile of PROFILES) {
    for (const exhaustionScan of [true, false]) {
      it(`agrees on status, iterations, period, multiplier bits, and deterministic counters (${profile.label}, exhaustion ${exhaustionScan ? 'on' : 'off'})`, () => {
        const reference = new CheckpointKernel(64);
        const options = resolveOrbitOptions({
          maxIterations: profile.maxIterations,
          maxPeriod: profile.maxPeriod,
          exhaustionScan,
        });
        const scratch = new OrbitScratch(profile.maxPeriod);
        const sample = createOrbitSample();
        const metrics = createCheckpointMetrics();
        let analyticMarginDivergences = 0;

        for (const point of corpus) {
          const kernelOptions = {
            maxIterations: profile.maxIterations,
            maxPeriod: profile.maxPeriod,
            cycleTolerance: 1e-10,
            cycleWarmup: 24,
            exhaustionScan,
          };
          const poc = reference.classify(point.cRe, point.cIm, kernelOptions);
          classifyCheckpointInto(point.cRe, point.cIm, options, scratch, sample, metrics);

          const srcStatus =
            sample.status === 2 ? 'attracting' : sample.status === 1 ? 'escaped' : 'unresolved';
          expect(srcStatus, `${point.id} status`).toBe(poc.status);
          expect(sample.iterations, `${point.id} iterations`).toBe(poc.iterations);
          if (poc.status === 'attracting') {
            expect(sample.period, `${point.id} period`).toBe(poc.period);
            // The two frozen verifier policies differ ONLY in the |lambda|
            // magnitude definition: the PoC computes sqrt(re^2 + im^2), src
            // keeps the legacy Math.hypot definition (orbit.ts documents why:
            // identical multiplier bits with the legacy classifier). Same
            // derivative bits, last-ulp rounding difference only, so the pin
            // allows a couple of ulps here and requires exactness everywhere
            // else (period, angle, counters).
            const magnitudeGap = Math.abs(sample.multiplierMagnitude - poc.multiplierMagnitude);
            expect(magnitudeGap, `${point.id} |lambda| within a few ulps`).toBeLessThanOrEqual(
              Number.EPSILON * 4 * poc.multiplierMagnitude,
            );
            expect(sample.multiplierAngle, `${point.id} arg`).toBe(poc.multiplierAngle);
          }
          // Deterministic cost counters of the shared subset.
          expect(metrics.lagComparisons, `${point.id} lagComparisons`).toBe(
            poc.metrics.lagComparisons,
          );
          expect(metrics.verifierCalls, `${point.id} verifierCalls`).toBe(
            poc.metrics.verifierCalls,
          );
          expect(metrics.verifierAmbiguous, `${point.id} verifierAmbiguous`).toBe(
            poc.metrics.verifierAmbiguous,
          );
          expect(metrics.rejectedNonFinite, `${point.id} rejectedNonFinite`).toBe(
            poc.metrics.rejectedNonFinite,
          );
          expect(metrics.rejectedNoClosure, `${point.id} rejectedNoClosure`).toBe(
            poc.metrics.rejectedNoClosure,
          );
          expect(metrics.rejectedNotAttracting, `${point.id} rejectedNotAttracting`).toBe(
            poc.metrics.rejectedNotAttracting,
          );
          expect(metrics.verifierCalls, `${point.id} budget invariant`).toBeLessThanOrEqual(
            CHECKPOINT_CANDIDATE_BUDGET,
          );

          if (poc.status === 'attracting' && srcStatus !== 'attracting') {
            // The only sanctioned divergence: the PoC accepted an analytic
            // closed form that src's margin refuses (the point then walks).
            // The corpus cardioid/bulb strata are the candidates.
            expect(
              point.stratum === 'cardioid' || point.stratum === 'period-2-bulb',
              `${point.id}: unexpected PoC-only acceptance outside the analytic strata`,
            ).toBe(true);
            analyticMarginDivergences += 1;
          }
          resetCheckpointMetrics(metrics);
        }
        // The corpus cardioid/bulb samples are interior enough that the
        // margin-adjacent shell is (as of this corpus revision) absent; if a
        // corpus revision adds margin-adjacent analytic points, this pin
        // documents the count instead of hiding it.
        expect(analyticMarginDivergences).toBe(0);
      });
    }
  }

  it('pins the frozen revisions and budget', () => {
    expect(SRC_CHECKPOINT_REVISION).toBe('src-checkpoint-1.0.0');
    expect(CHECKPOINT_REVISION).toBe('poc-checkpoint-1.0.1');
    expect(CHECKPOINT_CANDIDATE_BUDGET).toBe(64);
  });
});
