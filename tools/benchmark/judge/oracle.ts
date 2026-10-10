/**
 * Oracle check: the independent high-precision fixtures (fixtures/orbits.v1.json)
 * rendered through the candidate as 1x1 rasters centered exactly on the
 * fixture parameter. A candidate fails the oracle only when it contradicts a
 * fixture or regresses a fixture the baseline gets right.
 */
import fixtureData from '../../../fixtures/orbits.v1.json';
import type { Candidate, ParityPolicy } from '../candidates/types';
import { makeSpec, type CorpusCase } from './corpus';

interface RawFixture {
  readonly id: string;
  readonly parameter: { readonly re: string; readonly im: string };
  readonly classificationBudget: { readonly maxIterations: number; readonly maxPeriod: number };
  readonly expected: {
    readonly status: 'escaped' | 'attracting-cycle' | 'unresolved';
    readonly period?: number;
    readonly multiplier?: { readonly magnitude: string };
  };
}

interface FixtureDocument {
  readonly binary64Tolerance: { readonly multiplierMagnitudeAbsolute: number };
  readonly fixtures: readonly RawFixture[];
}

export interface Observed {
  readonly status: number;
  readonly period: number;
  readonly magnitude: number;
  readonly certificate: boolean;
}

export type OracleVerdict = 'match' | 'unresolved' | 'contradiction' | 'accepted-with-certificate';

export interface OracleFixtureResult {
  readonly id: string;
  readonly expected: string;
  readonly baseline: OracleVerdict;
  readonly candidate: OracleVerdict;
  readonly observed: Observed;
  readonly ok: boolean;
}

export interface OracleResult {
  readonly fixtures: readonly OracleFixtureResult[];
  readonly ok: boolean;
  readonly error?: string;
}

const STATUS_CODE = { escaped: 1, 'attracting-cycle': 2, unresolved: 0 } as const;

export const verdictFor = (
  fixture: RawFixture,
  observed: Observed,
  policy: ParityPolicy,
  magnitudeTolerance: number,
): OracleVerdict => {
  const expectedCode = STATUS_CODE[fixture.expected.status];
  if (observed.status === expectedCode) {
    if (expectedCode !== 2) return expectedCode === 0 ? 'unresolved' : 'match';
    const magnitude = Number(fixture.expected.multiplier?.magnitude);
    const good =
      observed.period === fixture.expected.period &&
      Math.abs(observed.magnitude - magnitude) <= magnitudeTolerance;
    return good ? 'match' : 'contradiction';
  }
  if (observed.status === 0) return 'unresolved';
  if (expectedCode === 0 && observed.status === 2 && policy === 'semantic-revision') {
    return observed.certificate ? 'accepted-with-certificate' : 'contradiction';
  }
  return 'contradiction';
};

/** Candidate passes a fixture unless it contradicts it or regresses a baseline match. */
export const fixtureOk = (baseline: OracleVerdict, candidate: OracleVerdict): boolean =>
  candidate === 'contradiction' ? false : !(baseline === 'match' && candidate === 'unresolved');

const observe = async (arm: Candidate, fixture: RawFixture): Promise<Observed> => {
  const corpusCase: CorpusCase = {
    id: `oracle:${fixture.id}`,
    caseClass: 'oracle',
    designation: 'oracle',
    profile: 'Balanced',
    viewport: {
      center: { re: Number(fixture.parameter.re), im: Number(fixture.parameter.im) },
      spanY: 1,
    },
  };
  const spec = {
    ...makeSpec(corpusCase, { width: 1, height: 1 }, { diagnostics: true, collectCounters: false }),
    quality: {
      maxIterations: fixture.classificationBudget.maxIterations,
      maxPeriod: fixture.classificationBudget.maxPeriod,
      coarseStride: 8,
    },
  };
  arm.reset?.();
  const fields = (await arm.render(spec)).readFields();
  const certificates = arm.certificates?.();
  const has =
    certificates instanceof Map
      ? certificates.has(0)
      : certificates !== undefined && '0' in certificates;
  return {
    status: fields.status[0] ?? 0,
    period: fields.period[0] ?? 0,
    magnitude: fields.multiplierMagnitude[0] ?? 0,
    certificate: has,
  };
};

export const runOracle = async (
  baseline: Candidate,
  candidate: Candidate,
): Promise<OracleResult> => {
  const document = fixtureData as FixtureDocument;
  const policy = candidate.parityPolicy ?? 'bit-identical';
  const tolerance =
    document.binary64Tolerance.multiplierMagnitudeAbsolute +
    (candidate.tolerance?.multiplierMagnitude?.absolute ?? 0);
  const fixtures: OracleFixtureResult[] = [];
  for (const fixture of document.fixtures) {
    const base = await observe(baseline, fixture);
    const cand = await observe(candidate, fixture);
    const baseVerdict = verdictFor(
      fixture,
      base,
      'bit-identical',
      document.binary64Tolerance.multiplierMagnitudeAbsolute,
    );
    const candVerdict = verdictFor(fixture, cand, policy, tolerance);
    fixtures.push({
      id: fixture.id,
      expected: fixture.expected.status,
      baseline: baseVerdict,
      candidate: candVerdict,
      observed: cand,
      ok: fixtureOk(baseVerdict, candVerdict),
    });
  }
  return { fixtures, ok: fixtures.every((entry) => entry.ok) };
};
