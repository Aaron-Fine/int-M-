/**
 * Workstream C gate component `Lag comparisons reduced >50%` for the default
 * watched-lag kernel (ADR 0006), measured over the frozen corpus.
 *
 * - legacy-scan: the instrumented kernel's own `lagComparisons` counter
 *   (orbit-instrumented.ts, parity-pinned to classifyInto).
 * - triggered-scan: a counting replica of classifyTriggeredOrbitInto (one
 *   comparison for each watched-lag test, one per lag distance of each full
 *   scan). The replica is checked against the production kernel on every
 *   pixel — status, iterations, period, multiplier, smooth iteration — and
 *   the run fails on any difference, so its counts describe the shipped path.
 *
 * Deterministic counts, not timing: safe to run on a quiet or busy machine.
 * Usage: node lag-comparisons.js [WxH] (default: the shipping 1024x640)
 */
import { writeFileSync } from 'node:fs';
import process from 'node:process';
import {
  classifyAnalyticInto,
  createOrbitSample,
  createViewportTransform,
  OrbitClassifier,
  OrbitScratch,
  resolveOrbitOptions,
  TRIGGERED_SCAN_INTERVAL_FIRST,
  TRIGGERED_SCAN_INTERVAL_MAX,
  verifyCycleInto,
  VERIFIER_VERDICT,
  type OrbitOptions,
  type OrbitSample,
} from '../../src/domain';
import { createLegacyScanCounters } from '../../src/domain/orbit-instrumented';
import { ORBIT_EVIDENCE_CODE } from '../../src/domain/types';
import { loadCorpusCases, parseRaster, profileQuality } from './judge/corpus';

const size = parseRaster(process.argv[2] ?? '1024x640');
const outPath = process.argv[3];

/** classifyTriggeredOrbitInto with comparison counting; returns the count. */
const countTriggered = (
  cRe: number,
  cIm: number,
  options: OrbitOptions,
  scratch: OrbitScratch,
  out: OrbitSample,
): number => {
  if (classifyAnalyticInto(cRe, cIm, out)) return 0;
  scratch.ensureCapacity(options.maxPeriod);
  const historyRe = scratch.historyRe;
  const historyIm = scratch.historyIm;
  const mask = historyRe.length - 1;
  const toleranceSquared = options.cycleTolerance * options.cycleTolerance;
  const scanStart = Math.max(options.cycleWarmup, 2);
  let comparisons = 0;
  let zRe = 0;
  let zIm = 0;
  let watch = 1;
  let due = scanStart;
  let interval = TRIGGERED_SCAN_INTERVAL_FIRST;
  for (let iteration = 1; iteration <= options.maxIterations; iteration += 1) {
    const nextRe = zRe * zRe - zIm * zIm + cRe;
    zIm = 2 * zRe * zIm + cIm;
    zRe = nextRe;
    const magnitudeSquared = zRe * zRe + zIm * zIm;
    if (magnitudeSquared > 4) {
      const smoothIteration = iteration + 1 - Math.log2(Math.log2(Math.sqrt(magnitudeSquared)));
      out.status = 1;
      out.iterations = iteration;
      out.evidence = ORBIT_EVIDENCE_CODE.escapeRadius;
      out.escapeIteration = iteration;
      out.smoothIteration = Number.isFinite(smoothIteration) ? smoothIteration : iteration;
      out.magnitudeSquared = magnitudeSquared;
      return comparisons;
    }
    const currentIndex = (iteration - 1) & mask;
    historyRe[currentIndex] = zRe;
    historyIm[currentIndex] = zIm;
    if (iteration < scanStart) continue;
    const watchIndex = (currentIndex - watch) & mask;
    const watchRe = zRe - (historyRe[watchIndex] ?? Number.NaN);
    const watchIm = zIm - (historyIm[watchIndex] ?? Number.NaN);
    comparisons += 1;
    const fired = watchRe * watchRe + watchIm * watchIm <= toleranceSquared;
    if (!fired && iteration !== due && iteration !== options.maxIterations) continue;
    if (iteration === due) {
      due = iteration + interval;
      interval = Math.min(2 * interval, TRIGGERED_SCAN_INTERVAL_MAX);
    }
    const largestPeriod = Math.min(options.maxPeriod, iteration - 1);
    let nearestLag = 1;
    let nearestSquared = Number.POSITIVE_INFINITY;
    for (let period = 1; period <= largestPeriod; period += 1) {
      const previousIndex = (currentIndex - period) & mask;
      const distanceRe = zRe - (historyRe[previousIndex] ?? Number.NaN);
      const distanceIm = zIm - (historyIm[previousIndex] ?? Number.NaN);
      comparisons += 1;
      const distanceSquared = distanceRe * distanceRe + distanceIm * distanceIm;
      if (distanceSquared < nearestSquared) {
        nearestSquared = distanceSquared;
        nearestLag = period;
      }
      if (distanceSquared > toleranceSquared) continue;
      const verdict = verifyCycleInto(
        cRe,
        cIm,
        zRe,
        zIm,
        period,
        iteration,
        ORBIT_EVIDENCE_CODE.convergedCycle,
        out,
      );
      if (verdict === VERIFIER_VERDICT.accepted) return comparisons;
    }
    watch = nearestLag;
  }
  out.status = 0;
  out.iterations = options.maxIterations;
  out.evidence = ORBIT_EVIDENCE_CODE.iterationLimit;
  return comparisons;
};

