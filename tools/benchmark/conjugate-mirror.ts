/**
 * Offline Node classifier measurement for performance workstream M
 * (conjugate-symmetry row mirroring, EXPERIMENT).
 *
 * For each selected case of tools/benchmark/corpus.v1.json (plus clearly
 * labeled derived "@im0" variants recentred on the real axis) this runs the
 * PRODUCTION `classifyRows` over the full shipping raster (1024x640, stride 1,
 * single thread) in two arms, with alternating arm order per paired
 * repetition:
 *
 *   direct   classifyRows over every row
 *   mirrored planConjugateMirror + classifyRows skipping mirrored rows +
 *            applyConjugateMirror (plan and fill cost are INCLUDED)
 *
 * Time is classifier time (row-yield waits excluded, like the production
 * `timing.classifyMs`), not end-to-end frame time. Every pair also checks
 * bitwise parity of all three semantic channels (Object.is).
 *
 * Label: directional Node/V8 evidence on one machine, NOT the plan-section-9
 * release protocol (no browsers, no tile pool, no target-hardware class).
 *
 * Usage (see the evidence summary for the exact invocation):
 *   vite build --ssr tools/benchmark/conjugate-mirror.ts --outDir .evidence-build --emptyOutDir
 *   node .evidence-build/conjugate-mirror.js --out evidence/phase-2/conjugate-mirror-<date>-<sha> \
 *     [--reps 15] [--mode legacy-scan|checkpoint] [--cases id,id,...]
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus, loadavg, platform, release, totalmem } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';

import {
  planConjugateMirror,
  type ClassifierMode,
  type RenderQuality,
  type Viewport,
} from '../../src/domain';
import { classifyRows } from '../../src/render/classify-rows';
import { applyConjugateMirror } from '../../src/render/conjugate-mirror';
import type { DynamicsRenderRequest, SemanticBand } from '../../src/render';
import { getQualityProfile, type QualityProfileId } from '../../src/ui/view-state';

interface CorpusCase {
  readonly id: string;
  readonly class: string;
  readonly center: { readonly re: string; readonly im: string };
  readonly spanY: string;
  readonly profile: string;
}

interface MeasuredCase {
  readonly id: string;
  readonly class: string;
  readonly derived: boolean;
  readonly viewport: Viewport;
  readonly profile: QualityProfileId;
}

interface PairSample {
  readonly repetition: number;
  readonly firstArm: 'direct' | 'mirrored';
  readonly directMs: number;
  readonly mirroredMs: number;
  readonly planMs: number;
  readonly fillMs: number;
  readonly speedup: number;
  readonly mismatches: number;
}

const argValue = (name: string): string | undefined => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
};

const REPS = Number(argValue('reps') ?? '15');
const MODE = (argValue('mode') ?? 'legacy-scan') as ClassifierMode;
const OUT = argValue('out');
const ONLY = argValue('cases')?.split(',');
const WARMUP_SIZE = { width: 256, height: 160 };

const corpus = JSON.parse(readFileSync('tools/benchmark/corpus.v1.json', 'utf8')) as {
  rasters: readonly { id: string; width: number; height: number; role: string }[];
  cases: readonly CorpusCase[];
};
const shipping = corpus.rasters.find((raster) => raster.role === 'shipping');
if (shipping === undefined) throw new Error('corpus has no shipping raster');
const SIZE = { width: shipping.width, height: shipping.height };

const profileId = (profile: string): QualityProfileId => profile.toLowerCase() as QualityProfileId;

const allCases: MeasuredCase[] = [];
for (const entry of corpus.cases) {
  // Coordinates are exact decimal strings in the manifest; parse once here.
  const viewport: Viewport = {
    center: { re: Number(entry.center.re), im: Number(entry.center.im) },
    spanY: Number(entry.spanY),
  };
  allCases.push({
    id: entry.id,
    class: entry.class,
    derived: false,
    viewport,
    profile: profileId(entry.profile),
  });
  // Derived variant: same re and spanY, center.im recentred to 0 (what a user
  // gets after zooming onto the axis). A DIFFERENT region for most cases, so
  // reported separately and never as a corpus case.
  if (viewport.center.im !== 0) {
    allCases.push({
      id: `${entry.id}@im0`,
      class: entry.class,
      derived: true,
      viewport: { center: { re: viewport.center.re, im: 0 }, spanY: viewport.spanY },
      profile: profileId(entry.profile),
    });
  }
}
const cases = ONLY === undefined ? allCases : allCases.filter((entry) => ONLY.includes(entry.id));

const sortedCopy = (values: readonly number[]): number[] => [...values].sort((a, b) => a - b);
const quantile = (values: readonly number[], q: number): number => {
  const sorted = sortedCopy(values);
  if (sorted.length === 0) return Number.NaN;
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const low = sorted[lower] ?? Number.NaN;
  const high = sorted[upper] ?? Number.NaN;
  return low + (high - low) * (position - lower);
};
const median = (values: readonly number[]): number => quantile(values, 0.5);

const mismatchCount = (a: SemanticBand, b: SemanticBand): number => {
  let mismatches = 0;
  for (let index = 0; index < a.packedStatusPeriod.length; index += 1) {
    if (
      a.packedStatusPeriod[index] !== b.packedStatusPeriod[index] ||
      !Object.is(
        a.smoothIterationOrMultiplierMagnitude[index],
        b.smoothIterationOrMultiplierMagnitude[index],
      ) ||
      !Object.is(a.multiplierAngle[index], b.multiplierAngle[index])
    ) {
      mismatches += 1;
    }
  }
  return mismatches;
};

const requestFor = (
  measured: MeasuredCase,
  size: { width: number; height: number },
): DynamicsRenderRequest => ({
  viewport: measured.viewport,
  size,
  quality: getQualityProfile(measured.profile).quality,
});

const signal = new AbortController().signal;

const runDirect = async (
  request: DynamicsRenderRequest,
): Promise<{ band: SemanticBand; ms: number }> => {
  const quality = request.quality as RenderQuality;
  const started = performance.now();
  const band = await classifyRows(request, quality, 1, 0, request.size.height, signal, MODE);
  const ms = performance.now() - started - band.timing.yieldWaitMs;
  return { band, ms };
};

const runMirrored = async (
  request: DynamicsRenderRequest,
): Promise<{ band: SemanticBand; ms: number; planMs: number; fillMs: number }> => {
  const quality = request.quality as RenderQuality;
  const started = performance.now();
  const plan = planConjugateMirror(request.viewport, request.size);
  const planned = performance.now();
  const band = await classifyRows(
    request,
    quality,
    1,
    0,
    request.size.height,
    signal,
    MODE,
    undefined,
    undefined,
    false,
    plan,
  );
  const classified = performance.now();
  if (plan !== undefined) applyConjugateMirror(plan, [band], request.size.width);
  const finished = performance.now();
  return {
    band,
    ms: finished - started - band.timing.yieldWaitMs,
    planMs: planned - started,
    fillMs: finished - classified,
  };
};

const environment = {
  node: process.version,
  platform: `${platform()} ${release()}`,
  cpu: cpus()[0]?.model ?? 'unknown',
  logicalCores: cpus().length,
  memoryTotalBytes: totalmem(),
};

const git = (...args: string[]): string => {
  try {
    return execFileSync('git', args, { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
};

interface CaseResult {
  readonly id: string;
  readonly class: string;
  readonly derived: boolean;
  readonly viewport: Viewport;
  readonly profile: QualityProfileId;
  readonly mirroredRows: number;
  readonly mirroredPixelFraction: number;
  readonly planMedianMs: number;
  readonly samples: readonly PairSample[];
  readonly directMedianMs: number | null;
  readonly mirroredMedianMs: number | null;
  readonly speedupMedian: number | null;
  readonly speedupP90: number | null;
  readonly speedupP10: number | null;
  readonly speedupMin: number | null;
  readonly totalMismatches: number;
}

const loadAverageAtStart = loadavg();
const results: CaseResult[] = [];
for (const measured of cases) {
  const request = requestFor(measured, SIZE);
  const plan = planConjugateMirror(request.viewport, request.size);
  const mirroredRows = plan?.mirroredRows ?? 0;

  // Plan cost on its own (also reported for cases with no plan).
  const planTimes: number[] = [];
  for (let index = 0; index < REPS; index += 1) {
    const started = performance.now();
    planConjugateMirror(request.viewport, request.size);
    planTimes.push(performance.now() - started);
  }

  const samples: PairSample[] = [];
  if (mirroredRows > 0) {
    // JIT warmup on a reduced raster of the same view, both arms.
    const warm = requestFor(measured, WARMUP_SIZE);
    await runDirect(warm);
    await runMirrored(warm);
    for (let repetition = 0; repetition < REPS; repetition += 1) {
      const firstArm = repetition % 2 === 0 ? 'direct' : 'mirrored';
      let direct: Awaited<ReturnType<typeof runDirect>>;
      let mirrored: Awaited<ReturnType<typeof runMirrored>>;
      if (firstArm === 'direct') {
        direct = await runDirect(request);
        mirrored = await runMirrored(request);
      } else {
        mirrored = await runMirrored(request);
        direct = await runDirect(request);
      }
      samples.push({
        repetition,
        firstArm,
        directMs: direct.ms,
        mirroredMs: mirrored.ms,
        planMs: mirrored.planMs,
        fillMs: mirrored.fillMs,
        speedup: direct.ms / mirrored.ms,
        mismatches: mismatchCount(mirrored.band, direct.band),
      });
    }
  }
  const speedups = samples.map((sample) => sample.speedup);
  const have = samples.length > 0;
  const result: CaseResult = {
    id: measured.id,
    class: measured.class,
    derived: measured.derived,
    viewport: measured.viewport,
    profile: measured.profile,
    mirroredRows,
    mirroredPixelFraction: mirroredRows / SIZE.height,
    planMedianMs: median(planTimes),
    samples,
    directMedianMs: have ? median(samples.map((sample) => sample.directMs)) : null,
    mirroredMedianMs: have ? median(samples.map((sample) => sample.mirroredMs)) : null,
    speedupMedian: have ? median(speedups) : null,
    speedupP90: have ? quantile(speedups, 0.9) : null,
    speedupP10: have ? quantile(speedups, 0.1) : null,
    speedupMin: have ? Math.min(...speedups) : null,
    totalMismatches: samples.reduce((sum, sample) => sum + sample.mismatches, 0),
  };
  results.push(result);
  process.stderr.write(
    `${measured.id}: mirroredRows=${mirroredRows}/${SIZE.height}` +
      (have
        ? ` direct=${result.directMedianMs?.toFixed(1)}ms mirrored=${result.mirroredMedianMs?.toFixed(1)}ms ` +
          `speedup median=${result.speedupMedian?.toFixed(3)} p90=${result.speedupP90?.toFixed(3)} ` +
          `mismatches=${result.totalMismatches}\n`
        : ' (no exact conjugate rows; not paired)\n'),
  );
}

const fixed = (value: number | null, digits: number): string =>
  value === null ? 'n/a' : value.toFixed(digits);

const markdownRow = (result: CaseResult): string =>
  `| ${result.id}${result.derived ? ' (derived)' : ''} | ${result.class} | ${result.profile} | ` +
  `${(result.mirroredPixelFraction * 100).toFixed(1)}% (${result.mirroredRows}/${SIZE.height} rows) | ` +
  `${fixed(result.directMedianMs, 1)} | ${fixed(result.mirroredMedianMs, 1)} | ` +
  `${fixed(result.speedupMedian, 3)} | ${fixed(result.speedupP90, 3)} | ${fixed(result.speedupP10, 3)} | ` +
  `${result.samples.length} | ${result.totalMismatches} |`;

const payload = {
  schemaVersion: 1,
  measurement: 'conjugate-mirror-node-classifier',
  label:
    'directional Node/V8 evidence (single thread, classifyRows only); NOT the plan section 9 release protocol',
  generatedAt: new Date().toISOString(),
  git: {
    head: git('rev-parse', '--short', 'HEAD'),
    dirty: git('status', '--porcelain', '--', 'src', 'tools/benchmark') !== '',
  },
  environment,
  loadAverage1m5m15m: { start: loadAverageAtStart, end: loadavg() },
  raster: { id: shipping.id, ...SIZE },
  classifierMode: MODE,
  repetitions: REPS,
  armOrder: 'alternating (even repetitions direct-first, odd mirrored-first)',
  timing: 'performance.now around classifyRows (+plan+fill for mirrored), minus row-yield wait',
  cases: results,
};

const table = [
  '| Case | Class | Profile | Mirrored pixels | Direct median ms | Mirrored median ms | Speedup median | Speedup p90 | Speedup p10 | Pairs | Parity mismatches |',
  '| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ...results.map(markdownRow),
].join('\n');

if (OUT === undefined) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
} else {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, `results-${MODE}.json`), `${JSON.stringify(payload, null, 2)}\n`);
  writeFileSync(join(OUT, `table-${MODE}.md`), `${table}\n`);
  process.stdout.write(`${table}\n`);
}
// The default row-yield scheduler's port keeps the Node event loop alive;
// evidence scripts exit explicitly.
process.exit(0);
