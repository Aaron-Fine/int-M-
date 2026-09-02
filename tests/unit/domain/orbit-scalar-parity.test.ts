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
import type { AttractingCycleOrbitResult, Complex, EvidenceFlag } from '../../../src/domain';

/**
 * Differential test for the allocation-free scalar core. The reference is a
 * verbatim port of the pre-PR2 classifier (src/domain/orbit.ts at
 * feature/phase-2-performance); the reference deliberately does NOT run the
 * common verifier, so this file measures exactly what PR 3 changed on top of
 * PR 2. Since PR 3 (common verifier, plan section 3), acceptance is
 * verifier-gated and the parity contract is:
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

const stripVerifierRevision = (
  result: OrbitResult,
): Omit<Extract<OrbitResult, { status: 'attracting-cycle' }>, 'verifierRevision'> | OrbitResult => {
  if (result.status !== 'attracting-cycle') {
    return result;
  }
  const { verifierRevision, ...rest } = result;
  expect(verifierRevision).toBe(VERIFIER_REVISION);
  return rest;
};

/**
 * Production-vs-legacy parity under the PR 3 contract: exact everywhere
 * except the primitive-period reduction of non-primitive legacy multiples.
 */
const expectLegacyParity = (production: OrbitResult, legacy: OrbitResult): void => {
  if (production.status === 'attracting-cycle' && legacy.status === 'attracting-cycle') {
    if (production.period === legacy.period) {
      expect(stripVerifierRevision(production)).toEqual(legacy);
      return;
    }
    // Documented divergence (M3 adjudicates each against the dd oracle):
    // legacy reported a non-primitive multiple of the primitive period.
    expect(production.period).toBeLessThan(legacy.period);
    expect(legacy.period % production.period).toBe(0);
    return;
  }
  expect(stripVerifierRevision(production)).toEqual(legacy);
};

// ---------------------------------------------------------------------------
// Legacy reference (verbatim pre-PR2 algorithm; allocating by design).
// ---------------------------------------------------------------------------

const legacyComplexSqrt = (value: Complex): Complex => {
  const magnitude = Math.hypot(value.re, value.im);
  return {
    re: Math.sqrt(Math.max(0, (magnitude + value.re) / 2)),
    im:
      value.im < 0
        ? -Math.sqrt(Math.max(0, (magnitude - value.re) / 2))
        : Math.sqrt(Math.max(0, (magnitude - value.re) / 2)),
  };
};

const legacyStabilityExponent = (multiplierMagnitude: number, period: number): number =>
  multiplierMagnitude === 0 ? Number.POSITIVE_INFINITY : -Math.log(multiplierMagnitude) / period;

const legacyCycleResult = (
  period: number,
  multiplier: Complex,
  iterations: number,
  evidence: AttractingCycleOrbitResult['evidence'],
): AttractingCycleOrbitResult => {
  const multiplierMagnitude = Math.hypot(multiplier.re, multiplier.im);
  return {
    status: 'attracting-cycle',
    iterations,
    evidence,
    period,
    multiplierMagnitude,
    multiplierAngle: multiplierMagnitude === 0 ? 0 : Math.atan2(multiplier.im, multiplier.re),
    stabilityExponent: legacyStabilityExponent(multiplierMagnitude, period),
  };
};

const legacyAnalyticInterior = (c: Complex): AttractingCycleOrbitResult | undefined => {
  const x = c.re;
  const ySquared = c.im * c.im;
  const cardioidX = x - 0.25;
  const q = cardioidX * cardioidX + ySquared;

  if (q * (q + cardioidX) < 0.25 * ySquared) {
    const discriminantRoot = legacyComplexSqrt({ re: 1 - 4 * x, im: -4 * c.im });
    const multiplier = {
      re: 1 - discriminantRoot.re,
      im: -discriminantRoot.im,
    };
    return legacyCycleResult(1, multiplier, 0, ['analytic-main-cardioid']);
  }

  const bulbX = x + 1;
  if (bulbX * bulbX + ySquared < 1 / 16) {
    return legacyCycleResult(2, { re: 4 * bulbX, im: 4 * c.im }, 0, ['analytic-period-2-bulb']);
  }

  return undefined;
};

