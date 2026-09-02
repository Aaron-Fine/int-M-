/**
 * Differential runner for the PoC harness (plan section 5 Step 0).
 *
 * Classifies the whole seeded corpus with the control kernel and the three
 * alternative detection schedules (checkpoint, trigger, staggered; each with
 * the exhaustion scan on and off) under every quality profile, and compares
 * every variant against both the control kernel and the double-double
 * oracle. Emits poc/performance/results/:
 *
 * - raw.<profile>.<variant>.json: per-point records (no timestamps).
 * - summary.json: per-stratum aggregates; total lag comparisons is the
 *   primary deterministic metric; false-attracting and wrong-primitive-period
 *   counts must be zero everywhere and fail the run (non-zero exit code).
 * - run-manifest.json: environment and frozen-policy provenance plus
 *   directional wall-time medians (warmup pass, then median of 5 timed
 *   passes). Node/V8 evidence only - not release evidence.
 *
 * Run with Node >= 24 (no dependencies): npm run poc:perf.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { CheckpointKernel, CHECKPOINT_REVISION } from './kernels/checkpoint.ts';
import { ControlKernel } from './kernels/control.ts';
import {
  DE_GUESS_REVISION,
  DE_GUESS_THRESHOLDS,
  DeGuessKernel,
  DE_OPPORTUNISTIC_CEILING,
} from './kernels/de-guess.ts';
import { StaggeredKernel, STAGGERED_REVISION } from './kernels/staggered.ts';
import { TriggerKernel, TRIGGER_REVISION, TRIGGER_THRESHOLDS } from './kernels/trigger.ts';
import { CANDIDATE_REJECTION_BUDGET } from './kernels/shared.ts';
import { VERIFIER_REVISION, VERIFIER_THRESHOLDS } from './verifier.ts';
import { buildCorpus, CORPUS_SEED } from './corpus.ts';
import { classifyDD, DEFAULT_DD_ORACLE_OPTIONS } from './oracle/classify-dd.ts';
import type { DDClassification } from './oracle/classify-dd.ts';
import type { ClassificationKernel, KernelOptions, KernelResult } from './kernels/shared.ts';

export const HARNESS_REVISION = 'poc-harness-1.0.0';

const RESULTS_DIR = new URL('../results/', import.meta.url).pathname;

/** Legacy quality profiles (plan section 4 period policy; thresholds frozen). */
const PROFILES = [
  { name: 'quick', maxIterations: 256, maxPeriod: 16 },
  { name: 'balanced', maxIterations: 512, maxPeriod: 32 },
  { name: 'detailed', maxIterations: 1024, maxPeriod: 64 },
] as const;

const LEGACY_TOLERANCE = 1e-10;
const LEGACY_WARMUP = 24;

const SCHEDULES = {
  trigger: () => new TriggerKernel(64),
  staggered: () => new StaggeredKernel(64),
} as const;

interface Variant {
  readonly key: string;
  readonly kernel: ClassificationKernel;
  readonly exhaustionScan: boolean;
}

const variants = (): Variant[] => [
  // The checkpoint baseline variant runs first so the detection-delay axis
  // (folded against it) is available to every later variant.
  { key: 'checkpoint.exhaustion-on', kernel: new CheckpointKernel(64), exhaustionScan: true },
  { key: 'control', kernel: new ControlKernel(64), exhaustionScan: true },
  { key: 'checkpoint.exhaustion-off', kernel: new CheckpointKernel(64), exhaustionScan: false },
  ...Object.entries(SCHEDULES).flatMap(([name, make]) =>
    [true, false].map((exhaustionScan) => ({
      key: `${name}.exhaustion-${exhaustionScan ? 'on' : 'off'}`,
      kernel: make(),
      exhaustionScan,
    })),
  ),
  // DE period guessing (plan section 5 candidate source): systematic mode
  // caps proposals at the profile maxPeriod; the opportunistic variant
  // caps at DE_OPPORTUNISTIC_CEILING so acceptances above the systematic
  // bucket stay oracle-adjudicable. Both measured with the exhaustion scan
  // on and off (the exhaustion scan runs at the mode's own ceiling).
  ...[false, true].flatMap((opportunistic) =>
    [true, false].map((exhaustionScan) => ({
      key: `de-guess${opportunistic ? '.opportunistic' : ''}.exhaustion-${exhaustionScan ? 'on' : 'off'}`,
      kernel: new DeGuessKernel(64, opportunistic),
      exhaustionScan,
    })),
  ),
];

