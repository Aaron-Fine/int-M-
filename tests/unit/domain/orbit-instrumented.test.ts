import { describe, expect, it } from 'vitest';

import {
  classifyInto,
  classifyIntoInstrumented,
  createLegacyScanCounters,
  createOrbitSample,
  ORBIT_EVIDENCE_CODE,
  OrbitScratch,
  resolveOrbitOptions,
  type OrbitSample,
} from '../../../src/domain';
import { STRATA } from './legacy-differential';

/**
 * PR-plan §8 instrumentation parity: the instrumented legacy kernel must be
 * bit-identical to the lean classifyInto (same discipline as the verifier
 * body mirrored at its orbit.ts call site) and its counters must add up.
 */

const PROFILES = [
  { label: 'quick', maxIterations: 128, maxPeriod: 16 },
  { label: 'balanced', maxIterations: 512, maxPeriod: 32 },
  { label: 'detailed', maxIterations: 1024, maxPeriod: 64 },
] as const;

const sampleFieldsEqual = (lean: Readonly<OrbitSample>, counted: Readonly<OrbitSample>): boolean =>
  lean.status === counted.status &&
  lean.iterations === counted.iterations &&
  lean.evidence === counted.evidence &&
  lean.period === counted.period &&
  lean.multiplierRe === counted.multiplierRe &&
  lean.multiplierIm === counted.multiplierIm &&
  lean.multiplierMagnitude === counted.multiplierMagnitude &&
  lean.multiplierAngle === counted.multiplierAngle &&
  lean.stabilityExponent === counted.stabilityExponent &&
  lean.escapeIteration === counted.escapeIteration &&
  lean.smoothIteration === counted.smoothIteration &&
  lean.magnitudeSquared === counted.magnitudeSquared;

describe('instrumented legacy kernel parity with classifyInto', () => {
  for (const profile of PROFILES) {
    it(`classifies every stratified point bit-identically (${profile.label})`, () => {
      const options = resolveOrbitOptions(profile);
      const scratch = new OrbitScratch(options.maxPeriod);
      const lean = createOrbitSample();
      const counted = createOrbitSample();
      const counters = createLegacyScanCounters();
      for (const point of STRATA) {
        classifyInto(point.re, point.im, options, scratch, lean);
        classifyIntoInstrumented(point.re, point.im, options, scratch, counted, counters);
        expect(sampleFieldsEqual(lean, counted)).toBe(true);
      }
    });
  }
});

describe('instrumented legacy kernel counters', () => {
  const options = resolveOrbitOptions({ maxIterations: 512, maxPeriod: 32 });

  it('counts analytic fast-path hits without scan comparisons inside the cardioid', () => {
    const scratch = new OrbitScratch(options.maxPeriod);
    const counters = createLegacyScanCounters();
    const sample = createOrbitSample();
    // 5x5 grid fully inside the main cardioid.
    for (let row = 0; row < 5; row += 1) {
      for (let column = 0; column < 5; column += 1) {
        classifyIntoInstrumented(
          0.05 + column * 0.02,
          0.02 + row * 0.02,
          options,
          scratch,
          sample,
          counters,
        );
      }
    }
    expect(counters.analyticPathHits).toBe(25);
    expect(counters.lagComparisons).toBe(0);
    expect(counters.proposals).toBe(0);
    expect(counters.systematic1to4).toBe(0);
  });

  it('buckets accepted scan detections as systematic and the sum matches detections', () => {
    const scratch = new OrbitScratch(options.maxPeriod);
    const counters = createLegacyScanCounters();
    const sample = createOrbitSample();
    // Grid spanning interior (rabbit neighborhood), boundary, and exterior.
    const reCenter = -0.1225611668766535;
    const imCenter = 0.7448617666197435;
    let verifierDetections = 0;
    let analyticAccepts = 0;
    for (let row = 0; row < 12; row += 1) {
      for (let column = 0; column < 12; column += 1) {
        classifyIntoInstrumented(
          reCenter + (column - 5.5) * 0.02,
          imCenter + (row - 5.5) * 0.02,
          options,
          scratch,
          sample,
          counters,
        );
        if (sample.status !== 2) continue;
        if (sample.evidence === ORBIT_EVIDENCE_CODE.convergedCycle) verifierDetections += 1;
        else analyticAccepts += 1;
      }
    }
    const bucketSum =
      counters.systematic1to4 +
      counters.systematic5to8 +
      counters.systematic9to12 +
      counters.systematic13Plus;
    expect(bucketSum).toBe(verifierDetections);
    expect(counters.analyticPathHits).toBe(analyticAccepts);
    expect(counters.lagComparisons).toBeGreaterThan(0);
  });

  it('records proposals and reject reasons on boundary-heavy points', () => {
    const scratch = new OrbitScratch(options.maxPeriod);
    const counters = createLegacyScanCounters();
    const sample = createOrbitSample();
    // Elephant Valley filament comb (corpus mi-fallback-ambiguous-boundary):
    // lanes diverge, some points run long and reach the verifier.
    for (let row = 0; row < 8; row += 1) {
      for (let column = 0; column < 8; column += 1) {
        classifyIntoInstrumented(
          0.3 + (column - 3.5) * 0.002,
          0.008 + (row - 3.5) * 0.002,
          options,
          scratch,
          sample,
          counters,
        );
      }
    }
    expect(counters.lagComparisons).toBeGreaterThan(100);
    const rejectSum =
      counters.rejectsNoClosure +
      counters.rejectsNotAttracting +
      counters.rejectsNonFinite +
      counters.rejectsAmbiguous;
    // Every proposal either accepts (bucketed) or is counted in a reject
    // class; accepted + rejected must never exceed proposals.
    const accepted =
      counters.systematic1to4 +
      counters.systematic5to8 +
      counters.systematic9to12 +
      counters.systematic13Plus;
    expect(counters.proposals).toBeGreaterThanOrEqual(rejectSum + accepted);
  });

  it('counts escape-only pixels without any scan comparison before warmup', () => {
    const scratch = new OrbitScratch(options.maxPeriod);
    const counters = createLegacyScanCounters();
    const sample = createOrbitSample();
    classifyIntoInstrumented(3.0, 1.0, options, scratch, sample, counters);
    expect(sample.status).toBe(1);
    expect(sample.escapeIteration).toBeLessThan(options.cycleWarmup);
    expect(counters.lagComparisons).toBe(0);
    expect(counters.analyticPathHits).toBe(0);
  });
});
