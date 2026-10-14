/** Pure aggregation of per-case parity results into one candidate verdict. */
import type { FieldTolerancePolicy, ParityPolicy } from '../candidates/types';
import {
  CONVERSION_LIMIT,
  MISMATCH_LIMIT,
  type CompareResult,
  type Conversion,
  type DistributionSummary,
  type Mismatch,
} from './parity';
import type { OracleResult } from './oracle';
import { validateTolerance } from './tolerance';

export interface CaseParity {
  readonly caseId: string;
  readonly raster: string;
  readonly result: CompareResult | undefined;
  /** Set when the candidate threw while rendering this case. */
  readonly error: string | undefined;
}

export interface ToleranceReportRow {
  readonly field: string;
  readonly declared: string;
  readonly maxObservedAbs: number;
  readonly maxObservedRel: number | undefined;
  readonly pixelsWithinTolerance: number;
}

export interface CandidateParity {
  readonly id: string;
  readonly description: string;
  readonly policy: ParityPolicy;
  readonly passed: boolean;
  readonly failureReasons: readonly string[];
  readonly toleranceProblems: readonly string[];
  readonly declaredTolerances: readonly ToleranceReportRow[];
  readonly toleranceNote: string | undefined;
  readonly violationCount: number;
  /** Violations per field name, summed over all cases. */
  readonly violationsByField: Readonly<Record<string, number>>;
  readonly firstMismatches: readonly Mismatch[];
  readonly changedPixels: number;
  readonly pixelsCompared: number;
  readonly conversionCount: number;
  readonly firstConversions: readonly Conversion[];
  readonly iterationDeltas: Readonly<Record<string, DistributionSummary>>;
  readonly evidenceChanges: Readonly<Record<string, number>>;
  readonly cases: readonly CaseParity[];
  readonly oracle: OracleResult | undefined;
}

const sum = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0);

const mergeSummaries = (
  into: Record<string, DistributionSummary>,
  from: Readonly<Record<string, DistributionSummary>> | undefined,
): void => {
  for (const [klass, next] of Object.entries(from ?? {})) {
    const prior = into[klass];
    if (prior === undefined) {
      into[klass] = next;
      continue;
    }
    const differing = prior.differing + next.differing;
    into[klass] = {
      compared: prior.compared + next.compared,
      differing,
      min: Math.min(prior.min, next.min),
      // Percentiles cannot be merged exactly; report the worse (larger) of the cases.
      p50: Math.max(prior.p50, next.p50),
      p90: Math.max(prior.p90, next.p90),
      max: Math.max(prior.max, next.max),
      mean:
        differing === 0
          ? 0
          : (prior.mean * prior.differing + next.mean * next.differing) / differing,
    };
  }
};

const maxStat = (
  results: readonly CompareResult[],
  fields: readonly string[],
  key: 'maxAbs' | 'maxRel' | 'withinTolerance',
): number =>
  Math.max(
    0,
    ...results.flatMap((result) => fields.map((field) => result.fieldStats[field]?.[key] ?? 0)),
  );

const sumStat = (results: readonly CompareResult[], fields: readonly string[]): number =>
  sum(results.flatMap((result) => fields.map((f) => result.fieldStats[f]?.withinTolerance ?? 0)));

const describeFloat = (value: { absolute?: number; relative?: number } | undefined): string =>
  `abs<=${value?.absolute ?? 0} rel<=${value?.relative ?? 0}`;

