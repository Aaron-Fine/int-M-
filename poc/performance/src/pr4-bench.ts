/**
 * PR 4 microbench: checkpoint schedule versus the legacy lag scan (plan
 * workstream C, directional Node/V8 evidence — NOT release evidence).
 *
 * Both variants classify the same fixed 1024x1024 raster slices of the
 * corpus hard views and write the same four band channels. The comparator
 * is the POST-PR-3 legacy scan: the production classifyInto lag scan with
 * common-verifier acceptance (PR 3 already changed acceptance for both
 * paths, so this is the honest "legacy" baseline for the differential).
 * The candidate is the PR 4 checkpoint schedule
 * (classifyCheckpointInto, exhaustion scan default-on, verifier-gated).
 *
 * Per variant and case:
 * - median / MAD classify wall time over the timed reps (raw samples kept);
 * - deterministic counters: total lag comparisons (analytic for the legacy
 *   scan: sum over scanned iterations of min(maxPeriod, i - 1), validated
 *   against the PoC control kernel's counted metric), orbit iterations,
 *   attracting / escaped / unresolved pixel counts, verifier calls, and the
 *   full-raster differential disagreement counts (status / period /
 *   multiplier bits) from the differential record;
 * - one dedicated allocation pass (excluded from timing) measured by GC
 *   scavenges, bounding per-pass churn (pr2-bench method).
 *
 * Workstream C gate, asserted DIRECTIONALLY here (the release-comparable
 * percentages come from Stage A browser runs per plan section 5/9):
 * - lag comparisons reduced >50% per case;
 * - hard-view classification >=2x wall time;
 * - no case >5% slower.
 * A gate miss sets a non-zero exit code and the report records the verdict.
 *
 * Matched-budget detection analysis (gate C requirement): the seeded PoC
 * corpus (per-stratum) is classified by both kernels under identical
 * budgets; per stratum, the detection-delay distribution
 * (checkpoint iterations - legacy iterations) is reported for matched
 * detections, with unmatched detections (checkpoint-only / legacy-only)
 * counted separately. Same options for both kernels; exhaustion scan on.
 *
 * Run via `npm run poc:bench:pr4` (vite SSR build + node --expose-gc).
 * Results: poc/performance/results/pr4/pr4-bench.json, labeled directional.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus, platform, release, totalmem } from 'node:os';
import { join } from 'node:path';
import { PerformanceObserver, type PerformanceEntry } from 'node:perf_hooks';
import { getHeapSpaceStatistics } from 'node:v8';

import { CORPUS_SEED, buildCorpus, HARD_VIEW_ANCHORS } from './corpus.ts';
import {
  CHECKPOINT_REVISION,
  classifyCheckpointInto,
  createCheckpointMetrics,
  createOrbitSample,
  classifyInto,
  createDifferentialStats,
  recordDifferentialInto,
  OrbitScratch,
  resetCheckpointMetrics,
  resetDifferentialStats,
  resolveOrbitOptions,
  VERIFIER_REVISION,
  type OrbitOptions,
  type OrbitSample,
} from '../../../src/domain';

const RESULTS_DIR = join(process.cwd(), 'poc/performance/results/pr4');

/** Balanced quality profile (plan section 4 profiles; thresholds frozen). */
const PROFILE = { maxIterations: 512, maxPeriod: 32, cycleTolerance: 1e-10, cycleWarmup: 24 };
const RASTER = 1024;
const WARMUP_PASSES = 2;
const TIMED_PASSES = 15;

interface Case {
  readonly id: string;
  readonly viewport: {
    readonly center: { readonly re: number; readonly im: number };
    readonly spanY: number;
  };
  /** Corpus provenance when the slice is cut from a hard-view anchor. */
  readonly anchor?: { readonly re: number; readonly im: number; readonly zoom: number };
  /** Hard views carry the >=2x gate; every case carries the <=5% cap. */
  readonly hard: boolean;
}

const anchorCase = (id: string, index: number): Case => {
  const anchor = HARD_VIEW_ANCHORS[index];
  if (anchor === undefined) {
    throw new Error(`missing hard view anchor ${String(index)}`);
  }
  return {
    id,
    viewport: { center: { re: anchor.re, im: anchor.im }, spanY: 2.5 / anchor.zoom },
    anchor,
    hard: true,
  };
};

