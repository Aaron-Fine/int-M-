import { describe, expect, it } from 'vitest';

import fixtureData from '../../../fixtures/orbits.v1.json' with { type: 'json' };
import {
  classifyCheckpointInto,
  classifyInto,
  createCheckpointMetrics,
  createOrbitSample,
  DEFAULT_VIEWPORT,
  materializeOrbitResult,
  OrbitClassifier,
  OrbitScratch,
  resolveOrbitOptions,
  type ClassifierMode,
  type OrbitOptions,
  type OrbitResult,
  type OrbitSample,
} from '../../../src/domain';
import { classifyRows } from '../../../src/render/classify-rows';
import { strataOracleVerdict } from './dd-oracle';
import { legacyClassifyOrbit, STRATA } from './legacy-differential';

/**
 * PR 4 M2: differential-mode plumbing and oracle cleanliness of the
 * checkpoint schedule (plan section 5, workstream C; the PR 3 adjudication
 * suite is the template and its dd oracle is reused from dd-oracle.ts).
 *
 * The differential mode ('classifierMode: "differential"') runs BOTH kernels
 * per pixel, reports the legacy answer, and counts disagreements into a
 * preallocated record. The differential may prove equivalence (zero
 * disagreements on the independent high-precision fixtures) or enumerate
 * oracle-backed differences (the stratified grid, where the checkpoint's
 * permissive scale-aware proposal bound and its exhaustion scan detect a
 * handful of additional cycles that the legacy scan misses at the same
 * budget — the direction the workstream C kill gate allows: the checkpoint
 * must never push MORE pixels unresolved).
 *
 * Kill-gate pins (plan section 5 workstream C), evaluated here on Node/V8
 * over the stratified grid and the fixtures; browser Stage A evidence is
 * the release-comparable record:
 * - zero false attracting results (release blocker),
 * - zero wrong primitive periods (release blocker),
 * - unresolved-rate delta <= 0 versus the legacy scan.
 */

interface ExpectedFixture {
  readonly status: string;
  readonly period?: number;
}

interface OrbitFixture {
  readonly id: string;
  readonly parameter: {
    readonly re: string;
    readonly im: string;
  };
  readonly classificationBudget: OrbitOptions;
  readonly expected: ExpectedFixture;
}

interface FixtureDocument {
  readonly binary64Tolerance: {
    readonly multiplierMagnitudeAbsolute: number;
  };
  readonly fixtures: readonly OrbitFixture[];
}

const fixtureDocument = fixtureData as FixtureDocument;

const PROFILES: readonly { readonly label: string; readonly options: Partial<OrbitOptions> }[] = [
  { label: 'quick', options: { maxIterations: 256, maxPeriod: 16 } },
  { label: 'balanced', options: {} },
  { label: 'detailed', options: { maxIterations: 1024, maxPeriod: 64 } },
];

/**
 * Declared detection-phase multiplier tolerance. The schedule (unlike the
 * all-lag scan) proposes as soon as the verifier's scale-aware closure bound
 * passes, so for weakly attracting cycles the reported lambda is the
 * derivative at the detection-time state: an honest floating estimate whose
 * residual convergence bias against the oracle's polished cycle is bounded
 * by 1e-5 absolute on the whole stratified grid (maximum observed 7.8e-6 on
 * the weak-attraction hard anchor). Status and primitive period carry no
 * such tolerance: they are certified categorically by the oracle.
 */
const MULTIPLIER_DETECTION_TOLERANCE = 1e-5;

const classifyWithCheckpoint = (
  cRe: number,
  cIm: number,
  options: ReturnType<typeof resolveOrbitOptions>,
  scratch: OrbitScratch,
  sample: OrbitSample,
  metrics = createCheckpointMetrics(),
): void => {
  classifyCheckpointInto(cRe, cIm, options, scratch, sample, metrics);
};

const checkpointStatusOf = (sample: Readonly<OrbitSample>): OrbitResult['status'] =>
  sample.status === 2 ? 'attracting-cycle' : sample.status === 1 ? 'escaped' : 'unresolved';