/** One row per DECLARED tolerance, with the maximum deviation actually observed. */
export const toleranceReport = (
  tolerance: FieldTolerancePolicy | undefined,
  results: readonly CompareResult[],
): ToleranceReportRow[] => {
  const rows: ToleranceReportRow[] = [];
  if (tolerance === undefined) return rows;
  for (const field of ['smoothIteration', 'multiplierMagnitude', 'multiplierAngle'] as const) {
    const declared = tolerance[field];
    if (declared === undefined) continue;
    rows.push({
      field,
      declared: describeFloat(declared),
      maxObservedAbs: maxStat(results, [field], 'maxAbs'),
      maxObservedRel: maxStat(results, [field], 'maxRel'),
      pixelsWithinTolerance: sumStat(results, [field]),
    });
  }
  if (tolerance.multiplierDirection !== undefined) {
    rows.push({
      field: 'multiplierDirection (cos/sin components)',
      declared: `abs<=${tolerance.multiplierDirection.absolute} (baseline |lambda| >= ${tolerance.multiplierDirection.minBaselineMagnitude ?? 0})`,
      maxObservedAbs: maxStat(results, ['multiplierDirection'], 'maxAbs'),
      maxObservedRel: undefined,
      pixelsWithinTolerance: sumStat(results, ['multiplierDirection']),
    });
  }
  if (tolerance.rgbaMaxChannelDelta !== undefined) {
    const views = ['rgba:stability', 'rgba:multiplier', 'rgba:period'];
    rows.push({
      field: 'rgba (max byte delta)',
      declared: `<=${tolerance.rgbaMaxChannelDelta}`,
      maxObservedAbs: maxStat(results, views, 'maxAbs'),
      maxObservedRel: undefined,
      pixelsWithinTolerance: sumStat(results, views),
    });
  }
  return rows;
};

export const aggregateCandidate = (input: {
  readonly id: string;
  readonly description: string;
  readonly policy: ParityPolicy;
  readonly tolerance: FieldTolerancePolicy | undefined;
  readonly cases: readonly CaseParity[];
  readonly oracle: OracleResult | undefined;
}): CandidateParity => {
  const results = input.cases.flatMap((entry) =>
    entry.result === undefined ? [] : [entry.result],
  );
  const errors = input.cases.filter((entry) => entry.error !== undefined);
  const violationCount = sum(results.map((result) => result.violationCount));
  const toleranceProblems = validateTolerance(input.policy, input.tolerance);
  const iterationDeltas: Record<string, DistributionSummary> = {};
  const evidenceChanges: Record<string, number> = {};
  for (const result of results) {
    mergeSummaries(iterationDeltas, result.iterationDeltas);
    for (const [key, count] of Object.entries(result.evidenceChanges ?? {})) {
      evidenceChanges[key] = (evidenceChanges[key] ?? 0) + count;
    }
  }
  const violationsByField: Record<string, number> = {};
  for (const result of results) {
    for (const [field, stat] of Object.entries(result.fieldStats)) {
      if (stat.violations > 0)
        violationsByField[field] = (violationsByField[field] ?? 0) + stat.violations;
    }
  }
  const failureReasons: string[] = [];
  if (errors.length > 0) failureReasons.push(`${errors.length} case(s) threw while rendering`);
  if (violationCount > 0) failureReasons.push(`${violationCount} field violation(s)`);
  if (toleranceProblems.length > 0) failureReasons.push('declared tolerance rejected by judge');
  if (input.oracle?.ok === false) failureReasons.push('oracle fixture check failed');
  return {
    id: input.id,
    description: input.description,
    policy: input.policy,
    passed: failureReasons.length === 0,
    failureReasons,
    toleranceProblems,
    declaredTolerances: toleranceReport(input.tolerance, results),
    toleranceNote: input.tolerance?.note,
    violationCount,
    violationsByField,
    firstMismatches: results.flatMap((result) => result.mismatches).slice(0, MISMATCH_LIMIT),
    changedPixels: sum(results.map((result) => result.changedPixels)),
    pixelsCompared: sum(results.map((result) => result.pixels)),
    conversionCount: sum(results.map((result) => result.conversionCount)),
    firstConversions: results.flatMap((result) => result.conversions).slice(0, CONVERSION_LIMIT),
    iterationDeltas,
    evidenceChanges,
    cases: input.cases,
    oracle: input.oracle,
  };
};