const profileOptions = (
  profile: (typeof PROFILES)[number],
  exhaustionScan: boolean,
): KernelOptions => ({
  maxIterations: profile.maxIterations,
  maxPeriod: profile.maxPeriod,
  cycleTolerance: LEGACY_TOLERANCE,
  cycleWarmup: LEGACY_WARMUP,
  exhaustionScan,
});

interface PointRecord {
  readonly id: string;
  readonly stratum: string;
  readonly kernel: string;
  readonly exhaustionScan: boolean;
  readonly status: KernelResult['status'];
  readonly iterations: number;
  readonly evidence: string;
  readonly period?: number;
  readonly multiplierMagnitude?: number;
  readonly multiplierAngle?: number;
  /** JSON null encodes the +Infinity superattracting identity (plan section 3). */
  readonly kappa?: number;
  readonly metrics: KernelResult['metrics'];
}

const recordOf = (
  point: { readonly id: string; readonly stratum: string },
  variant: Variant,
  result: KernelResult,
): PointRecord => {
  const base: PointRecord = {
    id: point.id,
    stratum: point.stratum,
    kernel: variant.kernel.name,
    exhaustionScan: variant.exhaustionScan,
    status: result.status,
    iterations: result.iterations,
    evidence: result.evidence,
    metrics: { ...result.metrics },
  };
  if (result.status !== 'attracting') {
    return base;
  }
  return {
    ...base,
    period: result.period,
    multiplierMagnitude: result.multiplierMagnitude,
    multiplierAngle: result.multiplierAngle,
    kappa: result.kappa,
  };
};

interface DetectionDelta {
  readonly id: string;
  readonly controlPeriod: number;
  readonly variantPeriod: number;
  readonly periodDelta: number;
  readonly controlIterations: number;
  readonly variantIterations: number;
  readonly iterationDelay: number;
}

interface StratumStats {
  points: number;
  totalLagComparisons: number;
  totalIterations: number;
  unresolved: number;
  falseAttracting: number;
  wrongPrimitivePeriod: number;
  unadjudicatedAttracting: number;
  missedDetections: number;
  candidateBudgetExhausted: number;
  matchedDetectionDeltas: DetectionDelta[];
  matchedCheckpointDeltas: DetectionDelta[];
  opportunisticPeriods: number;
  controlOnlyDetections: string[];
  variantOnlyDetections: string[];
}

const emptyStats = (): StratumStats => ({
  points: 0,
  totalLagComparisons: 0,
  totalIterations: 0,
  unresolved: 0,
  falseAttracting: 0,
  wrongPrimitivePeriod: 0,
  unadjudicatedAttracting: 0,
  missedDetections: 0,
  candidateBudgetExhausted: 0,
  matchedDetectionDeltas: [],
  matchedCheckpointDeltas: [],
  opportunisticPeriods: 0,
  controlOnlyDetections: [],
  variantOnlyDetections: [],
});

const joinedIds = (ids: string[]): string => [...ids].sort().join(',');

type AttractingPointRecord = PointRecord & {
  readonly status: 'attracting';
  readonly period: number;
  readonly multiplierMagnitude: number;
  readonly multiplierAngle: number;
  readonly kappa: number;
};

const isAttracting = (record: PointRecord): record is AttractingPointRecord =>
  record.status === 'attracting';