const CASES: readonly Case[] = [
  // Interior-heavy hard anchor (period-3 neighborhood, zoom 126).
  anchorCase('hard-slice-anchor-0', 0),
  // Deep real-axis hard anchor (zoom 609): unresolved/interior dominated.
  anchorCase('hard-slice-anchor-2', 1),
  // Full-set view: escape-dominated cheap pixels (regression-cap case).
  {
    id: 'full-set-slice',
    viewport: { center: { re: -0.75, im: 0 }, spanY: 2.5 },
    hard: false,
  },
];

const roundMs = (value: number): number => Math.round(value * 1000) / 1000;

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0);
};

const meanAbsoluteDeviation = (values: readonly number[]): number => {
  const center = median(values);
  return median(values.map((value) => Math.abs(value - center)));
};

/**
 * Deterministic lag-comparison total of the legacy lag scan for one pixel:
 * the scan runs at every non-escaped iteration from cycleWarmup through the
 * end iteration (detection iteration, or maxIterations when unresolved; the
 * escape iteration itself escapes before scanning) and compares
 * min(maxPeriod, iteration - 1) lags. Analytic fast-path pixels
 * (attracting at iteration 0) and pixels that escape before the warmup gate
 * never scan. Validated against the PoC control kernel's counted metric
 * (poc/performance/src/control.test.ts: an unresolved pixel at the quick
 * profile counts (256 - 24 + 1) x 16 comparisons).
 */
const legacyComparisons = (sample: Readonly<OrbitSample>, options: OrbitOptions): number => {
  const last =
    sample.status === 1
      ? sample.escapeIteration - 1
      : sample.status === 0
        ? options.maxIterations
        : sample.iterations;
  if (last < options.cycleWarmup) {
    return 0;
  }
  const period = options.maxPeriod;
  const prefix = (n: number): number =>
    n <= 0
      ? 0
      : n <= period
        ? (n * (n + 1)) / 2
        : (period * (period + 1)) / 2 + (n - period) * period;
  return prefix(last - 1) - prefix(options.cycleWarmup - 2);
};

interface VariantReport {
  readonly samplesMs: number[];
  readonly medianMs: number;
  readonly madMs: number;
  readonly minMs: number;
  readonly maxMs: number;
  readonly lagComparisons: number;
  readonly orbitIterations: number;
  readonly attractingPixels: number;
  readonly escapedPixels: number;
  readonly unresolvedPixels: number;
  readonly verifierCalls: number;
  readonly allocation: {
    readonly gcEvents: number;
    readonly scavengeEvents: number;
    readonly churnBoundBytes: number;
    readonly churnBoundBytesPerPixel: number;
  };
}

interface CaseReport {
  readonly id: string;
  readonly hard: boolean;
  readonly anchor?: { readonly re: number; readonly im: number; readonly zoom: number };
  readonly viewport: {
    readonly center: { readonly re: number; readonly im: number };
    readonly spanY: number;
  };
  readonly pixelCount: number;
  readonly differential: {
    readonly statusDisagreements: number;
    readonly periodDisagreements: number;
    readonly multiplierMagnitudeDisagreements: number;
    readonly legacyAttracting: number;
    readonly checkpointAttracting: number;
    readonly legacyUnresolved: number;
    readonly checkpointUnresolved: number;
  };
  readonly variants: Record<'legacy-scan' | 'checkpoint', VariantReport>;
  readonly gates: {
    readonly comparisonReduction: number;
    readonly wallSpeedup: number;
    readonly comparisonGatePass: boolean;
    readonly hardViewGatePass: boolean;
    readonly regressionCapPass: boolean;
  };
}

const gcKindOf = (entry: PerformanceEntry): string =>
  String(
    (entry as PerformanceEntry & { detail?: { kind?: number | string } }).detail?.kind ?? 'unknown',
  );

interface StratumDelay {
  readonly stratum: string;
  readonly points: number;
  readonly matchedDetections: number;
  readonly checkpointOnly: number;
  readonly legacyOnly: number;
  readonly periodChanges: number;
  /** Detection-iteration delay (checkpoint - legacy) over matched detections. */
  readonly delayMin: number;
  readonly delayP50: number;
  readonly delayP90: number;
  readonly delayMax: number;
}