const legacyCycleMultiplier = (
  cycleStartRe: number,
  cycleStartIm: number,
  c: Complex,
  period: number,
  closureToleranceSquared: number,
): {
  readonly re: number;
  readonly im: number;
  readonly magnitude: number;
  readonly closes: boolean;
} => {
  let zRe = cycleStartRe;
  let zIm = cycleStartIm;
  let derivativeRe = 1;
  let derivativeIm = 0;

  for (let index = 0; index < period; index += 1) {
    const nextDerivativeRe = derivativeRe * (2 * zRe) - derivativeIm * (2 * zIm);
    derivativeIm = derivativeRe * (2 * zIm) + derivativeIm * (2 * zRe);
    derivativeRe = nextDerivativeRe;

    const nextRe = zRe * zRe - zIm * zIm + c.re;
    zIm = 2 * zRe * zIm + c.im;
    zRe = nextRe;
  }

  const closureRe = zRe - cycleStartRe;
  const closureIm = zIm - cycleStartIm;
  return {
    re: derivativeRe,
    im: derivativeIm,
    magnitude: Math.hypot(derivativeRe, derivativeIm),
    closes: closureRe * closureRe + closureIm * closureIm <= closureToleranceSquared,
  };
};

const legacyClassifyOrbit = (c: Complex, options: OrbitOptions): OrbitResult => {
  const analytic = legacyAnalyticInterior(c);
  if (analytic !== undefined) {
    return analytic;
  }

  const historyRe = new Float64Array(options.maxPeriod + 1);
  const historyIm = new Float64Array(options.maxPeriod + 1);
  const capacity = historyRe.length;
  let zRe = 0;
  let zIm = 0;
  const toleranceSquared = options.cycleTolerance * options.cycleTolerance;
  const closureToleranceSquared = options.cycleTolerance * 100 * (options.cycleTolerance * 100);

  for (let iteration = 1; iteration <= options.maxIterations; iteration += 1) {
    const nextRe = zRe * zRe - zIm * zIm + c.re;
    zIm = 2 * zRe * zIm + c.im;
    zRe = nextRe;
    const magnitudeSquared = zRe * zRe + zIm * zIm;

    if (magnitudeSquared > 4) {
      const smoothIteration = iteration + 1 - Math.log2(Math.log2(Math.sqrt(magnitudeSquared)));
      return {
        status: 'escaped',
        iterations: iteration,
        evidence: ['escape-radius'],
        escapeIteration: iteration,
        smoothIteration: Number.isFinite(smoothIteration) ? smoothIteration : iteration,
        magnitudeSquared,
      };
    }

    const currentIndex = (iteration - 1) % capacity;
    historyRe[currentIndex] = zRe;
    historyIm[currentIndex] = zIm;
    if (iteration < options.cycleWarmup) {
      continue;
    }

    const largestPeriod = Math.min(options.maxPeriod, iteration - 1);
    for (let period = 1; period <= largestPeriod; period += 1) {
      const previousIndex = (currentIndex - period + capacity) % capacity;
      const distanceRe = zRe - (historyRe[previousIndex] ?? Number.NaN);
      const distanceIm = zIm - (historyIm[previousIndex] ?? Number.NaN);
      if (distanceRe * distanceRe + distanceIm * distanceIm > toleranceSquared) {
        continue;
      }

      const multiplier = legacyCycleMultiplier(zRe, zIm, c, period, closureToleranceSquared);
      if (
        !multiplier.closes ||
        !Number.isFinite(multiplier.magnitude) ||
        multiplier.magnitude >= 1
      ) {
        continue;
      }

      return legacyCycleResult(period, { re: multiplier.re, im: multiplier.im }, iteration, [
        'converged-cycle',
      ]);
    }
  }

  return {
    status: 'unresolved',
    iterations: options.maxIterations,
    evidence: ['iteration-limit'],
  };
};

// ---------------------------------------------------------------------------
// Differential strata (closed forms mirror poc/performance/src/corpus.ts).
// ---------------------------------------------------------------------------

const PROFILES: readonly { readonly label: string; readonly options: Partial<OrbitOptions> }[] = [
  { label: 'quick', options: { maxIterations: 256, maxPeriod: 16 } },
  { label: 'default', options: {} },
];

const gridPoints = (): { readonly re: number; readonly im: number }[] => {
  const points: { re: number; im: number }[] = [];
  for (let gy = 0; gy < 48; gy += 1) {
    for (let gx = 0; gx < 64; gx += 1) {
      points.push({
        re: -2.1 + (gx + 0.5) * (3.0 / 64),
        im: -1.35 + (gy + 0.5) * (2.7 / 48),
      });
    }
  }
  return points;
};