const sameSample = (a: OrbitSample, b: OrbitSample): boolean =>
  a.status === b.status &&
  a.iterations === b.iterations &&
  (a.status !== 1 || Object.is(a.smoothIteration, b.smoothIteration)) &&
  (a.status !== 2 ||
    (a.period === b.period &&
      Object.is(a.multiplierRe, b.multiplierRe) &&
      Object.is(a.multiplierIm, b.multiplierIm)));

interface CaseRow {
  readonly caseId: string;
  readonly designation: string;
  readonly profile: string;
  readonly legacyComparisons: number;
  readonly triggeredComparisons: number;
  readonly reductionPct: number;
  readonly replicaMismatches: number;
}

const rows: CaseRow[] = [];
for (const corpusCase of loadCorpusCases()) {
  const quality = profileQuality(corpusCase.profile);
  const base = { maxIterations: quality.maxIterations, maxPeriod: quality.maxPeriod };
  const legacyCounters = createLegacyScanCounters();
  const legacy = new OrbitClassifier(
    { ...base, classifierMode: 'legacy-scan' },
    undefined,
    legacyCounters,
  );
  const production = new OrbitClassifier({ ...base, classifierMode: 'triggered-scan' });
  const options = resolveOrbitOptions({ ...base, classifierMode: 'triggered-scan' });
  const scratch = new OrbitScratch(options.maxPeriod);
  const transform = createViewportTransform(corpusCase.viewport, size);
  const legacySample = createOrbitSample();
  const productionSample = createOrbitSample();
  const replicaSample = createOrbitSample();
  let triggeredComparisons = 0;
  let replicaMismatches = 0;
  for (let y = 0; y < size.height; y += 1) {
    for (let x = 0; x < size.width; x += 1) {
      const c = transform.pixelToComplex(x, y);
      legacy.classifyInto(c.re, c.im, legacySample);
      production.classifyInto(c.re, c.im, productionSample);
      triggeredComparisons += countTriggered(c.re, c.im, options, scratch, replicaSample);
      if (!sameSample(productionSample, replicaSample)) replicaMismatches += 1;
    }
  }
  const legacyComparisons = legacyCounters.lagComparisons;
  rows.push({
    caseId: corpusCase.id,
    designation: corpusCase.designation,
    profile: corpusCase.profile,
    legacyComparisons,
    triggeredComparisons,
    reductionPct:
      legacyComparisons === 0 ? 0 : (1 - triggeredComparisons / legacyComparisons) * 100,
    replicaMismatches,
  });
  process.stderr.write(
    `${corpusCase.id}: legacy ${legacyComparisons} triggered ${triggeredComparisons} ` +
      `(${rows.at(-1)?.reductionPct.toFixed(1)}% fewer), replica mismatches ${replicaMismatches}\n`,
  );
}

const totalLegacy = rows.reduce((sum, row) => sum + row.legacyComparisons, 0);
const totalTriggered = rows.reduce((sum, row) => sum + row.triggeredComparisons, 0);
const result = {
  description:
    'Lag comparisons per corpus case: legacy-scan instrumented counter vs a pixel-checked counting replica of the watched-lag kernel',
  raster: size,
  rows,
  total: {
    legacyComparisons: totalLegacy,
    triggeredComparisons: totalTriggered,
    reductionPct: (1 - totalTriggered / totalLegacy) * 100,
  },
  replicaMismatches: rows.reduce((sum, row) => sum + row.replicaMismatches, 0),
};
const json = `${JSON.stringify(result, null, 2)}\n`;
if (outPath === undefined) process.stdout.write(json);
else writeFileSync(outPath, json);
if (result.replicaMismatches > 0) {
  process.stderr.write('the counting replica diverged from the production kernel\n');
  process.exit(1);
}