// eslint-disable-next-line complexity -- the branch count is the bench harness itself (per-case parity, timing, allocation accounting, and gate evaluation); splitting it would obscure the measured pipeline
const main = async (): Promise<void> => {
  const gc = globalThis.gc;
  if (typeof gc !== 'function') {
    throw new Error('run with node --expose-gc (npm run poc:bench:pr4)');
  }

  const options: OrbitOptions = resolveOrbitOptions(PROFILE);
  const legacyScratch = new OrbitScratch(options.maxPeriod);
  const checkpointScratch = new OrbitScratch(options.maxPeriod);
  const legacySample = createOrbitSample();
  const checkpointSample = createOrbitSample();
  const checkpointMetrics = createCheckpointMetrics();
  const diffStats = createDifferentialStats();

  const caseReports: CaseReport[] = [];
  for (const item of CASES) {
    const size = { width: RASTER, height: RASTER };
    const viewport = item.viewport;
    const unitsPerPixel = viewport.spanY / size.height;
    const pixelCount = size.width * size.height;

    const cRe = (x: number): number =>
      viewport.center.re + (x + 0.5 - size.width / 2) * unitsPerPixel;
    const cIm = (y: number): number =>
      viewport.center.im - (y + 0.5 - size.height / 2) * unitsPerPixel;

    interface Totals {
      lagComparisons: number;
      orbitIterations: number;
      attracting: number;
      escaped: number;
      unresolved: number;
      verifierCalls: number;
    }
    const newTotals = (): Totals => ({
      lagComparisons: 0,
      orbitIterations: 0,
      attracting: 0,
      escaped: 0,
      unresolved: 0,
      verifierCalls: 0,
    });

    const legacyPass = (): Totals => {
      const totals = newTotals();
      for (let y = 0; y < size.height; y += 1) {
        const im = cIm(y);
        for (let x = 0; x < size.width; x += 1) {
          classifyInto(cRe(x), im, options, legacyScratch, legacySample);
          totals.orbitIterations += legacySample.iterations;
          totals.lagComparisons += legacyComparisons(legacySample, options);
          if (legacySample.status === 2) totals.attracting += 1;
          else if (legacySample.status === 1) totals.escaped += 1;
          else totals.unresolved += 1;
        }
      }
      return totals;
    };

    const checkpointPass = (): Totals => {
      const totals = newTotals();
      resetCheckpointMetrics(checkpointMetrics);
      for (let y = 0; y < size.height; y += 1) {
        const im = cIm(y);
        for (let x = 0; x < size.width; x += 1) {
          classifyCheckpointInto(
            cRe(x),
            im,
            options,
            checkpointScratch,
            checkpointSample,
            checkpointMetrics,
          );
          totals.orbitIterations += checkpointSample.iterations;
          if (checkpointSample.status === 2) totals.attracting += 1;
          else if (checkpointSample.status === 1) totals.escaped += 1;
          else totals.unresolved += 1;
        }
      }
      totals.verifierCalls = checkpointMetrics.verifierCalls;
      totals.lagComparisons = checkpointMetrics.lagComparisons;
      return totals;
    };

    /** Full-raster differential record (one pass over both kernels). */
    const differentialPass = (): CaseReport['differential'] => {
      resetDifferentialStats(diffStats);
      for (let y = 0; y < size.height; y += 1) {
        const im = cIm(y);
        for (let x = 0; x < size.width; x += 1) {
          const re = cRe(x);
          classifyInto(re, im, options, legacyScratch, legacySample);
          classifyCheckpointInto(
            re,
            im,
            options,
            checkpointScratch,
            checkpointSample,
            checkpointMetrics,
          );
          recordDifferentialInto(diffStats, legacySample, checkpointSample);
        }
      }
      return { ...diffStats };
    };

    const timedPasses = (pass: () => Totals): { samplesMs: number[]; totals: Totals } => {
      for (let warmup = 0; warmup < WARMUP_PASSES; warmup += 1) {
        pass();
      }
      const samplesMs: number[] = [];
      let totals = newTotals();
      for (let rep = 0; rep < TIMED_PASSES; rep += 1) {
        const started = performance.now();
        totals = pass();
        samplesMs.push(performance.now() - started);
      }
      return { samplesMs, totals };
    };

    const measureAllocation = async (pass: () => Totals): Promise<VariantReport['allocation']> => {
      const entries: PerformanceEntry[] = [];
      const observer = new PerformanceObserver((list) => {
        entries.push(...list.getEntries());
      });
      observer.observe({ entryTypes: ['gc'] });
      gc();
      gc();
      const newSpace = getHeapSpaceStatistics().find((space) => space.space_name === 'new_space');
      if (newSpace === undefined) {
        throw new Error('v8.getHeapSpaceStatistics did not report new_space');
      }
      pass();
      // GC entries are delivered on a later macrotask; drain before counting.
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 300);
      });
      observer.disconnect();
      const scavengeEvents = entries.filter((entry) => gcKindOf(entry) === '1').length;
      const churnBoundBytes = scavengeEvents * newSpace.space_size;
      return {
        gcEvents: entries.length,
        scavengeEvents,
        churnBoundBytes,
        churnBoundBytesPerPixel: Math.round((churnBoundBytes / pixelCount) * 1000) / 1000,
      };
    };

    const buildVariant = async (
      pass: () => Totals,
      allocationPass: () => Totals,
    ): Promise<VariantReport> => {
      const { samplesMs, totals } = timedPasses(pass);
      const allocation = await measureAllocation(allocationPass);
      return {
        samplesMs: samplesMs.map(roundMs),
        medianMs: roundMs(median(samplesMs)),
        madMs: roundMs(meanAbsoluteDeviation(samplesMs)),
        minMs: roundMs(Math.min(...samplesMs)),
        maxMs: roundMs(Math.max(...samplesMs)),
        lagComparisons: totals.lagComparisons,
        orbitIterations: totals.orbitIterations,
        attractingPixels: totals.attracting,
        escapedPixels: totals.escaped,
        unresolvedPixels: totals.unresolved,
        verifierCalls: totals.verifierCalls,
        allocation,
      };
    };

    const differential = differentialPass();
    const legacy = await buildVariant(legacyPass, legacyPass);
    const checkpoint = await buildVariant(checkpointPass, checkpointPass);

    const comparisonReduction = 1 - checkpoint.lagComparisons / legacy.lagComparisons;
    const wallSpeedup = legacy.medianMs / checkpoint.medianMs;
    const gates = {
      comparisonReduction,
      wallSpeedup,
      comparisonGatePass: comparisonReduction > 0.5,
      hardViewGatePass: item.hard ? wallSpeedup >= 2 : true,
      regressionCapPass: checkpoint.medianMs <= legacy.medianMs * 1.05,
    };

    caseReports.push({
      ...(item.anchor === undefined ? {} : { anchor: item.anchor }),
      id: item.id,
      hard: item.hard,
      viewport,
      pixelCount,
      differential,
      variants: { 'legacy-scan': legacy, checkpoint },
      gates,
    });
  }

  // Matched-budget detection analysis over the seeded corpus strata.
  const corpus = buildCorpus();
  const byStratum = new Map<
    string,
    {
      delays: number[];
      checkpointOnly: number;
      legacyOnly: number;
      periodChanges: number;
      points: number;
    }
  >();
  for (const point of corpus) {
    let bucket = byStratum.get(point.stratum);
    if (bucket === undefined) {
      bucket = { delays: [], checkpointOnly: 0, legacyOnly: 0, periodChanges: 0, points: 0 };
      byStratum.set(point.stratum, bucket);
    }
    bucket.points += 1;
    classifyInto(point.cRe, point.cIm, options, legacyScratch, legacySample);
    classifyCheckpointInto(
      point.cRe,
      point.cIm,
      options,
      checkpointScratch,
      checkpointSample,
      checkpointMetrics,
    );
    const legacyAttracting = legacySample.status === 2;
    const checkpointAttracting = checkpointSample.status === 2;
    if (legacyAttracting && checkpointAttracting) {
      if (legacySample.period !== checkpointSample.period) {
        bucket.periodChanges += 1;
        continue;
      }
      bucket.delays.push(checkpointSample.iterations - legacySample.iterations);
    } else if (checkpointAttracting) {
      bucket.checkpointOnly += 1;
    } else if (legacyAttracting) {
      bucket.legacyOnly += 1;
    }
  }
  const detectionAnalysis: StratumDelay[] = [...byStratum.entries()].map(([stratum, bucket]) => {
    const sorted = [...bucket.delays].sort((left, right) => left - right);
    const pick = (quantile: number): number =>
      sorted[Math.min(sorted.length - 1, Math.floor(quantile * sorted.length))] ?? 0;
    return {
      stratum,
      points: bucket.points,
      matchedDetections: bucket.delays.length,
      checkpointOnly: bucket.checkpointOnly,
      legacyOnly: bucket.legacyOnly,
      periodChanges: bucket.periodChanges,
      delayMin: sorted[0] ?? 0,
      delayP50: pick(0.5),
      delayP90: pick(0.9),
      delayMax: sorted[sorted.length - 1] ?? 0,
    };
  });

  const failedGates = caseReports.filter(
    (report) =>
      !report.gates.comparisonGatePass ||
      !report.gates.hardViewGatePass ||
      !report.gates.regressionCapPass,
  );

  const report = {
    schemaVersion: 1,
    label: 'directional — Node/V8 evidence, not release evidence',
    description:
      'PR 4 microbench: power-of-two checkpoint schedule (exhaustion scan on) versus the post-PR-3 legacy lag scan over fixed hard-view raster slices, plus matched-budget per-stratum detection-delay analysis on the seeded corpus.',
    planReference: 'docs/plans/int-m-performance-plan.html sections 4, 5 (workstream C), 11 (PR 4)',
    measuredAt: new Date().toISOString(),
    environment: {
      node: process.version,
      platform: platform(),
      platformRelease: release(),
      logicalCpuCount: cpus().length,
      cpuModel: cpus()[0]?.model ?? 'unknown',
      totalMemoryBytes: totalmem(),
      note: 'Node single process; run via npm run poc:bench:pr4 (vite SSR build + node --expose-gc).',
    },
    harness: {
      corpusSeed: CORPUS_SEED,
      warmupPasses: WARMUP_PASSES,
      timedPasses: TIMED_PASSES,
      profile: PROFILE,
      exhaustionScan: true,
      revisions: {
        checkpointSchedule: CHECKPOINT_REVISION,
        verifier: VERIFIER_REVISION,
      },
      comparisonBasis:
        'legacy-scan = production classifyInto (post-PR-3 verifier-gated lag scan); checkpoint = classifyCheckpointInto. Same resolved options; exhaustion scan default-on.',
      legacyComparisonCounting:
        'Analytic per pixel: the scan compares min(maxPeriod, iteration - 1) lags at every non-escaped iteration from cycleWarmup through the detection/budget end; validated against the PoC control kernel counted metric.',
      gates:
        'Directional assertions of the workstream C gate: lag comparisons reduced >50% per case; hard views >=2x wall; no case >5% slower. Release-comparable percentages come from Stage A browser runs.',
    },
    cases: caseReports,
    matchedBudgetDetection: {
      description:
        'Per stratum of the seeded corpus, detection-iteration delay (checkpoint - legacy) over matched detections under identical budgets; unmatched detections counted per direction.',
      strata: detectionAnalysis,
    },
    gateSummary: {
      allDirectionalGatesPass: failedGates.length === 0,
      failedCases: failedGates.map((report) => report.id),
    },
  };

  mkdirSync(RESULTS_DIR, { recursive: true });
  const target = join(RESULTS_DIR, 'pr4-bench.json');
  writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`);
  for (const item of caseReports) {
    const legacy = item.variants['legacy-scan'];
    const checkpoint = item.variants.checkpoint;
    process.stdout.write(
      `${item.id}${item.hard ? ' [hard view]' : ''}\n` +
        `  legacy-scan: median ${legacy.medianMs} ms (MAD ${legacy.madMs} ms), lagComparisons ${legacy.lagComparisons}, unresolved ${legacy.unresolvedPixels}, churn <= ${legacy.allocation.churnBoundBytesPerPixel} B/px\n` +
        `  checkpoint:  median ${checkpoint.medianMs} ms (MAD ${checkpoint.madMs} ms), lagComparisons ${checkpoint.lagComparisons}, unresolved ${checkpoint.unresolvedPixels}, verifierCalls ${checkpoint.verifierCalls}, churn <= ${checkpoint.allocation.churnBoundBytesPerPixel} B/px\n` +
        `  gates: comparisons -${(item.gates.comparisonReduction * 100).toFixed(1)}%, wall ${item.gates.wallSpeedup.toFixed(2)}x${item.hard ? ' (>=2x required)' : ''}, cap ${item.gates.regressionCapPass ? 'ok' : 'BREACH'}\n` +
        `  differential: status ${item.differential.statusDisagreements}, period ${item.differential.periodDisagreements}, |lambda| bits ${item.differential.multiplierMagnitudeDisagreements} (legacy attracting ${item.differential.legacyAttracting}, checkpoint ${item.differential.checkpointAttracting})\n`,
    );
  }
  process.stdout.write('matched-budget detection delays (checkpoint - legacy):\n');
  for (const row of detectionAnalysis) {
    process.stdout.write(
      `  ${row.stratum}: matched ${row.matchedDetections}/${row.points}, checkpoint-only ${row.checkpointOnly}, legacy-only ${row.legacyOnly}, period changes ${row.periodChanges}, delay p50 ${row.delayP50} p90 ${row.delayP90} max ${row.delayMax}\n`,
    );
  }
  if (failedGates.length > 0) {
    process.stderr.write(
      `DIRECTIONAL GATE MISS in: ${failedGates.map((report) => report.id).join(', ')}\n`,
    );
    process.exitCode = 1;
  }
  process.stdout.write(`written: ${target}\n`);
};

void main();