/**
 * Differential fold against control, the checkpoint schedule, and the dd
 * oracle. Adjudication rules: false-attracting = variant attracting where
 * the oracle proves escape; wrong-primitive-period = both attracting with
 * different primitive periods. Oracle-unresolved points cannot adjudicate
 * attracting claims (analytic paths and near-parabolic budgets) and are
 * counted as unadjudicated. Detection-delay distributions are kept against
 * BOTH baselines: control (legacy parity axis) and the checkpoint schedule
 * (the plan's chosen host, the comparison axis for the new variants).
 */
const foldStats = (
  stats: StratumStats,
  record: PointRecord,
  controlRecord: PointRecord,
  checkpointRecord: PointRecord,
  truth: DDClassification,
  profileMaxPeriod: number,
): void => {
  stats.points += 1;
  stats.totalLagComparisons += record.metrics.lagComparisons;
  stats.totalIterations += record.iterations;
  if (record.status === 'unresolved') {
    stats.unresolved += 1;
  }
  if (record.evidence === 'candidate-budget-exhausted') {
    stats.candidateBudgetExhausted += 1;
  }
  if (!isAttracting(record)) {
    if (truth.status === 'attracting-cycle' && record.status === 'unresolved') {
      stats.missedDetections += 1;
    }
    return;
  }
  const variantPeriod = record.period;
  if (variantPeriod > profileMaxPeriod) {
    stats.opportunisticPeriods += 1;
  }
  if (truth.status === 'escaped') {
    stats.falseAttracting += 1;
    return;
  }
  if (truth.status === 'unresolved') {
    stats.unadjudicatedAttracting += 1;
  } else if (truth.period !== variantPeriod) {
    stats.wrongPrimitivePeriod += 1;
  }
  if (!isAttracting(controlRecord)) {
    stats.variantOnlyDetections.push(record.id);
  } else if (
    controlRecord.period !== variantPeriod ||
    controlRecord.iterations !== record.iterations
  ) {
    stats.matchedDetectionDeltas.push({
      id: record.id,
      controlPeriod: controlRecord.period,
      variantPeriod,
      periodDelta: variantPeriod - controlRecord.period,
      controlIterations: controlRecord.iterations,
      variantIterations: record.iterations,
      iterationDelay: record.iterations - controlRecord.iterations,
    });
  }
  if (!isAttracting(checkpointRecord)) {
    return;
  }
  if (
    checkpointRecord.period !== variantPeriod ||
    checkpointRecord.iterations !== record.iterations
  ) {
    stats.matchedCheckpointDeltas.push({
      id: record.id,
      controlPeriod: checkpointRecord.period,
      variantPeriod,
      periodDelta: variantPeriod - checkpointRecord.period,
      controlIterations: checkpointRecord.iterations,
      variantIterations: record.iterations,
      iterationDelay: record.iterations - checkpointRecord.iterations,
    });
  }
};

interface BaselineStats {
  readonly points: number;
  readonly unresolved: number;
  readonly totalLagComparisons: number;
}

const rate = (count: number, points: number): number => (points === 0 ? 0 : count / points);

