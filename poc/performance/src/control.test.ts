import { describe, expect, it } from 'vitest';

import { buildCorpus } from './corpus.ts';
import { ControlKernel } from './kernels/control.ts';
import { OrbitClassifier } from '../../../src/domain/orbit.ts';
import type { OrbitOptions, OrbitResult } from '../../../src/domain/types.ts';

// Tests may cross the poc/ boundary into src/: runtime kernels never do.
// The control kernel must replicate the production classifier's observable
// semantics bit-for-bit under identical options.
type Corpus = ReturnType<typeof buildCorpus>;

const PROFILES: readonly { readonly label: string; readonly options: OrbitOptions }[] = [
  {
    label: 'quick',
    options: { maxIterations: 256, maxPeriod: 16, cycleTolerance: 1e-10, cycleWarmup: 24 },
  },
  {
    label: 'balanced',
    options: { maxIterations: 512, maxPeriod: 32, cycleTolerance: 1e-10, cycleWarmup: 24 },
  },
  {
    label: 'detailed',
    options: { maxIterations: 1024, maxPeriod: 64, cycleTolerance: 1e-10, cycleWarmup: 24 },
  },
];

const pick = (bucket: Corpus, index: number): Corpus[number] => {
  const point = bucket[index];
  if (point === undefined) {
    throw new Error('empty stratum bucket');
  }
  return point;
};

/** Deterministic stratified sample: first, middle, and last of each stratum. */
const samplePoints = (): Corpus => {
  const corpus = buildCorpus();
  const byStratum = new Map<string, Corpus>();
  for (const point of corpus) {
    const bucket = byStratum.get(point.stratum) ?? [];
    bucket.push(point);
    byStratum.set(point.stratum, bucket);
  }
  const sample: Corpus = [];
  for (const bucket of byStratum.values()) {
    sample.push(
      pick(bucket, 0),
      pick(bucket, Math.floor(bucket.length / 2)),
      pick(bucket, bucket.length - 1),
    );
  }
  return sample;
};

const comparableFields = (
  result: OrbitResult | ReturnType<ControlKernel['classify']>,
): Record<string, unknown> => {
  const base = {
    status: result.status === 'attracting' ? 'attracting-cycle' : result.status,
    iterations: result.iterations,
    evidence: Array.isArray(result.evidence) ? result.evidence.join('+') : result.evidence,
  };
  if (result.status === 'attracting') {
    return {
      ...base,
      period: result.period,
      multiplierMagnitude: result.multiplierMagnitude,
      multiplierAngle: result.multiplierAngle,
      stabilityExponent: result.kappa,
    };
  }
  if (result.status === 'attracting-cycle') {
    return {
      ...base,
      period: result.period,
      multiplierMagnitude: result.multiplierMagnitude,
      multiplierAngle: result.multiplierAngle,
      stabilityExponent: result.stabilityExponent,
    };
  }
  return base;
};

