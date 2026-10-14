import { expect, test } from '@playwright/test';
import { splitRowBands, type RowBand } from '../../../../src/render/row-bands';
import type {
  CoarseCostResult,
  CoarseRowSample,
  StableRowSample,
} from '../fixtures/microbench-api';
import { captureEnvironment, writeResults } from './helpers/results';
import { pearson, spearman } from './helpers/stats';

/**
 * Workstream N input (plan §5): cost-weighted static banding splits stable
 * bands by equal estimated cost from the already-computed coarse pass, and
 * is attempted before E whenever E's skew gate (baseline slowest/mean
 * elapsed > 1.2) fires. Its kill criterion is a coarse cost signal that
 * mispredicts stable-pass cost. This spec measures exactly that on three
 * corpus views: per-band coarse statistics, actual per-band stable compute,
 * the estimate-vs-actual correlation, and what equal-cost banding would
 * look like against equal-height banding.
 */

const CASE_IDS = [
  'mi-easy-default-full',
  'mi-hard-supplied-126x',
  'mi-fallback-ambiguous-boundary',
] as const;
const EDGE = 1024;
const BAND_COUNTS = [4, 16] as const;

interface BandAggregate {
  readonly band: number;
  readonly y0: number;
  readonly y1: number;
  readonly coarseRows: number;
  readonly coarseMeanEscapeIteration: number;
  readonly coarseUnresolvedFraction: number;
  readonly estimatedCostUnits: number;
  readonly actualComputeMs: number;
}

interface PartitionAnalysis {
  readonly strategy: string;
  readonly bandCount: number;
  readonly slowestOverMean: number;
  readonly boundaries: readonly number[];
  readonly perBand: readonly BandAggregate[];
}

interface PartitionSet {
  readonly equalHeight4: PartitionAnalysis;
  readonly equalCost4: PartitionAnalysis;
  readonly equalHeight16: PartitionAnalysis;
  readonly equalCost16: PartitionAnalysis;
}

/** Per-raster-row estimated cost: the covering coarse row's mean cost per pixel. */
const estimatePerRasterRow = (
  edge: number,
  coarseStride: number,
  coarseRows: readonly CoarseRowSample[],
): number[] => {
  const perRow = new Array<number>(edge).fill(0);
  for (let y = 0; y < edge; y += 1) {
    const sample = coarseRows[Math.floor(y / coarseStride)];
    if (sample !== undefined) perRow[y] = sample.estimatedCostUnits;
  }
  return perRow;
};

/** Greedy contiguous partition of rows into bandCount equal-cumulative-cost bands. */
const equalCostBands = (edge: number, bandCount: number, perRow: readonly number[]): RowBand[] => {
  const total = perRow.reduce((sum, value) => sum + value, 0);
  if (total <= 0) throw new Error('equal-cost partition needs a positive cost estimate');
  const target = total / bandCount;
  const bands: RowBand[] = [];
  let y0 = 0;
  let cumulative = 0;
  let nextCut = 1;
  for (let y = 0; y < edge; y += 1) {
    cumulative += perRow[y] ?? 0;
    if (nextCut < bandCount && cumulative >= nextCut * target) {
      bands.push({ y0, y1: y + 1 });
      y0 = y + 1;
      nextCut += 1;
    }
  }
  bands.push({ y0, y1: edge });
  return bands;
};

const aggregateBands = (
  bands: readonly RowBand[],
  perRow: readonly number[],
  stableRows: readonly StableRowSample[],
  coarseRows: readonly CoarseRowSample[],
): BandAggregate[] =>
  bands.map((band, bandIndex) => {
    let actualComputeMs = 0;
    let estimatedCostUnits = 0;
    for (let y = band.y0; y < band.y1; y += 1) {
      actualComputeMs += stableRows[y]?.classifyMs ?? 0;
      estimatedCostUnits += perRow[y] ?? 0;
    }
    // Coarse statistics attributed by block origin row; unaligned equal-cost
    // boundaries can straddle a coarse row, so counts are informational.
    const bandCoarseRows = coarseRows.filter((sample) => sample.y >= band.y0 && sample.y < band.y1);
    const meanOf = (selector: (sample: CoarseRowSample) => number): number =>
      bandCoarseRows.length === 0
        ? 0
        : bandCoarseRows.reduce((sum, sample) => sum + selector(sample), 0) / bandCoarseRows.length;
    return {
      band: bandIndex,
      y0: band.y0,
      y1: band.y1,
      coarseRows: bandCoarseRows.length,
      coarseMeanEscapeIteration: meanOf((sample) => sample.meanEscapeIteration),
      coarseUnresolvedFraction: meanOf((sample) => sample.unresolvedFraction),
      estimatedCostUnits,
      actualComputeMs,
    };
  });

