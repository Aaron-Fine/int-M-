import { describe, expect, it } from 'vitest';

import fixtureData from '../../../fixtures/orbits.v1.json' with { type: 'json' };
import {
  classifyInto,
  createOrbitSample,
  materializeOrbitResult,
  ORBIT_EVIDENCE_CODE,
  OrbitClassifier,
  resolveOrbitOptions,
  OrbitScratch,
  VERIFIER_REVISION,
  type OrbitOptions,
  type OrbitResult,
} from '../../../src/domain';
import type { EvidenceFlag } from '../../../src/domain';
import {
  boundaryPoints,
  legacyClassifyOrbit,
  rabbitPoints,
  STRATA,
  superattractingPoints,
} from './legacy-differential';

/**
 * Differential test for the allocation-free scalar core. The reference is a
 * verbatim port of the pre-PR2 classifier
 * (tests/unit/domain/legacy-differential.ts); the reference deliberately does
 * NOT run the common verifier, so this file measures exactly what PR 3
 * changed on top of PR 2. Since PR 3 (common verifier, plan section 3),
 * acceptance is verifier-gated and the parity contract is:
 *
 * - escaped and unresolved results must match legacy exactly;
 * - attracting results must match legacy exactly whenever the primitive
 *   period is unchanged (multiplier bits included), plus the verifier
 *   revision field;
 * - the only permitted divergence is the documented legacy flaw the
 *   verifier's three-way proper-divisor policy fixes: the legacy scan
 *   reported a non-primitive multiple of the primitive period (binary64
 *   rounding let a multiple lag cross the proposal threshold first), and
 *   the verifier reduces it and recomputes the multiplier at the primitive
 *   period. Every such divergence is adjudicated against the double-double
 *   oracle in the oracle-adjudication section below.
 */

const stripResultMetadata = (
  result: OrbitResult,
):
  | Omit<
      Extract<OrbitResult, { status: 'attracting-cycle' }>,
      'verifierRevision' | 'evidenceSource'
    >
  | OrbitResult => {
  if (result.status !== 'attracting-cycle') {
    return result;
  }
  const { verifierRevision, evidenceSource, ...rest } = result;
  expect(verifierRevision).toBe(VERIFIER_REVISION);
  // PR 5 evidence-source stamp: origin metadata only, present on every rich
  // attracting result; the legacy reference predates it and is compared
  // without it (the differential below pins the classification fields).
  expect(evidenceSource).toBeDefined();
  return rest;
};

/**
 * Production-vs-legacy parity under the PR 3 contract: exact everywhere
 * except the primitive-period reduction of non-primitive legacy multiples.
 */
const expectLegacyParity = (production: OrbitResult, legacy: OrbitResult): void => {
  if (production.status === 'attracting-cycle' && legacy.status === 'attracting-cycle') {
    if (production.period === legacy.period) {
      expect(stripResultMetadata(production)).toEqual(legacy);
      return;
    }
    // Documented divergence (M3 adjudicates each against the dd oracle):
    // legacy reported a non-primitive multiple of the primitive period.
    expect(production.period).toBeLessThan(legacy.period);
    expect(legacy.period % production.period).toBe(0);
    return;
  }
  expect(stripResultMetadata(production)).toEqual(legacy);
};

const PROFILES: readonly { readonly label: string; readonly options: Partial<OrbitOptions> }[] = [
  { label: 'quick', options: { maxIterations: 256, maxPeriod: 16 } },
  { label: 'default', options: {} },
];

interface FixtureDocument {
  readonly binary64Tolerance: {
    readonly multiplierMagnitudeAbsolute: number;
  };
  readonly fixtures: readonly {
    readonly id: string;
    readonly parameter: { readonly re: string; readonly im: string };
    readonly classificationBudget: OrbitOptions;
    readonly expected: {
      readonly status: OrbitResult['status'];
      readonly escapeIteration?: number;
      readonly period?: number;
      readonly multiplier?: { readonly magnitude: string };
    };
  }[];
}

const fixtureDocument = fixtureData as FixtureDocument;

