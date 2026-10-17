/**
 * Coarse-budget study (development aid; output recorded in
 * docs/verification/COARSE-BUDGET-STUDY-2026-10-16.md). Decides the deep end
 * of the depth-aware coarse iteration ramp (src/render/coarse-budget.ts).
 *
 * Part 1: for the 6,000,000x basilica-rim view and two shallow views, run the
 * production coarse pass (scalar classifier, stride max(2, coarseStride),
 * maxPeriod <= 16) at several iteration budgets. Report time and the share of
 * "resolvable" sample pixels (those the profile's stable budget resolves)
 * that the coarse pass still leaves unresolved, split into left and right
 * halves, plus "flips" (resolved at both budgets but with a different status
 * or period: must be 0).
 * Part 2 (when a candidate deep budget is given): coarse time for every
 * corpus view at 256 and at its ramped budget.
 *
 * Usage: npm run coarse-budget-study -- [raster WxH] [reps] [candidate deep budget]
 */
import { classifyRows } from '../../src/render/classify-rows';
import { unpackPeriod, unpackStatus } from '../../src/render/packed-semantic';
import { coarseIterationBudget, COARSE_RAMP } from '../../src/render/coarse-budget';
import { loadCorpusCases, parseRaster, profileQuality, type CorpusCase } from './judge/corpus';

const args = process.argv.slice(2);
const size = parseRaster(args[0] ?? '1024x640');
const reps = Number(args[1] ?? '5');
const candidateDeep = args[2] === undefined ? undefined : Number(args[2]);
const signal = new AbortController().signal;

const DEEP_ID = 'mi-scale-6mx-basilica-rim';
const SHALLOW_IDS = ['mi-hard-supplied-126x', 'mi-fallback-budget-exhaustion'];
const BUDGETS = [256, 320, 384, 448, 512, 768, 1024];
/** Node classify time per corpus view that leaves headroom under the 100 ms coarse budget in a browser. */
const NODE_COARSE_LIMIT_MS = 35;

interface Samples {
  readonly status: Uint8Array;
  readonly period: Uint32Array;
  readonly medianMs: number;
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? Number.NaN;
};

const coarseStrideOf = (c: CorpusCase): number =>
  Math.max(2, profileQuality(c.profile).coarseStride);

/** Classifies the stride grid with the given budget; returns per-sample status/period and median ms. */
const classifyGrid = async (
  c: CorpusCase,
  maxIterations: number,
  maxPeriod: number,
  timed: boolean,
): Promise<Samples> => {
  const stride = coarseStrideOf(c);
  const quality = { maxIterations, maxPeriod, coarseStride: stride };
  const request = { viewport: c.viewport, size, quality };
  const times: number[] = [];
  let last = await classifyRows(request, quality, stride, 0, size.height, signal);
  for (let rep = 0; timed && rep < reps; rep += 1) {
    const started = performance.now();
    last = await classifyRows(request, quality, stride, 0, size.height, signal);
    times.push(performance.now() - started);
  }
  const columns = Math.ceil(size.width / stride);
  const rows = Math.ceil(size.height / stride);
  const status = new Uint8Array(columns * rows);
  const period = new Uint32Array(columns * rows);
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const word = last.packedStatusPeriod[row * stride * size.width + column * stride] ?? 0;
      status[row * columns + column] = unpackStatus(word);
      period[row * columns + column] = unpackPeriod(word);
    }
  }
  return { status, period, medianMs: timed ? median(times) : Number.NaN };
};

const pct = (n: number, d: number): string => (d === 0 ? 'n/a' : `${((100 * n) / d).toFixed(1)}%`);
const out = (line: string): void => {
  process.stdout.write(`${line}\n`);
};