describe('differential classifier mode on the standard fixtures', () => {
  it('records zero status and period disagreements; multiplier bit differences stay inside the declared binary64 tolerance', () => {
    let pixels = 0;
    let statusDisagreements = 0;
    let periodDisagreements = 0;
    let multiplierBitDifferences = 0;
    for (const fixture of fixtureDocument.fixtures) {
      const options = resolveOrbitOptions({
        ...fixture.classificationBudget,
        classifierMode: 'differential',
      });
      const classifier = new OrbitClassifier(options, new OrbitScratch(options.maxPeriod));
      const sample = createOrbitSample();
      classifier.classifyInto(Number(fixture.parameter.re), Number(fixture.parameter.im), sample);
      const stats = classifier.differentialStats;
      expect(stats).not.toBeNull();
      pixels += stats?.pixels ?? 0;
      statusDisagreements += stats?.statusDisagreements ?? Number.NaN;
      periodDisagreements += stats?.periodDisagreements ?? Number.NaN;
      multiplierBitDifferences += stats?.multiplierMagnitudeDisagreements ?? Number.NaN;

      // The reported answer is the legacy one and matches the fixture.
      const result = materializeOrbitResult(sample);
      expect(result.status).toBe(fixture.expected.status);
    }
    expect(pixels).toBe(fixtureDocument.fixtures.length);
    expect(statusDisagreements).toBe(0);
    expect(periodDisagreements).toBe(0);
    // Detection at different iterations of a converging orbit can round the
    // multiplier differently in the last bits; every such difference must
    // stay inside the document's declared binary64 tolerance (re-derived on
    // the affected fixtures below).
    expect(multiplierBitDifferences).toBeLessThanOrEqual(2);
    for (const fixture of fixtureDocument.fixtures) {
      const options = resolveOrbitOptions(fixture.classificationBudget);
      const scratch = new OrbitScratch(options.maxPeriod);
      const legacySample = createOrbitSample();
      const checkpointSample = createOrbitSample();
      classifyInto(
        Number(fixture.parameter.re),
        Number(fixture.parameter.im),
        options,
        scratch,
        legacySample,
      );
      classifyWithCheckpoint(
        Number(fixture.parameter.re),
        Number(fixture.parameter.im),
        options,
        scratch,
        checkpointSample,
      );
      if (
        legacySample.status === 2 &&
        checkpointSample.status === 2 &&
        legacySample.multiplierMagnitude !== checkpointSample.multiplierMagnitude
      ) {
        expect(
          Math.abs(legacySample.multiplierMagnitude - checkpointSample.multiplierMagnitude),
        ).toBeLessThanOrEqual(fixtureDocument.binary64Tolerance.multiplierMagnitudeAbsolute);
      }
    }
  });
});