const finalizeStats = (stats: StratumStats, control: BaselineStats, checkpoint: BaselineStats) => ({
  points: stats.points,
  totalLagComparisons: stats.totalLagComparisons,
  totalIterations: stats.totalIterations,
  lagComparisonsVsControlRatio:
    control.totalLagComparisons === 0
      ? null
      : stats.totalLagComparisons / control.totalLagComparisons,
  lagComparisonsVsCheckpointRatio:
    checkpoint.totalLagComparisons === 0
      ? null
      : stats.totalLagComparisons / checkpoint.totalLagComparisons,
  unresolved: stats.unresolved,
  unresolvedRate: rate(stats.unresolved, stats.points),
  unresolvedRateDeltaVsControl:
    rate(stats.unresolved, stats.points) - rate(control.unresolved, control.points),
  unresolvedRateDeltaVsCheckpoint:
    rate(stats.unresolved, stats.points) - rate(checkpoint.unresolved, checkpoint.points),
  falseAttracting: stats.falseAttracting,
  wrongPrimitivePeriod: stats.wrongPrimitivePeriod,
  unadjudicatedAttracting: stats.unadjudicatedAttracting,
  missedDetections: stats.missedDetections,
  candidateBudgetExhausted: stats.candidateBudgetExhausted,
  opportunisticPeriods: stats.opportunisticPeriods,
  matchedDetectionDeltas: stats.matchedDetectionDeltas,
  matchedCheckpointDetectionDeltas: stats.matchedCheckpointDeltas,
  controlOnlyDetectionIds: joinedIds(stats.controlOnlyDetections),
  variantOnlyDetectionIds: joinedIds(stats.variantOnlyDetections),
});

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const lower = sorted[middle - 1] ?? Number.NaN;
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? Number.NaN)
    : (lower + (sorted[middle] ?? Number.NaN)) / 2;
};

/** One untimed classification pass over the corpus (used for warmup and recording). */
const classifyCorpus = (
  variant: Variant,
  corpus: ReturnType<typeof buildCorpus>,
  profile: (typeof PROFILES)[number],
): PointRecord[] =>
  corpus.map((point) =>
    recordOf(
      point,
      variant,
      variant.kernel.classify(
        point.cRe,
        point.cIm,
        profileOptions(profile, variant.exhaustionScan),
      ),
    ),
  );

const timedPassMs = (
  variant: Variant,
  corpus: ReturnType<typeof buildCorpus>,
  profile: (typeof PROFILES)[number],
): number => {
  const started = process.hrtime.bigint();
  for (const point of corpus) {
    variant.kernel.classify(point.cRe, point.cIm, profileOptions(profile, variant.exhaustionScan));
  }
  return Number(process.hrtime.bigint() - started) / 1e6;
};

const TIMED_PASSES = 5;

type GateOutcome = 'pass' | 'fail' | 'legacy-flaw';

/**
 * Zero-gate for schedule variants (the plan workstream C kill gate: any
 * false attracting result or wrong primitive period fails the run). The
 * control baseline is exempt: its wrong-primitive-period results versus the
 * oracle are the known legacy flaw that motivates the common verifier, so
 * they are counted and reported but never fail the run.
 */
const evaluateGate = (
  variantKey: string,
  profileName: string,
  totals: StratumStats,
): GateOutcome => {
  if (variantKey === 'control') {
    if (totals.wrongPrimitivePeriod > 0) {
      console.error(
        `NOTE ${profileName}/control: ${totals.wrongPrimitivePeriod} wrong-primitive-period results vs oracle (legacy baseline flaw, no divisor reduction)`,
      );
      return 'legacy-flaw';
    }
    return 'pass';
  }
  if (totals.falseAttracting > 0 || totals.wrongPrimitivePeriod > 0) {
    console.error(
      `GATE FAILURE ${profileName}/${variantKey}: falseAttracting=${totals.falseAttracting} wrongPrimitivePeriod=${totals.wrongPrimitivePeriod}`,
    );
    return 'fail';
  }
  return 'pass';
};

const logComparison = (
  profileName: string,
  variantKey: string,
  totals: {
    totalLagComparisons: number;
    unresolvedRate: number;
    lagComparisonsVsCheckpointRatio: number | null;
  },
  controlTotals: { totalLagComparisons: number; unresolvedRate: number },
): void => {
  const vsCheckpoint =
    totals.lagComparisonsVsCheckpointRatio === null
      ? 'n/a'
      : `${totals.lagComparisonsVsCheckpointRatio.toFixed(3)}x checkpoint`;
  console.error(
    `${profileName}/${variantKey}: lagComparisons ${totals.totalLagComparisons} (${(totals.totalLagComparisons / controlTotals.totalLagComparisons).toFixed(3)}x control, ${vsCheckpoint}), unresolvedRate ${(totals.unresolvedRate * 100).toFixed(2)}% (delta ${((totals.unresolvedRate - controlTotals.unresolvedRate) * 100).toFixed(2)}pp)`,
  );
};

