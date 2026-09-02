/**
 * PR 2 microbench: allocation-free scalar kernel versus the legacy
 * allocating pipeline (plan workstream B).
 *
 * Both variants classify the same fixed 1024x1024 raster slices of corpus
 * hard views and write the same four band channels. The legacy variant is
 * the sanctioned comparator: the PoC control kernel (a faithful port of the
 * pre-PR2 production classifier that allocates a result record per pixel)
 * driven through the pre-PR2 pipeline shape (allocating pixelToComplex,
 * per-pixel result record, status-mapping writes). The scalar variant is
 * the production classifyInto pipeline shape (pixelToComplexInto,
 * classifyInto into a preallocated OrbitSample, direct channel writes).
 *
 * Before timing, each case runs a full-raster parity gate: the status,
 * period, multiplier magnitude/angle, and escape-iteration channels of the
 * two variants must agree on every pixel (exact bit equality), or the run
 * fails loudly with a non-zero exit code and writes no results. Legacy and
 * scalar agree by construction on the attracting and unresolved channels;
 * escaped pixels are compared on dedicated escape-iteration channels and on
 * the primary channel (the legacy wrapper recomputes the smooth iteration
 * the pre-PR2 production pipeline wrote there, so the values are identical).
 *
 * Reported per variant and case: median and MAD of classify wall time over
 * the timed reps, raw samples, and one dedicated allocation pass (excluded
 * from timing) measured by garbage-collection activity. GC entry counting
 * is used instead of heap deltas because short-lived per-pixel garbage is
 * invisible to both gc()-based heap deltas and V8's sampling heap profiler,
 * which only records surviving allocations; a scavenge count of N for a
 * young generation of size S bounds the per-pass churn at ~N x S bytes,
 * reported per pixel. Per-pixel object counts are also reported by
 * construction (the legacy pipeline shape allocates at least three objects
 * per pixel; the scalar shape allocates none).
 * The results are retained in a preallocated ring only so that V8 escape
 * analysis cannot scalar-replace the legacy per-pixel record and hide the
 * allocation cost the pre-PR2 pipeline paid at its call boundary. Escaped
 * pixels are compared both on the raw escape-iteration channels and on the
 * primary channel (the wrapper recomputes the smooth iteration the way the
 * pre-PR2 production classifier did, so both variants pay the same
 * transcendental cost and carry identical primary values).
 *
 * Directional Node/V8 evidence, not release evidence (plan section 9): run
 * via `npm run poc:bench:pr2` (builds with vite, then runs
 * `node --expose-gc`). Results are written to
 * poc/performance/results/pr2/pr2-microbench.json.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus, platform, release, totalmem } from 'node:os';
import { join } from 'node:path';
import { PerformanceObserver, type PerformanceEntry } from 'node:perf_hooks';
import { getHeapSpaceStatistics } from 'node:v8';

import { ControlKernel } from './kernels/control.ts';
import { CORPUS_SEED, HARD_VIEW_ANCHORS } from './corpus.ts';
import {
  classifyInto,
  createOrbitSample,
  OrbitScratch,
  resolveOrbitOptions,
  type OrbitOptions,
} from '../../../src/domain';

const RESULTS_DIR = join(process.cwd(), 'poc/performance/results/pr2');

/** Legacy quality profile (plan section 4 profiles; thresholds frozen). */
const PROFILE = { maxIterations: 256, maxPeriod: 16, cycleTolerance: 1e-10, cycleWarmup: 24 };
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
  };
};

const CASES: readonly Case[] = [
  // Deep zoom on the real-axis hard anchor (corpus hard-view-anchor stratum,
  // zoom 609): expensive interior/unresolved pixels dominate, hiding small
  // per-pixel overheads.
  anchorCase('hard-slice-anchor-2', 1),
  // Full-set view: escape-dominated cheap pixels, where per-pixel overhead
  // and garbage-collection jitter are visible.
  {
    id: 'full-set-slice',
    viewport: { center: { re: -0.75, im: 0 }, spanY: 2.5 },
  },
];

interface BandChannels {
  readonly status: Uint8Array;
  readonly period: Uint32Array;
  readonly primary: Float64Array;
  readonly secondary: Float64Array;
}

interface AllocationPass {
  readonly gcEvents: number;
  readonly scavengeEvents: number;
  readonly markCompactEvents: number;
  readonly gcPauseMs: number;
  readonly kindsHistogram: Record<string, number>;
}

/**
 * Allocation accounting per variant: the object count the pipeline shape
 * allocates per pixel by construction, plus the empirical per-pass churn
 * bound (scavenge count times the young-generation capacity observed at the
 * start of the pass, divided by the pixel count — a conservative upper
 * bound, since a scavenge empties at most one semi-space).
 */
