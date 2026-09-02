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
import { NeighborKernel, NEIGHBOR_REVISION } from './kernels/neighbor.ts';
import { StaggeredKernel, STAGGERED_REVISION } from './kernels/staggered.ts';
import { TriggerKernel, TRIGGER_REVISION, TRIGGER_THRESHOLDS } from './kernels/trigger.ts';
import {
  TRANSPLANT_REVISION,
  TRANSPLANT_THRESHOLDS,
  TransplantKernel,
} from './kernels/transplant.ts';
import { TRAP_REVISION, TRAP_THRESHOLDS, TrapKernel } from './kernels/trap.ts';
import { GRIDS_REVISION, GRID_SIZE, GRID_SPECS, buildGrids, type GridPoint } from './grids.ts';
import {
  PACKED_OUTPUT_REVISION,
  packStatusPeriod,
  unpackPeriod,
  unpackStatus,
} from './kernels/packed.ts';
import { HARD_VIEW_ANCHORS } from './corpus.ts';
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
  // Neighbor-informed lag ordering: in the flat matrix the hint is the
  // PREVIOUS CORPUS POINT's detected period (the documented weak-hint
  // control; the corpus is a point list, not a raster). The real raster
  // measurement is the grid section below.
  ...[true, false].map((exhaustionScan) => ({
    key: `neighbor.exhaustion-${exhaustionScan ? 'on' : 'off'}`,
    kernel: new NeighborKernel(64),
    exhaustionScan,
  })),
  // Adjacent-pixel transplantation: the persistent seed walks the raster
  // (call order); the exhaustion flag applies to the fallback schedule.
  ...[true, false].map((exhaustionScan) => ({
    key: `transplant.exhaustion-${exhaustionScan ? 'on' : 'off'}`,
    kernel: new TransplantKernel(64),
    exhaustionScan,
  })),
  // Trap-radius early accept (workstream L, research, oracle-gated): the
  // exhaustion flag applies to the fallback schedule.
  ...[true, false].map((exhaustionScan) => ({
    key: `trap.exhaustion-${exhaustionScan ? 'on' : 'off'}`,
    kernel: new TrapKernel(64),
    exhaustionScan,
  })),
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
  /** Packed status+period word (plan section 5 renderer-path encoding). */
  readonly packed: number;
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
  const period = result.status === 'attracting' ? result.period : 0;
  const packed = packStatusPeriod(result.status, period);
  // Round-trip identity is asserted for EVERY corpus classification; a
  // mismatch is a harness bug and fails the run.
  if (unpackStatus(packed) !== result.status || unpackPeriod(packed) !== period) {
    throw new Error(`packed round-trip mismatch at ${point.id}: ${packed}`);
  }
  const base: PointRecord = {
    id: point.id,
    stratum: point.stratum,
    kernel: variant.kernel.name,
    exhaustionScan: variant.exhaustionScan,
    status: result.status,
    iterations: result.iterations,
    evidence: result.evidence,
    packed,
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

/**
 * One untimed classification pass over the corpus (used for warmup and
 * recording). The neighbor variant classifies sequentially, feeding the
 * previous point's detected primitive period as the hint: a deliberate
 * weak-hint control for the flat matrix (the corpus is a point list, so
 * adjacency is by list order, not by raster geometry).
 */
const classifyCorpus = (
  variant: Variant,
  corpus: ReturnType<typeof buildCorpus>,
  profile: (typeof PROFILES)[number],
): PointRecord[] => {
  const options = profileOptions(profile, variant.exhaustionScan);
  const kernel = variant.kernel;
  if (kernel instanceof NeighborKernel) {
    let previousPeriod = 0;
    return corpus.map((point) => {
      const result = kernel.classifyWithHint(point.cRe, point.cIm, options, previousPeriod);
      previousPeriod = result.status === 'attracting' ? result.period : 0;
      return recordOf(point, variant, result);
    });
  }
  if (kernel instanceof TransplantKernel) {
    // The persistent seed walks the raster (call order); every pass starts
    // unseeded so recorded and timed passes stay comparable.
    kernel.resetSeed();
  }
  if (kernel instanceof TrapKernel) {
    kernel.resetSeed();
  }
  return corpus.map((point) =>
    recordOf(point, variant, kernel.classify(point.cRe, point.cIm, options)),
  );
};

const timedPassMs = (
  variant: Variant,
  corpus: ReturnType<typeof buildCorpus>,
  profile: (typeof PROFILES)[number],
): number => {
  if (variant.kernel instanceof TransplantKernel || variant.kernel instanceof TrapKernel) {
    variant.kernel.resetSeed();
  }
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

// ---------------------------------------------------------------------------
// Raster-grid section (neighbor / transplant / trap variants).
// The corpus is a point list; these deterministic grids simulate the raster
// layer with left-neighbor evidence in raster order.
// ---------------------------------------------------------------------------

interface GridRecord {
  readonly id: string;
  readonly grid: string;
  readonly status: KernelResult['status'];
  readonly iterations: number;
  readonly evidence: string;
  readonly period?: number;
  readonly metrics: KernelResult['metrics'];
}

interface GridStats {
  points: number;
  totalLagComparisons: number;
  totalIterations: number;
  attracting: number;
  hintDetections: number;
  unresolved: number;
  falseAttracting: number;
  wrongPrimitivePeriod: number;
  unadjudicatedAttracting: number;
  missedDetections: number;
  /** Transplant-pipeline counters (zeros for other kernels). */
  transplantHits: number;
  transplantAttempts: number;
  transplantGuardRefusals: number;
  /** Trap counters (zeros for other kernels). */
  trapHits: number;
  trapProposals: number;
  trapNewtonFailures: number;
  trapOrbitWork: number;
}

const emptyGridStats = (): GridStats => ({
  points: 0,
  totalLagComparisons: 0,
  totalIterations: 0,
  attracting: 0,
  hintDetections: 0,
  unresolved: 0,
  falseAttracting: 0,
  wrongPrimitivePeriod: 0,
  unadjudicatedAttracting: 0,
  missedDetections: 0,
  transplantHits: 0,
  transplantAttempts: 0,
  transplantGuardRefusals: 0,
  trapHits: 0,
  trapProposals: 0,
  trapNewtonFailures: 0,
  trapOrbitWork: 0,
});

const gridRecordOf = (point: GridPoint, kernelName: string, result: KernelResult): GridRecord => ({
  id: point.id,
  grid: point.grid,
  status: result.status,
  iterations: result.iterations,
  evidence: result.evidence,
  ...(result.status === 'attracting' ? { period: result.period } : {}),
  metrics: result.metrics,
});

const foldGridStats = (stats: GridStats, record: GridRecord, truth: DDClassification): void => {
  stats.points += 1;
  stats.totalLagComparisons += record.metrics.lagComparisons;
  stats.totalIterations += record.iterations;
  if (record.evidence === 'neighbor-hint') {
    stats.hintDetections += 1;
  }
  if (record.evidence === 'transplant-hit') {
    stats.transplantHits += 1;
  }
  stats.transplantAttempts += record.metrics.transplantAttempts ?? 0;
  stats.transplantGuardRefusals += record.metrics.transplantGuardRefusals ?? 0;
  if (record.evidence === 'trap-hit') {
    stats.trapHits += 1;
  }
  stats.trapProposals += record.metrics.trapProposals ?? 0;
  stats.trapNewtonFailures += record.metrics.trapNewtonFailures ?? 0;
  stats.trapOrbitWork += record.metrics.trapOrbitWork ?? 0;
  if (record.status === 'unresolved') {
    stats.unresolved += 1;
  }
  if (record.status !== 'attracting') {
    if (truth.status === 'attracting-cycle') {
      stats.missedDetections += 1;
    }
    return;
  }
  stats.attracting += 1;
  if (truth.status === 'escaped') {
    stats.falseAttracting += 1;
  } else if (truth.status === 'unresolved') {
    stats.unadjudicatedAttracting += 1;
  } else if (truth.period !== record.period) {
    stats.wrongPrimitivePeriod += 1;
  }
};

const finalizeGridStats = (
  stats: GridStats,
): GridStats & {
  unresolvedRate: number;
  hintShareOfDetections: number | null;
} => ({
  ...stats,
  unresolvedRate: rate(stats.unresolved, stats.points),
  hintShareOfDetections: stats.attracting === 0 ? null : stats.hintDetections / stats.attracting,
});

/** |lambda| buckets for the transplant guard-refusal report (frozen edges). */
const LAMBDA_BUCKETS = [
  { key: 'below-0.5', max: 0.5 },
  { key: '0.5-0.9', max: 0.9 },
  { key: '0.9-0.99', max: 0.99 },
  { key: '0.99-plus', max: Number.POSITIVE_INFINITY },
] as const;

const emptyLambdaBucket = (): {
  attempts: number;
  guardRefusals: number;
  hits: number;
} => ({ attempts: 0, guardRefusals: 0, hits: 0 });

type LambdaBuckets = Record<string, { attempts: number; guardRefusals: number; hits: number }>;

const bucketFor = (lambda: number): string => {
  for (const bucket of LAMBDA_BUCKETS) {
    if (lambda < bucket.max) {
      return bucket.key;
    }
  }
  return '0.99-plus';
};

const accumulateBuckets = (records: readonly GridRecord[], buckets: LambdaBuckets): void => {
  for (const record of records) {
    const lambda = record.metrics.transplantSeedLambda;
    if (lambda === undefined || (record.metrics.transplantAttempts ?? 0) === 0) {
      continue;
    }
    const bucket = buckets[bucketFor(lambda)] ?? emptyLambdaBucket();
    bucket.attempts += 1;
    bucket.guardRefusals += record.metrics.transplantGuardRefusals ?? 0;
    if (record.evidence === 'transplant-hit') {
      bucket.hits += 1;
    }
  }
};

/**
 * Classify one grid in raster order with the checkpoint baseline, the
 * neighbor kernel (hint = previous pixel's detected period), and the
 * transplant kernel (persistent seed walking the raster); fold all against
 * the oracle. Per-point iteration deltas (neighbor - checkpoint, both
 * attracting) keep the detection-delay distribution honest.
 */
const classifyGridSet = (
  points: readonly GridPoint[],
  oracle: Map<string, DDClassification>,
  profile: (typeof PROFILES)[number],
): {
  report: Record<string, unknown>;
  transplantRecords: GridRecord[];
  trapRecords: GridRecord[];
} => {
  const options = profileOptions(profile, true);
  const checkpoint = new CheckpointKernel(64);
  const neighbor = new NeighborKernel(64);
  const transplant = new TransplantKernel(64);
  const trap = new TrapKernel(64);

  const checkpointRecords: GridRecord[] = [];
  const neighborRecords: GridRecord[] = [];
  const transplantRecords: GridRecord[] = [];
  const trapRecords: GridRecord[] = [];
  let previousPeriod = 0;
  for (const point of points) {
    checkpointRecords.push(
      gridRecordOf(point, 'checkpoint', checkpoint.classify(point.cRe, point.cIm, options)),
    );
    const result = neighbor.classifyWithHint(point.cRe, point.cIm, options, previousPeriod);
    previousPeriod = result.status === 'attracting' ? result.period : 0;
    neighborRecords.push(gridRecordOf(point, 'neighbor', result));
    transplantRecords.push(
      gridRecordOf(point, 'transplant', transplant.classify(point.cRe, point.cIm, options)),
    );
    trapRecords.push(gridRecordOf(point, 'trap', trap.classify(point.cRe, point.cIm, options)));
  }

  const foldAll = (records: readonly GridRecord[]): GridStats => {
    const stats = emptyGridStats();
    for (const record of records) {
      const truth = oracle.get(record.id);
      if (truth === undefined) {
        throw new Error(`missing grid oracle adjudication for ${record.id}`);
      }
      foldGridStats(stats, record, truth);
    }
    return stats;
  };

  const checkpointStats = foldAll(checkpointRecords);
  const neighborStats = foldAll(neighborRecords);
  const transplantStats = foldAll(transplantRecords);
  const trapStats = foldAll(trapRecords);
  const iterationDeltas = (records: readonly GridRecord[]): unknown[] =>
    records.flatMap((record, index) => {
      const baseline = checkpointRecords[index];
      if (record.status !== 'attracting' || baseline?.status !== 'attracting') {
        return [];
      }
      return [{ id: record.id, iterationDelta: record.iterations - baseline.iterations }];
    });

  const report: Record<string, unknown> = {
    points: points.length,
    checkpoint: finalizeGridStats(checkpointStats),
    neighbor: finalizeGridStats(neighborStats),
    transplant: finalizeGridStats(transplantStats),
    trap: finalizeGridStats(trapStats),
    neighborComparisonsVsCheckpoint:
      checkpointStats.totalLagComparisons === 0
        ? null
        : neighborStats.totalLagComparisons / checkpointStats.totalLagComparisons,
    transplantComparisonsVsCheckpoint:
      checkpointStats.totalLagComparisons === 0
        ? null
        : transplantStats.totalLagComparisons / checkpointStats.totalLagComparisons,
    trapIterationsVsCheckpoint:
      checkpointStats.totalIterations === 0
        ? null
        : trapStats.totalIterations / checkpointStats.totalIterations,
    neighborIterationDeltas: iterationDeltas(neighborRecords),
    trapIterationDeltas: iterationDeltas(trapRecords),
  };
  return { report, transplantRecords, trapRecords };
};

const runGridSection = (
  gridPoints: readonly GridPoint[],
  oracle: Map<string, DDClassification>,
  profile: (typeof PROFILES)[number],
): { grids: Record<string, unknown>; gateFailures: number; lambdaBuckets: LambdaBuckets } => {
  const byGrid = new Map<string, GridPoint[]>();
  for (const point of gridPoints) {
    const list = byGrid.get(point.grid) ?? [];
    list.push(point);
    byGrid.set(point.grid, list);
  }

  const grids: Record<string, unknown> = {};
  const lambdaBuckets: LambdaBuckets = {};
  for (const key of LAMBDA_BUCKETS) {
    lambdaBuckets[key.key] = emptyLambdaBucket();
  }
  let gateFailures = 0;
  for (const [name, points] of byGrid) {
    const { report, transplantRecords, trapRecords } = classifyGridSet(points, oracle, profile);
    grids[name] = report;
    accumulateBuckets(transplantRecords, lambdaBuckets);
    accumulateBuckets(trapRecords, lambdaBuckets);
    for (const key of ['checkpoint', 'neighbor', 'transplant', 'trap'] as const) {
      const stats = report[key] as GridStats;
      if (stats.falseAttracting > 0 || stats.wrongPrimitivePeriod > 0) {
        console.error(
          `GATE FAILURE grids/${profile.name}/${name}/${key}: falseAttracting=${stats.falseAttracting} wrongPrimitivePeriod=${stats.wrongPrimitivePeriod}`,
        );
        gateFailures += 1;
      }
    }
  }
  return { grids, gateFailures, lambdaBuckets };
};

/**
 * Packed status+period output measurement (plan section 5 renderer-path
 * details): one 1024^2 raster slice cut from hard view anchor 0, classified
 * by the checkpoint kernel at the quick profile, written both as the packed
 * Uint32 word per pixel (the production zero-copy store shape) and as the
 * current two-field layout (Uint8 status + Uint32 period). Byte counts are
 * the allocated buffer sizes (measured, not estimated) and the decode pass
 * asserts round-trip identity on every pixel.
 */
const runPackedOutputSection = (): Record<string, unknown> => {
  const anchor = HARD_VIEW_ANCHORS[0];
  if (anchor === undefined) {
    throw new Error('missing hard view anchor 0');
  }
  const size = 1024;
  const unitsPerPixel = 2.5 / anchor.zoom / size;
  const pixelCount = size * size;
  const options = profileOptions(PROFILES[0], true);
  const kernel = new CheckpointKernel(64);

  // The packed word is what a production kernel would store per pixel.
  const packedWords = new Uint32Array(pixelCount);
  // The current two-field layout: status and period as separate channels.
  const statusField = new Uint8Array(pixelCount);
  const periodField = new Uint32Array(pixelCount);

  let offset = 0;
  for (let y = 0; y < size; y += 1) {
    const cIm = anchor.im - (y + 0.5 - size / 2) * unitsPerPixel;
    for (let x = 0; x < size; x += 1) {
      const cRe = anchor.re + (x + 0.5 - size / 2) * unitsPerPixel;
      const result = kernel.classify(cRe, cIm, options);
      const period = result.status === 'attracting' ? result.period : 0;
      const word = packStatusPeriod(result.status, period);
      packedWords[offset] = word;
      statusField[offset] =
        result.status === 'escaped' ? 1 : result.status === 'attracting' ? 2 : 3;
      periodField[offset] = period;
      offset += 1;
    }
  }

  // Decode pass: the runner reads the packed words for reporting and
  // asserts round-trip identity against the two-field layout.
  let mismatches = 0;
  const statusCounts = { escaped: 0, attracting: 0, unresolved: 0 };
  for (let index = 0; index < pixelCount; index += 1) {
    const word = packedWords[index] ?? 0;
    const status = unpackStatus(word);
    const period = unpackPeriod(word);
    statusCounts[status] += 1;
    const expectedStatus = statusField[index] ?? 0;
    const expectedPeriod = periodField[index] ?? 0;
    const statusCode = status === 'escaped' ? 1 : status === 'attracting' ? 2 : 3;
    if (statusCode !== expectedStatus || period !== expectedPeriod) {
      mismatches += 1;
    }
  }

  const packedBytes = packedWords.byteLength;
  const twoFieldBytes = statusField.byteLength + periodField.byteLength;
  return {
    revision: PACKED_OUTPUT_REVISION,
    encoding:
      'status in bits 24..31 (1 escaped, 2 attracting, 3 unresolved), period <= 2^24-1 in bits 0..23',
    slice: {
      anchor: { re: anchor.re, im: anchor.im, zoom: anchor.zoom },
      size,
      profile: 'quick (checkpoint kernel)',
    },
    pixels: pixelCount,
    roundTripMismatches: mismatches,
    statusCounts,
    bytes: {
      packedWord: packedBytes,
      twoFieldLayout: twoFieldBytes,
      saved: twoFieldBytes - packedBytes,
      savedPercentOfTwoFields: (twoFieldBytes - packedBytes) / twoFieldBytes,
    },
  };
};

const run = (): number => {
  const corpus = buildCorpus();
  const oracle = new Map<string, DDClassification>();
  for (const point of corpus) {
    // One oracle adjudication per point: the dd oracle's default budget
    // (4096 x 96) dominates every PoC profile, so it is valid for all.
    oracle.set(point.id, classifyDD(point.cRe, point.cIm));
  }
  // The grid strata (neighbor/transplant/trap measurements) are
  // oracle-adjudicated once per run, same budget discipline.
  const gridPoints = buildGrids();
  for (const point of gridPoints) {
    if (!oracle.has(point.id)) {
      oracle.set(point.id, classifyDD(point.cRe, point.cIm));
    }
  }

  mkdirSync(RESULTS_DIR, { recursive: true });
  let gateFailures = 0;
  let gridGateFailures = 0;
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
      neighbor: { revision: NEIGHBOR_REVISION, fallbackTrigger: 'frozen trigger thresholds' },
      transplant: {
        revision: TRANSPLANT_REVISION,
        thresholds: TRANSPLANT_THRESHOLDS,
        guardFormula: '|B_cycle| * |dc| / |1 - lambda| (plan section 6 conditioning guard)',
      },
      trap: {
        revision: TRAP_REVISION,
        thresholds: TRAP_THRESHOLDS,
        oracleGate:
          'any false attracting or wrong primitive period fails the run (workstream L kill gate)',
      },
      packedOutput: { revision: PACKED_OUTPUT_REVISION },
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

  // Raster-grid section: measured at the balanced and detailed profiles
  // (the weak-attraction seed pixels need the detailed budget; the corpus
  // profile floors are documented per profile in the grid specs).
  const gridProfiles: Record<string, unknown> = {};
  for (const profile of [PROFILES[1], PROFILES[2]]) {
    const section = runGridSection(gridPoints, oracle, profile);
    gridProfiles[profile.name] = {
      grids: section.grids,
      transplantLambdaBuckets: section.lambdaBuckets,
    };
    gridGateFailures += section.gateFailures;
  }
  summary['grids'] = {
    revision: GRIDS_REVISION,
    note: 'deterministic raster grids simulating the production left-neighbor evidence (the corpus is a point list); single-neighbor hints, raster order, no top-neighbor pooling; oracle-adjudicated with the same zero gate as the matrix',
    gridSize: GRID_SIZE,
    specs: GRID_SPECS,
    profiles: gridProfiles,
  };
  summary['packedOutput'] = runPackedOutputSection();

  const gate = manifest['gate'] as Record<string, unknown>;
  gate['legacyBaselineWrongPrimitivePeriod'] = legacyWrongPrimitivePeriod;
  gate['gridGateFailures'] = gridGateFailures;
  gateFailures += gridGateFailures;
  writeFileSync(join(RESULTS_DIR, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  writeFileSync(join(RESULTS_DIR, 'run-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.error(`results written to ${RESULTS_DIR}`);
  return gateFailures === 0 ? 0 : 1;
};

process.exitCode = run();
