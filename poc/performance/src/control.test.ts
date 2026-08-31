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
    it(`agrees on status, period, iterations, evidence, and multiplier (${profile.label})`, () => {
      const classifier = new OrbitClassifier(profile.options);

      for (const point of samplePoints()) {
        const production = classifier.classify({ re: point.cRe, im: point.cIm });
        const control = kernel.classify(point.cRe, point.cIm, {
          ...profile.options,
          exhaustionScan: true,
        });

        expect(comparableFields(control)).toEqual(comparableFields(production));
      }
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