interface AllocationAccounting {
  readonly pass: AllocationPass;
  readonly objectsPerPixelByConstruction: number;
  readonly objectsPerPixelNote: string;
  readonly youngGenCapacityBytes: number;
  readonly churnBoundBytes: number;
  readonly churnBoundBytesPerPixel: number;
}

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

const stdev = (values: readonly number[]): number => {
  const mean = values.reduce((total, value) => total + value, 0) / values.length;
  return Math.sqrt(
    values.reduce((total, value) => total + (value - mean) * (value - mean), 0) / values.length,
  );
};

interface VariantReport {
  readonly description: string;
  readonly samplesMs: number[];
  readonly medianMs: number;
  readonly madMs: number;
  readonly stdevMs: number;
  readonly minMs: number;
  readonly maxMs: number;
  readonly allocation: AllocationAccounting;
}

/**
 * Full-raster agreement between the legacy comparator and the scalar core.
 * All comparisons are exact (the PoC parity test in control.test.ts pins the
 * same bit-for-bit contract at corpus scale); any mismatch fails the run.
 */
interface ParityReport {
  readonly pixels: number;
  readonly statusMismatches: number;
  readonly escapeIterationMismatches: number;
  readonly smoothIterationMismatches: number;
  readonly attractingMismatches: number;
  readonly ok: boolean;
  readonly note: string;
}

interface CaseReport {
  readonly id: string;
  readonly viewport: {
    readonly center: { readonly re: number; readonly im: number };
    readonly spanY: number;
  };
  readonly anchor?: { readonly re: number; readonly im: number; readonly zoom: number };
  readonly size: { readonly width: number; readonly height: number };
  readonly pixelCount: number;
  readonly parity: ParityReport;
  readonly variants: Record<'legacy-allocating' | 'scalar-core', VariantReport>;
}

const gcKindOf = (entry: PerformanceEntry): string =>
  String(
    (entry as PerformanceEntry & { detail?: { kind?: number | string } }).detail?.kind ?? 'unknown',
  );