/** Per-stratum rolling totals accumulator for one variant. */
const baselineOf = (byStratum: Map<string, StratumStats>): BaselineStats => {
  const totals = { points: 0, unresolved: 0, totalLagComparisons: 0 };
  for (const stats of byStratum.values()) {
    totals.points += stats.points;
    totals.unresolved += stats.unresolved;
    totals.totalLagComparisons += stats.totalLagComparisons;
  }
  return totals;
};

const collectBaseline = (
  key: string,
  records: readonly PointRecord[],
  recordsById: Map<string, PointRecord>,
  statsByStratum: Map<string, StratumStats>,
): void => {
  for (const record of records) {
    recordsById.set(record.id, record);
    const stats = statsByStratum.get(record.stratum) ?? emptyStats();
    stats.points += 1;
    stats.totalLagComparisons += record.metrics.lagComparisons;
    if (record.status === 'unresolved') {
      stats.unresolved += 1;
    }
    statsByStratum.set(record.stratum, stats);
  }
};

const timedMedianMs = (
  variant: Variant,
  corpus: ReturnType<typeof buildCorpus>,
  profile: (typeof PROFILES)[number],
): number =>
  median(
    Array.from({ length: TIMED_PASSES }, () => {
      // One discarded pass after the recording pass keeps the JIT warm
      // before the timed reps (directional medians only).
      void timedPassMs(variant, corpus, profile);
      return timedPassMs(variant, corpus, profile);
    }),
  );

/**
 * Differential fold of one variant's records into per-stratum stats. Every
 * record needs both detection-delay baselines and an oracle verdict; the
 * lookups throw on a missing entry so a runner bug fails loudly instead of
 * silently skipping adjudication.
 */
const foldRecords = (
  records: readonly PointRecord[],
  oracle: Map<string, DDClassification>,
  controlRecordsById: Map<string, PointRecord>,
  checkpointRecordsById: Map<string, PointRecord>,
  profileMaxPeriod: number,
): Map<string, StratumStats> => {
  const strata = new Map<string, StratumStats>();
  for (const record of records) {
    const truth = oracle.get(record.id);
    if (truth === undefined) {
      throw new Error(`missing oracle adjudication for ${record.id}`);
    }
    const controlRecord = controlRecordsById.get(record.id);
    if (controlRecord === undefined) {
      throw new Error(`missing control record for ${record.id}`);
    }
    const checkpointRecord = checkpointRecordsById.get(record.id);
    if (checkpointRecord === undefined) {
      throw new Error(`missing checkpoint record for ${record.id}`);
    }
    const stats = strata.get(record.stratum) ?? emptyStats();
    foldStats(stats, record, controlRecord, checkpointRecord, truth, profileMaxPeriod);
    strata.set(record.stratum, stats);
  }
  return strata;
};

/** Sum a variant's per-stratum stats into the gate/summary totals. */
const aggregateStrata = (strata: Map<string, StratumStats>): StratumStats => {
  const totals = emptyStats();
  for (const stats of strata.values()) {
    totals.points += stats.points;
    totals.totalLagComparisons += stats.totalLagComparisons;
    totals.totalIterations += stats.totalIterations;
    totals.unresolved += stats.unresolved;
    totals.falseAttracting += stats.falseAttracting;
    totals.wrongPrimitivePeriod += stats.wrongPrimitivePeriod;
    totals.unadjudicatedAttracting += stats.unadjudicatedAttracting;
    totals.missedDetections += stats.missedDetections;
    totals.candidateBudgetExhausted += stats.candidateBudgetExhausted;
    totals.opportunisticPeriods += stats.opportunisticPeriods;
    totals.matchedDetectionDeltas.push(...stats.matchedDetectionDeltas);
    totals.matchedCheckpointDeltas.push(...stats.matchedCheckpointDeltas);
    totals.controlOnlyDetections.push(...stats.controlOnlyDetections);
    totals.variantOnlyDetections.push(...stats.variantOnlyDetections);
  }
  return totals;
};