const analyzePartition = (
  strategy: string,
  bandCount: number,
  bands: readonly RowBand[],
  perRow: readonly number[],
  stableRows: readonly StableRowSample[],
  coarseRows: readonly CoarseRowSample[],
): PartitionAnalysis => {
  const perBand = aggregateBands(bands, perRow, stableRows, coarseRows);
  const times = perBand.map((aggregate) => aggregate.actualComputeMs);
  const slowest = Math.max(...times);
  const mean = times.reduce((sum, value) => sum + value, 0) / times.length;
  return {
    strategy,
    bandCount,
    slowestOverMean: slowest / mean,
    boundaries: bands.map((band) => band.y0),
    perBand,
  };
};

const analyzePartitions = (result: CoarseCostResult, perRow: readonly number[]): PartitionSet => ({
  equalHeight4: analyzePartition(
    'equal-height',
    4,
    splitRowBands(result.edge, 4),
    perRow,
    result.stableRows,
    result.coarseRows,
  ),
  equalCost4: analyzePartition(
    'equal-cost',
    4,
    equalCostBands(result.edge, 4, perRow),
    perRow,
    result.stableRows,
    result.coarseRows,
  ),
  equalHeight16: analyzePartition(
    'equal-height',
    16,
    splitRowBands(result.edge, 16),
    perRow,
    result.stableRows,
    result.coarseRows,
  ),
  equalCost16: analyzePartition(
    'equal-cost',
    16,
    equalCostBands(result.edge, 16, perRow),
    perRow,
    result.stableRows,
    result.coarseRows,
  ),
});

const correlate = (
  perBand: readonly BandAggregate[],
): { n: number; pearson: number; spearman: number } => ({
  n: perBand.length,
  pearson: pearson(
    perBand.map((band) => band.estimatedCostUnits),
    perBand.map((band) => band.actualComputeMs),
  ),
  spearman: spearman(
    perBand.map((band) => band.estimatedCostUnits),
    perBand.map((band) => band.actualComputeMs),
  ),
});