describe('scalar core parity with the legacy classifier', () => {
  const scratch = new OrbitScratch(64);
  const sample = createOrbitSample();

  const classifyScalar = (
    point: { readonly re: number; readonly im: number },
    options: Partial<OrbitOptions>,
  ): OrbitResult => {
    classifyInto(point.re, point.im, resolveOrbitOptions(options), scratch, sample);
    return materializeOrbitResult(sample);
  };

  for (const profile of PROFILES) {
    it(`matches the legacy reference on every differential stratum (${profile.label})`, () => {
      const reductions: string[] = [];
      for (const [index, point] of STRATA.entries()) {
        const options = resolveOrbitOptions(profile.options);
        const production = classifyScalar(point, profile.options);
        const legacy = legacyClassifyOrbit(point, options);
        if (
          production.status === 'attracting-cycle' &&
          legacy.status === 'attracting-cycle' &&
          production.period !== legacy.period
        ) {
          reductions.push(`${index}:${legacy.period}->${production.period}`);
        }
        expectLegacyParity(production, legacy);
      }
      // Pin the exact divergence set of the documented legacy flaw: the
      // legacy scan reported these non-primitive multiples (binary64
      // rounding let a multiple lag cross the proposal threshold before the
      // primitive lag), and the verifier reduced them. Any change here is a
      // semantic change and must be re-adjudicated against the dd oracle.
      const expectedReductions: Record<string, readonly string[]> = {
        quick: ['618:6->3', '2474:6->3', '3185:8->4', '3190:8->4', '3195:8->4', '3200:8->4'],
        default: [
          '617:6->3',
          '618:6->3',
          '680:12->3',
          '947:8->4',
          '2163:8->4',
          '2408:12->3',
          '2473:6->3',
          '2474:6->3',
          '3178:12->4',
          '3185:8->4',
          '3190:8->4',
          '3195:8->4',
          '3200:8->4',
        ],
      };
      expect(reductions).toEqual(expectedReductions[profile.label] ?? []);
    });
  }

  it('matches the legacy reference and the independent fixtures through the scalar core', () => {
    for (const fixture of fixtureDocument.fixtures) {
      const point = {
        re: Number(fixture.parameter.re),
        im: Number(fixture.parameter.im),
      };
      const options = resolveOrbitOptions(fixture.classificationBudget);
      const result = classifyScalar(point, fixture.classificationBudget);

      expectLegacyParity(result, legacyClassifyOrbit(point, options));
      expect(result.status).toBe(fixture.expected.status);
      if (result.status === 'escaped') {
        expect(result.escapeIteration).toBe(fixture.expected.escapeIteration);
      }
      if (result.status === 'attracting-cycle') {
        expect(result.period).toBe(fixture.expected.period);
        expect(
          Math.abs(result.multiplierMagnitude - Number(fixture.expected.multiplier?.magnitude)),
        ).toBeLessThanOrEqual(fixtureDocument.binary64Tolerance.multiplierMagnitudeAbsolute);
      }
    }
  });

  it('reuses one sample record and scratch without leaking state between points', () => {
    const options = { maxIterations: 512, maxPeriod: 8, cycleWarmup: 12 };
    const resolved = resolveOrbitOptions(options);
    const attracting = { re: -0.1205, im: 0.7438 };
    const escaped = { re: 1, im: 1 };
    const fresh = (point: { readonly re: number; readonly im: number }): OrbitResult => {
      const freshSample = createOrbitSample();
      classifyInto(point.re, point.im, resolved, new OrbitScratch(8), freshSample);
      return materializeOrbitResult(freshSample);
    };
    const reused = (point: { readonly re: number; readonly im: number }): OrbitResult =>
      classifyScalar(point, options);

    expect(reused(attracting)).toEqual(fresh(attracting));
    expect(reused(escaped)).toEqual(fresh(escaped));
    expect(reused(attracting)).toEqual(fresh(attracting));
    expectLegacyParity(reused(attracting), legacyClassifyOrbit(attracting, resolved));
  });

  it('maps primitive evidence codes to the legacy evidence strings', () => {
    const expected: readonly (readonly [number, readonly EvidenceFlag[]])[] = [
      [ORBIT_EVIDENCE_CODE.escapeRadius, ['escape-radius']],
      [ORBIT_EVIDENCE_CODE.analyticMainCardioid, ['analytic-main-cardioid']],
      [ORBIT_EVIDENCE_CODE.analyticPeriod2Bulb, ['analytic-period-2-bulb']],
      [ORBIT_EVIDENCE_CODE.convergedCycle, ['converged-cycle']],
      [ORBIT_EVIDENCE_CODE.iterationLimit, ['iteration-limit']],
    ];
    for (const [code, evidence] of expected) {
      expect(materializeOrbitResult({ ...createOrbitSample(), evidence: code }).evidence).toEqual(
        evidence,
      );
    }
  });

  it('keeps OrbitClassifier.classify identical to the legacy reference', () => {
    const classifier = new OrbitClassifier({ maxIterations: 512, maxPeriod: 32 });
    const options = resolveOrbitOptions({ maxIterations: 512, maxPeriod: 32 });
    for (const point of [...superattractingPoints(), ...rabbitPoints(), ...boundaryPoints()]) {
      expectLegacyParity(classifier.classify(point), legacyClassifyOrbit(point, options));
    }
  });
});