const main = async (): Promise<void> => {
  const gc = globalThis.gc;
  if (typeof gc !== 'function') {
    throw new Error('run with node --expose-gc (npm run poc:bench:pr2)');
  }

  /** One dedicated GC-observed pass; entries drain before counting. */
  const measureAllocationPass = async (
    pass: () => void,
    pixelCount: number,
    objectsPerPixelByConstruction: number,
    objectsPerPixelNote: string,
  ): Promise<AllocationAccounting> => {
    const entries: PerformanceEntry[] = [];
    const observer = new PerformanceObserver((list) => {
      entries.push(...list.getEntries());
    });
    observer.observe({ entryTypes: ['gc'] });
    gc();
    gc();
    // The young-generation capacity observed at the start of the pass converts
    // scavenge counts into a churn bound; V8 may resize it dynamically, so it
    // is captured per pass rather than once per process.
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
    const kinds = entries.map(gcKindOf);
    const kindsHistogram: Record<string, number> = {};
    for (const kind of kinds) {
      kindsHistogram[kind] = (kindsHistogram[kind] ?? 0) + 1;
    }
    const scavengeEvents = kindsHistogram['1'] ?? 0;
    const churnBoundBytes = scavengeEvents * newSpace.space_size;
    return {
      pass: {
        gcEvents: entries.length,
        // Node exposes V8 GC flags in entry.detail.kind: 1 scavenge,
        // 2 mark-compact, 4 incremental marking.
        scavengeEvents,
        markCompactEvents: kindsHistogram['2'] ?? 0,
        gcPauseMs: roundMs(entries.reduce((total, entry) => total + entry.duration, 0)),
        kindsHistogram,
      },
      objectsPerPixelByConstruction,
      objectsPerPixelNote,
      youngGenCapacityBytes: newSpace.space_size,
      churnBoundBytes,
      churnBoundBytesPerPixel: Math.round((churnBoundBytes / pixelCount) * 1000) / 1000,
    };
  };

  const options: OrbitOptions = resolveOrbitOptions(PROFILE);
  const kernelOptions = { ...PROFILE, exhaustionScan: true };

  // The legacy comparator stores each result into a preallocated ring so the
  // per-pixel record escapes: V8 escape analysis would otherwise
  // scalar-replace it in this microbench and hide the allocation cost the
  // pre-PR2 pipeline paid when its results crossed the call boundary.
  const legacySink: unknown[] = new Array(1024);
  const legacyKernel = new ControlKernel(options.maxPeriod);
  const scalarScratch = new OrbitScratch(options.maxPeriod);
  const scalarSample = createOrbitSample();

  const caseReports: CaseReport[] = [];
  for (const item of CASES) {
    const size = { width: RASTER, height: RASTER };
    const viewport = item.viewport;
    const unitsPerPixel = viewport.spanY / size.height;
    const pixelCount = size.width * size.height;

    const channels = (): BandChannels => ({
      status: new Uint8Array(pixelCount),
      period: new Uint32Array(pixelCount),
      primary: new Float64Array(pixelCount),
      secondary: new Float64Array(pixelCount),
    });
    const legacyBands = channels();
    const scalarBands = channels();
    // Dedicated escape-iteration channels for the parity gate: the primary
    // Float64 channel intentionally differs on escaped pixels (smooth
    // iteration is a production concern the PoC control kernel omits).
    const legacyEscape = new Uint32Array(pixelCount);
    const scalarEscape = new Uint32Array(pixelCount);

    // Coordinate closures mirror the viewport transform exactly; the legacy
    // variant intentionally allocates its Complex per pixel (pre-PR2 shape).
    const cRe = (x: number): number =>
      viewport.center.re + (x + 0.5 - size.width / 2) * unitsPerPixel;
    const cIm = (y: number): number =>
      viewport.center.im - (y + 0.5 - size.height / 2) * unitsPerPixel;

    // The pre-PR2 production pipeline wrote the smooth escape iteration into
    // the primary channel; the PoC control kernel omits smooth iteration as a
    // rendering concern, so the legacy wrapper recomputes it here from the
    // kernel's escape record — the same formula over the same doubles the
    // production classifier used (and the scalar core still uses), keeping
    // the band-write cost of both variants comparable.
    const smoothEscapeIteration = (escapeIteration: number, magnitudeSquared: number): number => {
      const smooth = escapeIteration + 1 - Math.log2(Math.log2(Math.sqrt(magnitudeSquared)));
      return Number.isFinite(smooth) ? smooth : escapeIteration;
    };

    const legacyPass = (): void => {
      const { status, period, primary, secondary } = legacyBands;
      for (let y = 0; y < size.height; y += 1) {
        const im = cIm(y);
        for (let x = 0; x < size.width; x += 1) {
          const point = { re: cRe(x), im };
          const result = legacyKernel.classify(point.re, point.im, kernelOptions);
          const offset = y * size.width + x;
          legacySink[offset & 1023] = result;
          if (result.status === 'attracting') {
            status[offset] = 2;
            period[offset] = result.period;
            primary[offset] = result.multiplierMagnitude;
            secondary[offset] = result.multiplierAngle;
          } else if (result.status === 'escaped') {
            status[offset] = 1;
            primary[offset] = smoothEscapeIteration(
              result.escapeIteration,
              result.magnitudeSquared,
            );
            legacyEscape[offset] = result.escapeIteration;
          }
        }
      }
    };

    const scalarPass = (): void => {
      const { status, period, primary, secondary } = scalarBands;
      for (let y = 0; y < size.height; y += 1) {
        const im = cIm(y);
        for (let x = 0; x < size.width; x += 1) {
          classifyInto(cRe(x), im, options, scalarScratch, scalarSample);
          const offset = y * size.width + x;
          const sampleStatus = scalarSample.status;
          if (sampleStatus === 2) {
            status[offset] = 2;
            period[offset] = scalarSample.period;
            primary[offset] = scalarSample.multiplierMagnitude;
            secondary[offset] = scalarSample.multiplierAngle;
          } else if (sampleStatus === 1) {
            status[offset] = 1;
            primary[offset] = scalarSample.smoothIteration;
            scalarEscape[offset] = scalarSample.escapeIteration;
          }
        }
      }
    };

    /** Exact full-raster parity gate; returns the first mismatches found. */
    const checkParity = (): ParityReport => {
      const legacyStatus = legacyBands.status;
      const scalarStatus = scalarBands.status;
      let statusMismatches = 0;
      let escapeIterationMismatches = 0;
      let smoothIterationMismatches = 0;
      let attractingMismatches = 0;
      let first: string | undefined;
      const noteFirst = (message: string): void => {
        first ??= message;
      };
      for (let offset = 0; offset < pixelCount; offset += 1) {
        const legacy = legacyStatus[offset];
        if (legacy !== scalarStatus[offset]) {
          statusMismatches += 1;
          noteFirst(`pixel ${offset}: legacy status ${legacy} vs scalar ${scalarStatus[offset]}`);
          continue;
        }
        if (legacy === 1) {
          if (legacyEscape[offset] !== scalarEscape[offset]) {
            escapeIterationMismatches += 1;
            noteFirst(
              `pixel ${offset}: legacy escapeIteration ${legacyEscape[offset]} vs scalar ${scalarEscape[offset]}`,
            );
          }
          if (legacyBands.primary[offset] !== scalarBands.primary[offset]) {
            smoothIterationMismatches += 1;
            noteFirst(
              `pixel ${offset}: legacy smoothIteration ${legacyBands.primary[offset]} vs scalar ${scalarBands.primary[offset]}`,
            );
          }
        }
        if (
          legacy === 2 &&
          (legacyBands.period[offset] !== scalarBands.period[offset] ||
            legacyBands.primary[offset] !== scalarBands.primary[offset] ||
            legacyBands.secondary[offset] !== scalarBands.secondary[offset])
        ) {
          attractingMismatches += 1;
          noteFirst(
            `pixel ${offset}: legacy (period ${legacyBands.period[offset]}, |lambda| ${legacyBands.primary[offset]}, arg ${legacyBands.secondary[offset]}) vs scalar (period ${scalarBands.period[offset]}, |lambda| ${scalarBands.primary[offset]}, arg ${scalarBands.secondary[offset]})`,
          );
        }
      }
      const total =
        statusMismatches +
        escapeIterationMismatches +
        smoothIterationMismatches +
        attractingMismatches;
      return {
        pixels: pixelCount,
        statusMismatches,
        escapeIterationMismatches,
        smoothIterationMismatches,
        attractingMismatches,
        ok: total === 0,
        note: first ?? 'all status, escape/smooth iteration, period, and multiplier bits identical',
      };
    };

    const measureVariant = async (
      description: string,
      pass: () => void,
      objectsPerPixelByConstruction: number,
      objectsPerPixelNote: string,
    ): Promise<VariantReport> => {
      // Warmup: JIT and young generation, discarded. Block-sequential keeps
      // per-variant JIT state consistent; drift between blocks is bounded
      // by the MAD reporting rather than paired deltas.
      for (let warmup = 0; warmup < WARMUP_PASSES; warmup += 1) {
        pass();
      }

      const samplesMs: number[] = [];
      for (let rep = 0; rep < TIMED_PASSES; rep += 1) {
        const started = performance.now();
        pass();
        samplesMs.push(performance.now() - started);
      }

      const allocation = await measureAllocationPass(
        pass,
        pixelCount,
        objectsPerPixelByConstruction,
        objectsPerPixelNote,
      );

      return {
        description,
        samplesMs: samplesMs.map(roundMs),
        medianMs: roundMs(median(samplesMs)),
        madMs: roundMs(meanAbsoluteDeviation(samplesMs)),
        stdevMs: roundMs(stdev(samplesMs)),
        minMs: roundMs(Math.min(...samplesMs)),
        maxMs: roundMs(Math.max(...samplesMs)),
        allocation,
      };
    };

    // Parity gate first: the pre-PR2 pipeline shape and the scalar core must
    // produce identical band content, or the run fails loudly and writes no
    // evidence. This pass also warms maps and JIT state ahead of timing.
    legacyPass();
    scalarPass();
    const parity = checkParity();
    if (!parity.ok) {
      process.stderr.write(
        `PARITY DIVERGENCE in ${item.id}: ` +
          `${parity.statusMismatches} status, ${parity.escapeIterationMismatches} escape-iteration, ` +
          `${parity.smoothIterationMismatches} smooth-iteration, ${parity.attractingMismatches} ` +
          `attracting-channel mismatches over ${parity.pixels} pixels. ` +
          `First: ${parity.note}\n`,
      );
      process.exitCode = 1;
      return;
    }

    const legacy = await measureVariant(
      'Pre-PR2 pipeline shape: allocating pixelToComplex, PoC control kernel (legacy port) with a per-pixel result record retained briefly, status-mapping writes. The control kernel omits smooth escape iteration, so the wrapper recomputes it from the escape record the way the pre-PR2 production classifier did.',
      legacyPass,
      3,
      'Lower bound by construction: one Complex at the allocating pixelToComplex boundary, one metrics record, and one result record per pixel; each verifier call allocates a further multiplier record.',
    );
    const scalar = await measureVariant(
      'Production scalar pipeline shape: pixelToComplexInto, classifyInto into a preallocated OrbitSample, direct channel writes. No per-pixel object is created.',
      scalarPass,
      0,
      'By construction: no object is created per pixel; residual scavenges stem from boxed double arguments at the non-inlined classifyInto call boundary and from Math.hypot (a C++ builtin) on cycle detection.',
    );

    caseReports.push({
      ...(item.anchor === undefined ? {} : { anchor: item.anchor }),
      id: item.id,
      viewport,
      size,
      pixelCount,
      parity,
      variants: { 'legacy-allocating': legacy, 'scalar-core': scalar },
    });
  }

  const spreadVerdicts = caseReports.map((report) => {
    const legacy = report.variants['legacy-allocating'];
    const scalar = report.variants['scalar-core'];
    const relativeSpread = (variant: VariantReport): number =>
      variant.medianMs === 0 ? 0 : variant.madMs / variant.medianMs;
    return {
      case: report.id,
      madLegacyMs: legacy.madMs,
      madScalarMs: scalar.madMs,
      relativeSpreadLegacy: relativeSpread(legacy),
      relativeSpreadScalar: relativeSpread(scalar),
      tightened: scalar.madMs < legacy.madMs ? 'yes' : 'no',
      note: 'Allocation removal tightens classifyMs spread when the scalar MAD (absolute and relative) is below the legacy MAD. Directional judgment over the timed reps of one machine.',
    };
  });

  const report = {
    schemaVersion: 1,
    label: 'directional — Node/V8 evidence, not release evidence',
    description:
      'PR 2 microbench: allocation-free scalar classification pipeline versus the legacy allocating pipeline over fixed hard-view raster slices.',
    planReference: 'docs/plans/int-m-performance-plan.html section 5, workstream B',
    measuredAt: new Date().toISOString(),
    environment: {
      node: process.version,
      platform: platform(),
      platformRelease: release(),
      logicalCpuCount: cpus().length,
      cpuModel: cpus()[0]?.model ?? 'unknown',
      totalMemoryBytes: totalmem(),
      note: 'Node single process; run via npm run poc:bench:pr2 (vite SSR build + node --expose-gc).',
    },
    harness: {
      corpusSeed: CORPUS_SEED,
      warmupPasses: WARMUP_PASSES,
      timedPasses: TIMED_PASSES,
      profile: PROFILE,
      comparisonBasis:
        'PoC control kernel (faithful port of the pre-PR2 classifier) is the legacy comparator; the scalar core is the production classifyInto. Band channels are preallocated before measurement in both variants.',
      parityGate:
        'Before timing, each case runs both variants once over the full raster and compares status, escape iteration, period, and multiplier magnitude/angle on every pixel with exact equality; any mismatch aborts the run with a non-zero exit code and no results are written.',
      allocationMetric:
        'GC performance entries (scavenges and mark-compact) during one dedicated pass with a settle drain. A scavenge count of N for a young generation of capacity S bounds per-pass churn at ~N x S bytes (reported per pixel); short-lived per-pixel garbage is invisible to gc()-based heap deltas and to the V8 sampling heap profiler, which records only surviving allocations. Per-pixel object counts are additionally reported by construction.',
    },
    cases: caseReports,
    varianceClaim: spreadVerdicts,
  };

  mkdirSync(RESULTS_DIR, { recursive: true });
  const target = join(RESULTS_DIR, 'pr2-microbench.json');
  writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`);
  for (const item of caseReports) {
    const legacy = item.variants['legacy-allocating'];
    const scalar = item.variants['scalar-core'];
    process.stdout.write(
      `${item.id}\n` +
        `  legacy: median ${legacy.medianMs} ms (MAD ${legacy.madMs} ms), ` +
        `objects/pixel >= ${legacy.allocation.objectsPerPixelByConstruction}, ` +
        `churn <= ${legacy.allocation.churnBoundBytesPerPixel} B/pixel ` +
        `(${legacy.allocation.pass.scavengeEvents} scavenges)\n` +
        `  scalar: median ${scalar.medianMs} ms (MAD ${scalar.madMs} ms), ` +
        `objects/pixel ${scalar.allocation.objectsPerPixelByConstruction}, ` +
        `churn <= ${scalar.allocation.churnBoundBytesPerPixel} B/pixel ` +
        `(${scalar.allocation.pass.scavengeEvents} scavenges)\n` +
        `  parity: ${item.parity.ok ? 'ok' : 'DIVERGED'} (${item.parity.note})\n`,
    );
  }
  const failedParity = caseReports.find((report) => !report.parity.ok);
  if (failedParity !== undefined) {
    process.stderr.write(
      `PARITY DIVERGENCE in ${failedParity.id}: legacy and scalar band channels disagree; ` +
        'results written this run are NOT evidence. First: ' +
        `${failedParity.parity.note}\n`,
    );
    process.exitCode = 1;
  }
  process.stdout.write(`written: ${target}\n`);
};

void main();