const run = (): number => {
  const corpus = buildCorpus();
  const oracle = new Map<string, DDClassification>();
  for (const point of corpus) {
    // One oracle adjudication per point: the dd oracle's default budget
    // (4096 x 96) dominates every PoC profile, so it is valid for all.
    oracle.set(point.id, classifyDD(point.cRe, point.cIm));
  }

  mkdirSync(RESULTS_DIR, { recursive: true });
  let gateFailures = 0;
  let legacyWrongPrimitivePeriod = 0;
  const manifest: Record<string, unknown> = {
    harnessRevision: HARNESS_REVISION,
    nodeVersion: process.version,
    platform: `${process.platform} ${process.arch}`,
    corpusSeed: CORPUS_SEED,
    corpusSize: corpus.length,
    verifier: { revision: VERIFIER_REVISION, thresholds: VERIFIER_THRESHOLDS },
    candidateRejectionBudget: CANDIDATE_REJECTION_BUDGET,
    schedulePolicies: {
      checkpoint: { revision: CHECKPOINT_REVISION },
      trigger: { revision: TRIGGER_REVISION, thresholds: TRIGGER_THRESHOLDS },
      staggered: { revision: STAGGERED_REVISION },
      deGuess: {
        revision: DE_GUESS_REVISION,
        thresholds: DE_GUESS_THRESHOLDS,
        opportunisticCeiling: DE_OPPORTUNISTIC_CEILING,
      },
    },
    ddOracle: { options: DEFAULT_DD_ORACLE_OPTIONS },
    gate: {
      // Zero-gate subject: schedule variants (the plan workstream C kill
      // gate). The control baseline is exempt and reported instead.
      zeroToleranceFor: 'schedule variants',
      gateFailures,
      legacyBaselineWrongPrimitivePeriod: 0,
    },
    profiles: PROFILES.map((profile) => ({
      ...profile,
      cycleTolerance: LEGACY_TOLERANCE,
      cycleWarmup: LEGACY_WARMUP,
    })),
    wallTime: {
      note: 'directional — Node/V8 evidence, not release evidence',
      // Untimed passes before the timed reps: the recording pass plus one
      // discarded pass per variant.
      warmupPasses: 2,
      timedPasses: TIMED_PASSES,
      medianClassifyMs: {} as Record<string, Record<string, number>>,
    },
  };
  const summary: Record<string, unknown> = {
    metricNotes: {
      primaryMetric: 'totalLagComparisons: candidate lag distance evaluations (deterministic)',
      stepGates: 'trigger step gates and checkpoint interval bookkeeping are not lag comparisons',
      kappa: 'JSON null encodes +Infinity (superattracting identity)',
      adjudication:
        'falseAttracting/wrongPrimitivePeriod are adjudicated against the dd oracle and must be zero for schedule variants; oracle-unresolved attracting claims are unadjudicated',
      controlBaseline:
        'control is the legacy classifier under differential test: its wrong-primitive-period results vs the oracle are reported (manifest gate.legacyBaselineWrongPrimitivePeriod), not gated - the common verifier exists to fix them',
      detectionDeltas:
        'matched-budget per-point deltas vs control: periodDelta and iterationDelay distributions, not aggregates',
      detectionDeltasVsCheckpoint:
        'matched-budget per-point deltas vs the checkpoint schedule (exhaustion-on variant), the comparison baseline for the new candidate-source variants; plus lagComparisonsVsCheckpointRatio and unresolvedRateDeltaVsCheckpoint',
      opportunisticPeriods:
        'attracting results whose primitive period exceeds the profile systematic maxPeriod (opportunistic bucket, plan section 4); always oracle-adjudicable because the opportunistic ceiling matches the dd oracle maxPeriod',
    },
    profiles: {},
  };

  for (const profile of PROFILES) {
    const controlRecordsById = new Map<string, PointRecord>();
    const checkpointRecordsById = new Map<string, PointRecord>();
    const controlStatsByStratum = new Map<string, StratumStats>();
    const checkpointStatsByStratum = new Map<string, StratumStats>();
    const variantSummaries: Record<string, unknown> = {};
    const medians: Record<string, number> = {};

    // Pass 1: classify and persist every variant once; the control and
    // checkpoint baselines are collected here so the fold in pass 2 sees
    // both detection-delay baselines regardless of variant order.
    const recordsByVariant = new Map<string, PointRecord[]>();
    for (const variant of variants()) {
      const records = classifyCorpus(variant, corpus, profile);
      recordsByVariant.set(variant.key, records);
      writeFileSync(
        join(RESULTS_DIR, `raw.${profile.name}.${variant.key}.json`),
        `${JSON.stringify(records, null, 2)}\n`,
      );

      // The checkpoint baseline for the detection-delay axis is the
      // default-on policy variant (exhaustion scan on).
      if (variant.key === 'control') {
        collectBaseline(variant.key, records, controlRecordsById, controlStatsByStratum);
      }
      if (variant.key === 'checkpoint.exhaustion-on') {
        collectBaseline(variant.key, records, checkpointRecordsById, checkpointStatsByStratum);
      }
    }

    // Pass 2: differential fold, summaries, gate, and directional timing.
    for (const variant of variants()) {
      const records = recordsByVariant.get(variant.key) ?? [];
      const strata = foldRecords(
        records,
        oracle,
        controlRecordsById,
        checkpointRecordsById,
        profile.maxPeriod,
      );

      const controlBaseline = baselineOf(controlStatsByStratum);
      const checkpointBaseline = baselineOf(checkpointStatsByStratum);

      const stratumSummaries: Record<string, unknown> = {};
      for (const [stratum, stats] of strata) {
        stratumSummaries[stratum] = finalizeStats(
          stats,
          controlStatsByStratum.get(stratum) ?? emptyStats(),
          checkpointStatsByStratum.get(stratum) ?? emptyStats(),
        );
      }
      const totals = aggregateStrata(strata);
      variantSummaries[variant.key] = {
        totals: finalizeStats(totals, controlBaseline, checkpointBaseline),
        strata: stratumSummaries,
      };
      medians[variant.key] = timedMedianMs(variant, corpus, profile);

      const outcome = evaluateGate(variant.key, profile.name, totals);
      if (outcome === 'fail') {
        gateFailures += 1;
      } else if (outcome === 'legacy-flaw') {
        legacyWrongPrimitivePeriod += totals.wrongPrimitivePeriod;
      }
    }

    (summary['profiles'] as Record<string, unknown>)[profile.name] = { variants: variantSummaries };
    const wallTime = manifest['wallTime'] as {
      medianClassifyMs: Record<string, Record<string, number>>;
    };
    wallTime.medianClassifyMs[profile.name] = medians;

    const control = variantSummaries['control'] as {
      totals: { totalLagComparisons: number; unresolvedRate: number };
    };
    for (const [key, value] of Object.entries(variantSummaries)) {
      const totals = (
        value as {
          totals: {
            totalLagComparisons: number;
            unresolvedRate: number;
            lagComparisonsVsCheckpointRatio: number | null;
          };
        }
      ).totals;
      logComparison(profile.name, key, totals, control.totals);
    }
  }

  const gate = manifest['gate'] as Record<string, unknown>;
  gate['legacyBaselineWrongPrimitivePeriod'] = legacyWrongPrimitivePeriod;
  writeFileSync(join(RESULTS_DIR, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  writeFileSync(join(RESULTS_DIR, 'run-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.error(`results written to ${RESULTS_DIR}`);
  return gateFailures === 0 ? 0 : 1;
};

process.exitCode = run();