describe('differential classifier mode on the stratified grid', () => {
  for (const profile of PROFILES) {
    /* eslint-disable complexity -- the branch count is the workstream C decision table: kill gates plus oracle adjudication of each disagreement class */
    it(`enumerates only oracle-backed differences with unresolved-rate delta <= 0 (${profile.label})`, () => {
      const options = resolveOrbitOptions({ ...profile.options, classifierMode: 'differential' });
      const legacyOptions = resolveOrbitOptions(profile.options);
      const classifier = new OrbitClassifier(options, new OrbitScratch(options.maxPeriod));
      const sample = createOrbitSample();
      const legacyResults: OrbitResult[] = [];
      for (const point of STRATA) {
        classifier.classifyInto(point.re, point.im, sample);
        legacyResults.push(legacyClassifyOrbit(point, legacyOptions));
      }
      const stats = classifier.differentialStats;
      expect(stats).not.toBeNull();
      expect(stats?.pixels).toBe(STRATA.length);
      // Primitive periods of matched detections agree everywhere.
      expect(stats?.periodDisagreements).toBe(0);
      // Status disagreements exist only in the allowed direction: the
      // checkpoint detects cycles the legacy scan misses at the same budget
      // (permissive scale-aware proposal bound + exhaustion scan), and each
      // one is certified by the dd oracle with the same primitive period.
      const expectedExtraDetections: Record<string, number> = {
        quick: 10,
        balanced: 2,
        detailed: 2,
      };
      expect(stats?.statusDisagreements).toBe(expectedExtraDetections[profile.label]);
      expect((stats?.checkpointAttracting ?? 0) - (stats?.legacyAttracting ?? 0)).toBe(
        stats?.statusDisagreements,
      );
      // Workstream C kill gate: unresolved rate may only improve.
      expect(
        (stats?.checkpointUnresolved ?? Number.NaN) - (stats?.legacyUnresolved ?? Number.NaN),
      ).toBeLessThanOrEqual(0);

      // Adjudicate every status disagreement against the oracle.
      const scratch = new OrbitScratch(options.maxPeriod);
      const checkpointSample = createOrbitSample();
      const checkpointMetrics = createCheckpointMetrics();
      let extraDetections = 0;
      for (let index = 0; index < STRATA.length; index += 1) {
        const point = STRATA[index];
        const legacy = legacyResults[index];
        if (point === undefined || legacy === undefined) {
          throw new Error('empty grid slot');
        }
        classifyWithCheckpoint(
          point.re,
          point.im,
          legacyOptions,
          scratch,
          checkpointSample,
          checkpointMetrics,
        );
        if (legacy.status === checkpointStatusOf(checkpointSample)) {
          continue;
        }
        extraDetections += 1;
        const oracle = strataOracleVerdict(index, STRATA.length);
        expect(oracle.status, `grid point ${String(index)} must be oracle-certified`).toBe(
          'attracting-cycle',
        );
        expect(checkpointSample.period).toBe(
          oracle.status === 'attracting-cycle' ? oracle.cycle.primitive : Number.NaN,
        );
      }
      expect(extraDetections).toBe(stats?.statusDisagreements);

      // Matched detections: |lambda| differences stay inside the declared
      // detection-phase tolerance (the differential counts raw bits; the
      // tolerance adjudicates the class).
      let multiplierBitDifferences = 0;
      const legacyScratch = new OrbitScratch(options.maxPeriod);
      const legacySample = createOrbitSample();
      for (const point of STRATA) {
        classifyInto(point.re, point.im, legacyOptions, legacyScratch, legacySample);
        classifyWithCheckpoint(
          point.re,
          point.im,
          legacyOptions,
          scratch,
          checkpointSample,
          checkpointMetrics,
        );
        if (
          legacySample.status === 2 &&
          checkpointSample.status === 2 &&
          legacySample.multiplierMagnitude !== checkpointSample.multiplierMagnitude
        ) {
          multiplierBitDifferences += 1;
          expect(
            Math.abs(legacySample.multiplierMagnitude - checkpointSample.multiplierMagnitude),
          ).toBeLessThanOrEqual(MULTIPLIER_DETECTION_TOLERANCE);
        }
      }
      expect(multiplierBitDifferences).toBe(stats?.multiplierMagnitudeDisagreements);
    });
    /* eslint-enable complexity */
  }
});

describe('checkpoint mode dd-oracle cleanliness (workstream C kill gate)', () => {
  for (const profile of PROFILES) {
    it(`certifies every attracting claim: zero false attracting, zero wrong primitive periods, multiplier inside the declared tolerance (${profile.label})`, () => {
      const options = resolveOrbitOptions(profile.options);
      const scratch = new OrbitScratch(options.maxPeriod);
      const checkpointSample = createOrbitSample();
      const metrics = createCheckpointMetrics();
      let certified = 0;
      let falseAttracting = 0;
      let wrongPrimitivePeriod = 0;
      let unadjudicated = 0;
      for (let index = 0; index < STRATA.length; index += 1) {
        const point = STRATA[index];
        if (point === undefined) {
          throw new Error('empty grid slot');
        }
        classifyWithCheckpoint(point.re, point.im, options, scratch, checkpointSample, metrics);
        if (checkpointSample.status !== 2) {
          continue;
        }
        const oracle = strataOracleVerdict(index, STRATA.length);
        if (oracle.status === 'escaped') {
          falseAttracting += 1;
          continue;
        }
        if (oracle.status === 'unresolved') {
          // The oracle's 4096-iteration budget cannot reach this cycle;
          // unadjudicated, never false (PR 3 pattern).
          unadjudicated += 1;
          continue;
        }
        if (checkpointSample.period !== oracle.cycle.primitive) {
          wrongPrimitivePeriod += 1;
          continue;
        }
        certified += 1;
        if (checkpointSample.multiplierMagnitude === 0) {
          // Superattracting identity (plan section 3).
          expect(oracle.cycle.magnitude).toBeLessThanOrEqual(1e-7);
        } else {
          expect(
            Math.abs(checkpointSample.multiplierMagnitude - oracle.cycle.magnitude),
          ).toBeLessThanOrEqual(MULTIPLIER_DETECTION_TOLERANCE);
        }
      }
      expect(certified).toBeGreaterThan(0);
      expect(falseAttracting).toBe(0);
      expect(wrongPrimitivePeriod).toBe(0);
      expect(unadjudicated).toBeGreaterThan(0);
    });
  }
});