const part1 = async (c: CorpusCase): Promise<void> => {
  const stable = profileQuality(c.profile);
  const stride = coarseStrideOf(c);
  const columns = Math.ceil(size.width / stride);
  const reference = await classifyGrid(c, stable.maxIterations, stable.maxPeriod, false);
  const total = reference.status.length;
  const resolvable = reference.status.reduce((sum, s) => sum + (s === 0 ? 0 : 1), 0);
  out(
    `\n### ${c.id} (${c.profile}, stable budget ${stable.maxIterations}, stride ${stride}, ` +
      `${(2.5 / c.viewport.spanY).toFixed(0)}x)\n`,
  );
  out(
    `Reference (stable budget) leaves ${pct(total - resolvable, total)} of samples unresolved; ` +
      `the remaining ${pct(resolvable, total)} are resolvable.\n`,
  );
  out('| coarse budget | median ms | unresolved of resolvable | left half | right half | flips |');
  out('| --- | --- | --- | --- | --- | --- |');
  for (const budget of BUDGETS) {
    if (budget > stable.maxIterations) continue;
    const coarse = await classifyGrid(c, budget, Math.min(stable.maxPeriod, 16), true);
    let missed = 0;
    let missedLeft = 0;
    let missedRight = 0;
    let resolvableLeft = 0;
    let resolvableRight = 0;
    let flips = 0;
    for (let i = 0; i < total; i += 1) {
      const left = i % columns < columns / 2;
      const refStatus = reference.status[i] ?? 0;
      const status = coarse.status[i] ?? 0;
      if (refStatus === 0) continue;
      if (left) resolvableLeft += 1;
      else resolvableRight += 1;
      if (status === 0) {
        missed += 1;
        if (left) missedLeft += 1;
        else missedRight += 1;
      } else if (status !== refStatus || coarse.period[i] !== reference.period[i]) {
        flips += 1;
      }
    }
    out(
      `| ${budget} | ${coarse.medianMs.toFixed(1)} | ${pct(missed, resolvable)} | ` +
        `${pct(missedLeft, resolvableLeft)} | ${pct(missedRight, resolvableRight)} | ${flips} |`,
    );
  }
};

const part2 = async (cases: readonly CorpusCase[], deep: number): Promise<void> => {
  const ramp = { ...COARSE_RAMP, deepIterations: deep };
  out(`\n## Part 2: every corpus view at its ramped budget (deepIterations ${deep})\n`);
  out(
    `| case | magnification | ramped budget | ms @256 | ms @ramped | <= ${NODE_COARSE_LIMIT_MS} ms |`,
  );
  out('| --- | --- | --- | --- | --- | --- |');
  for (const c of cases) {
    const stable = profileQuality(c.profile);
    const ramped = coarseIterationBudget(stable.maxIterations, c.viewport.spanY, ramp);
    const base = await classifyGrid(
      c,
      Math.min(256, stable.maxIterations),
      Math.min(stable.maxPeriod, 16),
      true,
    );
    const deepRun =
      ramped === Math.min(256, stable.maxIterations)
        ? base
        : await classifyGrid(c, ramped, Math.min(stable.maxPeriod, 16), true);
    out(
      `| ${c.id} | ${(2.5 / c.viewport.spanY).toFixed(0)}x | ${ramped} | ${base.medianMs.toFixed(1)} | ` +
        `${deepRun.medianMs.toFixed(1)} | ${deepRun.medianMs <= NODE_COARSE_LIMIT_MS ? 'yes' : 'NO'} |`,
    );
  }
};

const cases = loadCorpusCases();
out(`# Coarse-budget study, raster ${size.width}x${size.height}, ${reps} reps (median)\n`);
out('## Part 1: unresolved share of resolvable samples by coarse budget');
for (const id of [DEEP_ID, ...SHALLOW_IDS]) {
  const c = cases.find((entry) => entry.id === id);
  if (c === undefined) throw new Error(`corpus case ${id} missing`);
  await part1(c);
}
if (candidateDeep !== undefined) await part2(cases, candidateDeep);
process.exit(0);