describe('control kernel parity with OrbitClassifier', () => {
  const kernel = new ControlKernel(64);

  for (const profile of PROFILES) {
    it(`agrees on status, iterations, and evidence, and on period except documented non-primitive legacy multiples (${profile.label})`, () => {
      const classifier = new OrbitClassifier(profile.options);
      let reduced = 0;
      let analyticPeriodThree = 0;
      let analyticPeriodFour = 0;

      for (const point of samplePoints()) {
        const production = classifier.classify({ re: point.cRe, im: point.cIm });
        const control = kernel.classify(point.cRe, point.cIm, {
          ...profile.options,
          exhaustionScan: true,
        });

        // PR 3 (common verifier): production acceptance is verifier-gated
        // while this control kernel stays a frozen, faithful LEGACY port —
        // that is its purpose as the differential baseline. The one
        // sanctioned divergence is the documented legacy flaw the
        // verifier's three-way proper-divisor policy fixes: the legacy
        // scan can report a non-primitive multiple of the primitive period
        // (binary64 rounding lets a multiple lag cross the proposal
        // threshold before the primitive lag; 2/3/3 results per profile
        // versus the dd oracle, poc/performance/results/summary.json).
        // On such pixels the verifier reports the primitive period and
        // recomputes the multiplier at that period, so the multiplier
        // fields legitimately differ; everywhere else parity is exact.
        // Every divergence is adjudicated against the dd oracle in
        // tests/unit/domain/orbit-oracle-adjudication.test.ts.
        // ADR 0010 and ADR 0013: the analytic period-3 and period-4 paths
        // answer instead of the lag scan (analytic multiplier, iterations 0).
        // The legacy control found the same primitive period, possibly as a
        // multiple, or ran out of budget; every such pixel is checked against
        // the dd period-3 or period-4 cycle in
        // tests/unit/domain/orbit-oracle-adjudication.test.ts.
        if (
          production.status === 'attracting-cycle' &&
          production.evidence[0] === 'analytic-period-3-component'
        ) {
          expect(production.period).toBe(3);
          if (control.status === 'attracting') {
            expect(control.period % 3).toBe(0);
          } else {
            expect(control.status).toBe('unresolved');
          }
          analyticPeriodThree += 1;
          continue;
        }
        if (
          production.status === 'attracting-cycle' &&
          production.evidence[0] === 'analytic-period-4-component'
        ) {
          expect(production.period).toBe(4);
          if (control.status === 'attracting') {
            expect(control.period % 4).toBe(0);
          } else {
            expect(control.status).toBe('unresolved');
          }
          analyticPeriodFour += 1;
          continue;
        }
        const productionFields = comparableFields(production);
        const controlFields = comparableFields(control);
        expect(controlFields['status']).toBe(productionFields['status']);
        expect(controlFields['iterations']).toBe(productionFields['iterations']);
        expect(controlFields['evidence']).toBe(productionFields['evidence']);

        if (control.status === 'attracting' && production.status === 'attracting-cycle') {
          expect(production.verifierRevision).toBe('src-verifier-1.0.0');
          if (control.period === production.period) {
            // comparableFields carries exactly the legacy-comparable fields
            // (it never includes the verifier revision), so exact equality
            // is the legacy-parity contract.
            expect(controlFields).toEqual(productionFields);
          } else {
            expect(production.period).toBeLessThan(control.period);
            expect(control.period % production.period).toBe(0);
            reduced += 1;
          }
        } else {
          expect(controlFields).toEqual(productionFields);
        }
      }
      // The stratified corpus sample's period-4 structure, which the legacy
      // scan reports as 8/12, takes the certified period-4 path since ADR 0013,
      // so no reduction remains in this sample; the reduction class stays
      // covered by tests/unit/domain/orbit-oracle-adjudication.test.ts
      // (period-5 reductions under the detailed profile).
      expect(reduced).toBe(0);
      // The sample's three rabbit-stratum points take the analytic path.
      expect(analyticPeriodThree).toBe(3);
      // Its three period-4 points take the certified period-4 path.
      expect(analyticPeriodFour).toBe(3);
    });
  }

  it('reports lag comparisons only for evaluated candidate lags', () => {
    // An exterior point escapes immediately: no lag comparisons at all.
    const escaped = kernel.classify(10, 10, {
      maxIterations: 256,
      maxPeriod: 16,
      cycleTolerance: 1e-10,
      cycleWarmup: 24,
      exhaustionScan: true,
    });
    expect(escaped.metrics.lagComparisons).toBe(0);

    // An unresolved point walks the full budget with all lags per iteration.
    const unresolved = kernel.classify(-1.4011551890920506, 0, {
      maxIterations: 256,
      maxPeriod: 16,
      cycleTolerance: 1e-10,
      cycleWarmup: 24,
      exhaustionScan: true,
    });
    expect(unresolved.status).toBe('unresolved');
    // Legacy scanning starts once iteration reaches cycleWarmup: iterations
    // 24..256 inclusive at 16 lags each.
    expect(unresolved.metrics.lagComparisons).toBe((256 - 24 + 1) * 16);
  });
});