test('coarse-pass cost estimate vs actual stable-pass per-band compute (workstream N input)', async ({
  page,
}) => {
  await page.goto('/poc-bench/index.html');

  const results: CoarseCostResult[] = [];
  for (const caseId of CASE_IDS) {
    const result = (await page.evaluate(
      (request: { caseId: string; profileId: string; edge: number; warmupRows: number }) => {
        return window.__miPocBench.run('coarse-cost', request);
      },
      { caseId, profileId: 'balanced', edge: EDGE, warmupRows: 64 },
    )) as CoarseCostResult;
    results.push(result);
  }

  const environment = await captureEnvironment(page, {
    workerCount: null,
    backend: 'microbench-page (src/render classifyRows, main thread)',
  });

  const perCase = results.map((result) => {
    expect(result.stableRows.length).toBe(EDGE);
    expect(result.coarseRows.length).toBe(EDGE / result.coarseStride);
    const perRow = estimatePerRasterRow(result.edge, result.coarseStride, result.coarseRows);
    const partitions = analyzePartitions(result, perRow);
    for (const equalCost of [partitions.equalCost4, partitions.equalCost16]) {
      expect(equalCost.boundaries.length).toBe(equalCost.bandCount);
      expect(equalCost.boundaries[0]).toBe(0);
      expect(equalCost.perBand[equalCost.bandCount - 1]?.y1).toBe(result.edge);
    }
    const correlation16 = correlate(partitions.equalHeight16.perBand);
    const skewGateFires = partitions.equalHeight4.slowestOverMean > 1.2;
    return {
      caseId: result.caseId,
      profileId: result.profileId,
      edge: result.edge,
      coarseStride: result.coarseStride,
      coarseQuality: result.coarseQuality,
      stableQuality: result.stableQuality,
      viewport: result.viewport,
      partitions,
      correlationEstimateVsActual16: correlation16,
      workstreamNGate: {
        context:
          "N is attempted before E whenever E's skew gate (baseline slowest/mean elapsed > 1.2) fires; N's kill criterion is a coarse cost signal that mispredicts stable-pass cost",
        equalHeightSlowestOverMeanAt4: partitions.equalHeight4.slowestOverMean,
        skewGateFires,
        equalCostSlowestOverMeanAt4: partitions.equalCost4.slowestOverMean,
        correlationAt16: correlation16,
        assessment: !skewGateFires
          ? 'skew gate does not fire on this view at production band count 4: equal-height banding is already balanced, N has nothing to fix here'
          : correlation16.pearson >= 0.8
            ? 'skew fires and the coarse signal tracks actual per-band cost: equal-cost banding lowers slowest/mean below the equal-height baseline, so N is viable here'
            : 'skew fires but the coarse signal mispredicts stable-pass cost (weak correlation): N kill-criterion territory on this view',
      },
    };
  });

  // Pooled 16-band correlation across all three views (n = 48 bands).
  const pooledCorrelation = correlate(
    perCase.flatMap((entry) => entry.partitions.equalHeight16.perBand),
  );

  const written = await writeResults('coarse-cost', {
    environment,
    samples: results.flatMap((result) => [
      ...result.coarseRows.map((row) => ({ kind: 'coarse-row', caseId: result.caseId, ...row })),
      ...result.stableRows.map((row) => ({ kind: 'stable-row', caseId: result.caseId, ...row })),
    ]),
    summary: {
      bandCountsEvaluated: BAND_COUNTS,
      cases: perCase,
      pooledCorrelationEstimateVsActual16: pooledCorrelation,
      decision:
        'Workstream N (cost-weighted static banding) is viable where the skew gate fires AND the coarse estimate correlates with actual per-band stable compute; the recorded equal-cost boundaries are what N would ship, derived only from coarse-frame data.',
    },
    notes: [
      'Coarse pass is the production one: real classifyRows with the CpuRenderer coarse quality (maxIterations capped at 256, maxPeriod at 16, stride = quality.coarseStride = 8 at Balanced).',
      'Estimated cost uses ONLY what the coarse semantic frame carries (what workstream N would see): escape iterations for escaped pixels, the coarse iteration budget (256) for attracting and unresolved pixels, averaged per coarse pixel.',
      'Stable pass timed row by row with the same real code path; per-row classifyMs is compute only (yield waits recorded separately and excluded, matching classifyRows timing semantics); per-band compute is the sum over the band rows.',
      'Equal-cost bands: deterministic greedy contiguous partition cutting where cumulative estimated cost crosses k * total/bandCount; boundaries are recorded so the rebalancing is reproducible from the raw rows.',
      'performance.now coarsening (~100 microseconds in non-isolated page contexts) limits per-row resolution on cheap exterior rows, so low-cost bands of the easy view carry quantization noise; the hard views sit far above the resolution floor.',
      'Balanced profile on all three cases; the corpus record for mi-hard-supplied-126x nominally carries Detailed (same deviation as the pool-sizing milestone, for harness budget).',
      'Production band count is one band per worker (4 on this machine); 16-band partitions are evaluated as the static-banding granularity N could choose. Banding is measured on per-band compute, not wall time: scheduling effects are workstream E territory.',
    ],
  });
  await test.info().attach('coarse-cost-results', { path: written });

  for (const entry of perCase) {
    for (const band of entry.partitions.equalHeight16.perBand) {
      expect(
        band.actualComputeMs,
        `band compute must be positive (${entry.caseId})`,
      ).toBeGreaterThan(0);
    }
    expect(Number.isFinite(entry.correlationEstimateVsActual16.pearson)).toBe(true);
    expect(Number.isFinite(entry.correlationEstimateVsActual16.spearman)).toBe(true);
  }
  expect(Number.isFinite(pooledCorrelation.pearson)).toBe(true);
});