// Boundary: just outside the main cardioid via radial scaling of the exact
// boundary curve c(theta) = e^{i theta}/2 - e^{2 i theta}/4.
const boundaryPoints = (): { readonly re: number; readonly im: number }[] => {
  const points: { re: number; im: number }[] = [];
  for (const epsilon of [1e-5, 3e-5, 1e-4, 3e-4]) {
    for (let step = 0; step < 12; step += 1) {
      const theta = (2 * Math.PI * step) / 12;
      points.push({
        re: (1 + epsilon) * (Math.cos(theta) / 2 - Math.cos(2 * theta) / 4),
        im: (1 + epsilon) * (Math.sin(theta) / 2 - Math.sin(2 * theta) / 4),
      });
    }
  }
  return points;
};

// Exact period-1 multiplier map: c = z* - z*^2 with z* = lambda/2, so
// |lambda| = 1 - epsilon by construction.
const weakAttractionPoints = (): { readonly re: number; readonly im: number }[] => {
  const points: { re: number; im: number }[] = [];
  for (const epsilon of [0.05, 0.02, 0.01, 0.005, 1e-3, 1e-4, 1e-5]) {
    for (const theta of [0, Math.PI / 2, Math.PI, 2.3]) {
      const lambdaRe = (1 - epsilon) * Math.cos(theta);
      const lambdaIm = (1 - epsilon) * Math.sin(theta);
      points.push({
        re: lambdaRe / 2 - (lambdaRe * lambdaRe - lambdaIm * lambdaIm) / 4,
        im: lambdaIm / 2 - (lambdaRe * lambdaIm) / 2,
      });
    }
  }
  return points;
};

// Superattracting centers of the catalog identity layer (see corpus.ts).
const superattractingPoints = (): { readonly re: number; readonly im: number }[] =>
  (
    [
      [0, 0],
      [-1, 0],
      [-1.7548776662466907, 0],
      [-0.1225611668766535, 0.7448617666197435],
      [-0.1225611668766535, -0.7448617666197435],
      [-1.9407998065294834, 0],
      [-1.3107026413368348, 0],
      [-0.1565201668337543, 1.0322471089228327],
      [-0.1565201668337543, -1.0322471089228327],
      [0.2822713907669141, 0.5300606175785254],
      [0.2822713907669141, -0.5300606175785254],
    ] as const
  ).map(([re, im]) => ({ re, im }));

// Deterministic jitter ring around the Feigenbaum point: deep
// unresolved-budget behavior.
const feigenbaumRingPoints = (): { readonly re: number; readonly im: number }[] => {
  const points: { re: number; im: number }[] = [];
  for (let index = 0; index < 12; index += 1) {
    const angle = (2 * Math.PI * index) / 12;
    const radius = 1e-5 * (0.5 + index / 24);
    points.push({
      re: -1.4011551890920506 + radius * Math.cos(angle),
      im: radius * Math.sin(angle),
    });
  }
  return points;
};

// Hard-view anchors retained from the plan section 2 diagnosis.
const hardAnchorPoints = (): { readonly re: number; readonly im: number }[] => {
  const anchors = [
    { re: -0.158902249, im: -1.034028, zoom: 126 },
    { re: -1.94130973, im: -0.0000974722949, zoom: 609 },
    { re: 0.305376533, im: 0.552677981, zoom: 13 },
  ];
  const points: { re: number; im: number }[] = [];
  for (const anchor of anchors) {
    const offset = 2.5 / anchor.zoom / 4;
    for (let gy = -1; gy <= 1; gy += 1) {
      for (let gx = -1; gx <= 1; gx += 1) {
        points.push({ re: anchor.re + gx * offset, im: anchor.im + gy * offset });
      }
    }
    points.push({ re: anchor.re, im: anchor.im });
  }
  return points;
};

// Rabbit and co-rabbit neighborhoods (period 3).
const rabbitPoints = (): { readonly re: number; readonly im: number }[] =>
  (
    [
      [-0.1225611668766535, 0.7448617666197435],
      [-0.1225611668766535, -0.7448617666197435],
    ] as const
  ).flatMap(([centerRe, centerIm]) =>
    [0, 3e-4, -3e-4, 1e-4].map((offset) => ({
      re: centerRe + offset,
      im: centerIm - offset,
    })),
  );

const STRATA = [
  ...gridPoints(),
  ...boundaryPoints(),
  ...weakAttractionPoints(),
  ...superattractingPoints(),
  ...feigenbaumRingPoints(),
  ...hardAnchorPoints(),
  ...rabbitPoints(),
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