describe('classifier-mode plumbing', () => {
  it('keeps legacy-scan the default with scan-identical detection', () => {
    // The legacy scan detects this period-5 point at its first warmup
    // iteration; the checkpoint schedule detects it at iteration 35.
    const point = { re: -1.625413732, im: 0 };
    const defaultClassifier = new OrbitClassifier(resolveOrbitOptions({}));
    const sample = createOrbitSample();
    defaultClassifier.classifyInto(point.re, point.im, sample);
    expect(sample.iterations).toBe(24);
    expect(defaultClassifier.differentialStats).toBeNull();

    const checkpointClassifier = new OrbitClassifier(
      resolveOrbitOptions({ classifierMode: 'checkpoint' }),
    );
    const checkpointSample = createOrbitSample();
    checkpointClassifier.classifyInto(point.re, point.im, checkpointSample);
    expect(checkpointSample.iterations).toBe(35);
    expect(checkpointClassifier.differentialStats).toBeNull();
  });

  it('reports the legacy answer in differential mode while counting both kernels', () => {
    const point = { re: -1.625413732, im: 0 };
    const classifier = new OrbitClassifier(resolveOrbitOptions({ classifierMode: 'differential' }));
    const sample = createOrbitSample();
    classifier.classifyInto(point.re, point.im, sample);
    // Reported: the legacy scan's record.
    expect(sample.iterations).toBe(24);
    expect(sample.status).toBe(2);
    const stats = classifier.differentialStats;
    expect(stats?.pixels).toBe(1);
    expect(stats?.statusDisagreements).toBe(0);
    expect(stats?.periodDisagreements).toBe(0);
  });

  it('rejects unknown modes', () => {
    expect(() =>
      resolveOrbitOptions({ classifierMode: 'turbo' as unknown as ClassifierMode }),
    ).toThrow(RangeError);
  });

  it('threads the mode through classifyRows without protocol changes', async () => {
    const size = { width: 12, height: 10 };
    const quality = { maxIterations: 256, maxPeriod: 16, coarseStride: 4 };
    const request = { viewport: DEFAULT_VIEWPORT, size, quality };
    const signal = new AbortController().signal;

    const legacyBand = await classifyRows(request, quality, 1, 0, size.height, signal);
    expect(legacyBand.differential).toBeUndefined();

    const differentialBand = await classifyRows(
      request,
      quality,
      1,
      0,
      size.height,
      signal,
      'differential',
    );
    // Band content is the legacy answer; the record counts the comparison.
    expect(differentialBand.packedStatusPeriod).toEqual(legacyBand.packedStatusPeriod);
    expect(differentialBand.smoothIterationOrMultiplierMagnitude).toEqual(
      legacyBand.smoothIterationOrMultiplierMagnitude,
    );
    expect(differentialBand.differential?.pixels).toBe(size.width * size.height);
    expect(differentialBand.differential?.statusDisagreements).toBe(0);
    expect(differentialBand.differential?.periodDisagreements).toBe(0);
    expect(
      (differentialBand.differential?.checkpointUnresolved ?? 0) -
        (differentialBand.differential?.legacyUnresolved ?? 0),
    ).toBeLessThanOrEqual(0);
  });
});
