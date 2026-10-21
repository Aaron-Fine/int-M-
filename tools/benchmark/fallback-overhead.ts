/**
 * Fallback-overhead microbenchmark for the analytic fast paths (ADR 0010,
 * ADR 0013; plan section 5, workstream H gate "fallback <=5%"). Directional Node
 * evidence, not a release measurement.
 *
 * Three arms run interleaved in one Node process, each an SSR bundle of
 * tools/benchmark/overhead-entry.ts with its own copy of the classifier:
 * `baseline` (the build before the change), `control` (a byte copy of the
 * baseline bundle, an A/A arm that measures position and JIT noise) and
 * `candidate`. The arm order rotates every repetition; repetition 0 is
 * warmup and is discarded. Overhead is 1/ratio - 1 for the paired
 * median log-ratio of tools/benchmark/harness/stats.ts (95% BCa interval).
 *
 * Usage:
 *   node tools/benchmark/fallback-overhead.ts <baseline.js> <candidate.js>
 *     [--reps N] [--raster WxH] [--cases id,id] [--stride S] [--out file.json]
 * --stride 1 (the default) times the stable pass (the two-lane row kernel);
 * a larger stride times a coarse pass (the scalar kernel). Both arms must
 * accept the stride argument (tools/benchmark/overhead-entry.ts).
 * Exit 0: every case within 5% and the control arm within 2%.
 * Exit 1: a case above 5% with a quiet control arm (a real regression).
 * Exit 3: the control arm moved more than 2% (too noisy; rerun on an idle
 * machine).
 */
import { copyFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { median, pairedRatio } from './harness/stats.ts';

type ArmName = 'baseline' | 'control' | 'candidate';

interface Arm {
  readonly name: ArmName;
  readonly corpusCaseIds: () => readonly string[];
  readonly timeCase: (
    caseId: string,
    size: { readonly width: number; readonly height: number },
    stride?: number,
  ) => Promise<number>;
}

const DEFAULT_CASES = [
  'mi-easy-exterior-heavy',
  'mi-fallback-ambiguous-boundary',
  'mi-easy-default-full',
];
const OVERHEAD_LIMIT = 0.05;
const CONTROL_LIMIT = 0.02;
const SEED = 20_261_016;

const args = process.argv.slice(2);
const option = (name: string): string | undefined => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};
const [baselinePath, candidatePath] = args;
if (baselinePath === undefined || candidatePath === undefined) {
  process.stderr.write('usage: fallback-overhead.ts <baseline.js> <candidate.js> [options]\n');
  process.exit(2);
}
const reps = Number(option('--reps') ?? '60');
const rasterMatch = /^(\d+)x(\d+)$/.exec(option('--raster') ?? '1024x640');
if (rasterMatch === null) throw new RangeError('--raster must look like 1024x640');
const size = { width: Number(rasterMatch[1]), height: Number(rasterMatch[2]) };
const cases = (option('--cases') ?? DEFAULT_CASES.join(',')).split(',');
const stride = Number(option('--stride') ?? '1');
if (!Number.isInteger(stride) || stride < 1) {
  throw new RangeError('--stride must be a positive integer');
}
const load = os.loadavg()[0] ?? 0;
if (load > 1.5) {
  process.stderr.write(`warning: 1-minute load average ${load.toFixed(2)}; expect noise\n`);
}

const importArm = async (name: ArmName, file: string): Promise<Arm> => {
  const module = (await import(pathToFileURL(path.resolve(file)).href)) as Pick<
    Arm,
    'timeCase' | 'corpusCaseIds'
  >;
  return { name, timeCase: module.timeCase, corpusCaseIds: module.corpusCaseIds };
};
// The control arm must be a distinct module instance: copy the baseline file.
const controlPath = path.join(mkdtempSync(path.join(os.tmpdir(), 'h3-control-')), 'control.js');
copyFileSync(path.resolve(baselinePath), controlPath);
const arms = [
  await importArm('baseline', baselinePath),
  await importArm('control', controlPath),
  await importArm('candidate', candidatePath),
];

// Production-like JIT state: every arm first classifies the whole corpus at a
// small raster, so its kernel carries feedback from every path (escape,
// lag scan, verifier, analytic) before the measured cases run.
const WARMUP_RASTER = { width: 256, height: 160 };
for (const arm of arms) {
  for (const caseId of arm.corpusCaseIds()) await arm.timeCase(caseId, WARMUP_RASTER);
}

const samples = new Map<string, Record<ArmName, number[]>>();
for (const caseId of cases) samples.set(caseId, { baseline: [], control: [], candidate: [] });

for (let rep = 0; rep <= reps; rep += 1) {
  for (const caseId of cases) {
    for (let slot = 0; slot < arms.length; slot += 1) {
      const arm = arms[(rep + slot) % arms.length];
      if (arm === undefined) continue;
      const ms = await arm.timeCase(caseId, size, stride);
      if (rep > 0) samples.get(caseId)?.[arm.name].push(ms);
    }
  }
}

const overheadOf = (baseline: number[], other: number[]) => {
  const paired = pairedRatio(baseline, other, SEED);
  // pairedRatio is baseline/other (above 1: other faster).
  return paired === undefined
    ? { estimate: Number.NaN, interval: null }
    : {
        estimate: 1 / paired.ratio - 1,
        interval: [1 / paired.interval[1] - 1, 1 / paired.interval[0] - 1] as const,
      };
};

const rows = cases.map((caseId) => {
  const arm = samples.get(caseId) ?? { baseline: [], control: [], candidate: [] };
  const candidate = overheadOf(arm.baseline, arm.candidate);
  const control = overheadOf(arm.baseline, arm.control);
  return {
    caseId,
    reps,
    raster: size,
    stride,
    medianMs: {
      baseline: median(arm.baseline),
      control: median(arm.control),
      candidate: median(arm.candidate),
    },
    candidateOverhead: candidate,
    controlOverhead: control,
    controlQuiet: Math.abs(control.estimate) <= CONTROL_LIMIT,
    withinLimit: candidate.estimate <= OVERHEAD_LIMIT,
    samples: arm,
  };
});
const noisy = rows.some((row) => !row.controlQuiet);
const regression = rows.some((row) => !row.withinLimit);

const percent = (value: number): string => `${(100 * value).toFixed(2)}%`;
for (const row of rows) {
  process.stdout.write(
    `${row.caseId.padEnd(32)} baseline ${row.medianMs.baseline?.toFixed(2) ?? '-'} ms  ` +
      `candidate ${percent(row.candidateOverhead.estimate)} ` +
      `[${row.candidateOverhead.interval?.map(percent).join(', ') ?? '-'}]  ` +
      `control ${percent(row.controlOverhead.estimate)}  ` +
      `${!row.controlQuiet ? 'NOISY' : row.withinLimit ? 'PASS' : 'FAIL'}\n`,
  );
}
const out = option('--out');
if (out !== undefined) {
  writeFileSync(
    out,
    `${JSON.stringify({ seed: SEED, limit: OVERHEAD_LIMIT, controlLimit: CONTROL_LIMIT, loadAverage: load, rows }, null, 2)}\n`,
  );
}
// The bundles' yield scheduler keeps the event loop alive; exit explicitly.
process.exit(noisy ? 3 : regression ? 1 : 0);
