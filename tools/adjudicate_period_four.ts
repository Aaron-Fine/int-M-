/**
 * Oracle adjudication of every pixel the analytic period-4 path changed
 * (ADR 0007 intended-change rule; ADR 0013). Compares two pixel dumps of the
 * golden raster (tools/kernel_pixel_dump.ts), before and after the change,
 * and checks every changed pixel against the dd period-4 cycle
 * (tests/unit/domain/dd-oracle.ts ddPeriodFourCycle: dd Newton and dd
 * certification, no cubic). Also tallies the unresolved pixels of every case
 * before and after (the deep-view check of the 6,000,000x view). It reads the
 * raster from the dumps and adjudicates every corpus case the after dump
 * holds.
 *
 * Usage: npm run evidence:period-four -- <before.json> <after.json> <out-dir>
 * Writes <out-dir>/raw-observations.json and <out-dir>/semantic-comparison.json
 * and prints the summary tables. Exits 1 if any changed pixel is unsupported.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  classifyPeriodFourInto,
  createOrbitSample,
  createViewportTransform,
  type OrbitSample,
  type PeriodFourCertificate,
} from '../src/domain';
import { prepareRealColumns, preparedRowImaginary } from '../src/render/classify-rows';
import { colorizeFrame } from '../src/render/colorize';
import type { SemanticFrame } from '../src/render/renderer';
import { PACK_PERIOD_BITS, PACK_PERIOD_MAX } from '../src/render/packed-semantic';
import { ddPeriodFourCycle } from '../tests/unit/domain/dd-oracle';
import { loadCorpusCases } from './benchmark/judge/corpus';
import type { PixelDump, PixelDumpCase } from './kernel_pixel_dump';

/**
 * Complex distance allowed between the analytic and the dd multiplier, on
 * top of the certificate's own allowance (dd rounding and dd Newton error).
 */
export const ADJUDICATION_TOLERANCE = 1e-12;

const UNRESOLVED_WORD = 3 << PACK_PERIOD_BITS;
const ATTRACTING_P4_WORD = (2 << PACK_PERIOD_BITS) | 4;
const STATUS_NAMES: Readonly<Record<number, string>> = {
  1: 'escaped',
  2: 'attracting',
  3: 'unresolved',
};

const describeWord = (word: number): string => {
  const status = STATUS_NAMES[word >>> PACK_PERIOD_BITS] ?? 'unknown';
  return status === 'attracting' ? `attracting-p${String(word & PACK_PERIOD_MAX)}` : status;
};

/** |m1 e^{i a1} - m2 e^{i a2}|. */
const distance = (m1: number, a1: number, m2: number, a2: number): number =>
  Math.hypot(m1 * Math.cos(a1) - m2 * Math.cos(a2), m1 * Math.sin(a1) - m2 * Math.sin(a2));

interface Pixel {
  readonly word: number;
  readonly magnitude: number;
  readonly angle: number;
}

const pixelAt = (dump: PixelDumpCase, offset: number): Pixel => ({
  word: dump.packedStatusPeriod[offset] ?? -1,
  magnitude: dump.smoothIterationOrMultiplierMagnitude[offset] ?? Number.NaN,
  angle: dump.multiplierAngle[offset] ?? Number.NaN,
});

const samePixel = (a: Pixel, b: Pixel): boolean =>
  a.word === b.word && Object.is(a.magnitude, b.magnitude) && Object.is(a.angle, b.angle);

interface Verdict {
  readonly analyticError: number | null;
  readonly beforeError: number | null;
  readonly allowance: number;
  readonly supported: boolean;
}

const emptyCertificate = (): PeriodFourCertificate => ({
  productRe: Number.NaN,
  productIm: Number.NaN,
  residualBound: Number.NaN,
  derivativeBound: Number.NaN,
  curvatureBound: Number.NaN,
  radiusRatio: Number.NaN,
  allowance: Number.NaN,
  certified: false,
});

/**
 * Supported: the new answer is exactly the analytic period-4 record at c,
 * and the dd period-4 cycle certifies period 4 with a multiplier within the
 * certificate's allowance plus ADJUDICATION_TOLERANCE of it.
 */
const adjudicate = (
  cRe: number,
  cIm: number,
  before: Pixel,
  after: Pixel,
  sample: OrbitSample,
): Verdict => {
  const certificate = emptyCertificate();
  const matchesAnalytic =
    classifyPeriodFourInto(cRe, cIm, sample, certificate) &&
    after.word === ATTRACTING_P4_WORD &&
    Object.is(sample.multiplierMagnitude, after.magnitude) &&
    Object.is(sample.multiplierAngle, after.angle);
  const oracle = ddPeriodFourCycle(cRe, cIm);
  if (oracle.status !== 'attracting-cycle' || oracle.cycle.primitive !== 4) {
    return {
      analyticError: null,
      beforeError: null,
      allowance: certificate.allowance,
      supported: false,
    };
  }
  const { magnitude, angle } = oracle.cycle;
  const analyticError = distance(after.magnitude, after.angle, magnitude, angle);
  const beforeError =
    before.word === ATTRACTING_P4_WORD
      ? distance(before.magnitude, before.angle, magnitude, angle)
      : null;
  return {
    analyticError,
    beforeError,
    allowance: certificate.allowance,
    supported: matchesAnalytic && analyticError <= certificate.allowance + ADJUDICATION_TOLERANCE,
  };
};

type Row = [number, number, number, number, number | null, number | null, number];

const frameOf = (dump: PixelDump, data: PixelDumpCase): SemanticFrame => ({
  stage: 'stable',
  size: dump.raster,
  sampleStride: 1,
  progress: 1,
  bands: [
    {
      y0: 0,
      y1: dump.raster.height,
      packedStatusPeriod: Uint32Array.from(data.packedStatusPeriod),
      smoothIterationOrMultiplierMagnitude: Float64Array.from(
        data.smoothIterationOrMultiplierMagnitude,
      ),
      multiplierAngle: Float64Array.from(data.multiplierAngle),
    },
  ],
});

/**
 * Pixels whose colorized RGBA differs between the dumps, per semantic view,
 * split into status changes and multiplier-only changes.
 */
const colorChanges = (
  before: PixelDump,
  after: PixelDump,
  beforeCase: PixelDumpCase,
  afterCase: PixelDumpCase,
): Record<string, { statusChanged: number; multiplierOnly: number }> => {
  const result: Record<string, { statusChanged: number; multiplierOnly: number }> = {};
  for (const view of ['stability', 'multiplier', 'period'] as const) {
    const old = colorizeFrame(frameOf(before, beforeCase), view);
    const now = colorizeFrame(frameOf(after, afterCase), view);
    const counts = { statusChanged: 0, multiplierOnly: 0 };
    for (let pixel = 0; pixel < beforeCase.packedStatusPeriod.length; pixel += 1) {
      const o = 4 * pixel;
      if (
        old[o] === now[o] &&
        old[o + 1] === now[o + 1] &&
        old[o + 2] === now[o + 2] &&
        old[o + 3] === now[o + 3]
      ) {
        continue;
      }
      if (beforeCase.packedStatusPeriod[pixel] === afterCase.packedStatusPeriod[pixel]) {
        counts.multiplierOnly += 1;
      } else {
        counts.statusChanged += 1;
      }
    }
    result[view] = counts;
  }
  return result;
};

const countUnresolved = (data: PixelDumpCase): number =>
  data.packedStatusPeriod.reduce((count, word) => count + (word === UNRESOLVED_WORD ? 1 : 0), 0);

/** The tables summary.md quotes, from semantic-comparison.json. */
const printSummary = (comparison: {
  readonly transitionsByCase: Record<string, Record<string, number>>;
  readonly colorChangesByCase: Record<string, ReturnType<typeof colorChanges>>;
  readonly unresolvedByCase: Record<string, { before: number; after: number }>;
  readonly changedPixels: number;
  readonly unsupportedPixels: number;
  readonly maxAnalyticError: number;
  readonly maxBeforeError: number;
  readonly maxAllowance: number;
  readonly maxErrorToAllowance: number;
}): void => {
  process.stdout.write('| Case | Transition | Pixels |\n| --- | --- | ---: |\n');
  for (const [caseId, tally] of Object.entries(comparison.transitionsByCase)) {
    for (const [transition, count] of Object.entries(tally)) {
      process.stdout.write(`| ${caseId} | ${transition} | ${String(count)} |\n`);
    }
  }
  process.stdout.write(
    '\n| Case | View | Colour changed: status | Colour changed: multiplier only |\n',
  );
  process.stdout.write('| --- | --- | ---: | ---: |\n');
  for (const [caseId, views] of Object.entries(comparison.colorChangesByCase)) {
    for (const [view, counts] of Object.entries(views)) {
      if (counts.statusChanged + counts.multiplierOnly === 0) continue;
      process.stdout.write(
        `| ${caseId} | ${view} | ${String(counts.statusChanged)} | ${String(counts.multiplierOnly)} |\n`,
      );
    }
  }
  process.stdout.write(
    '\n| Case | Unresolved before | Unresolved after |\n| --- | ---: | ---: |\n',
  );
  for (const [caseId, counts] of Object.entries(comparison.unresolvedByCase)) {
    if (counts.before === counts.after) continue;
    process.stdout.write(`| ${caseId} | ${String(counts.before)} | ${String(counts.after)} |\n`);
  }
  process.stdout.write(
    `\nchanged ${String(comparison.changedPixels)}, unsupported ${String(comparison.unsupportedPixels)}, ` +
      `max analytic error ${comparison.maxAnalyticError.toExponential(2)}, ` +
      `max allowance ${comparison.maxAllowance.toExponential(2)}, ` +
      `max error/allowance ${comparison.maxErrorToAllowance.toExponential(2)}, ` +
      `max orbit-product error before ${comparison.maxBeforeError.toExponential(2)}\n`,
  );
};

/**
 * Refuses a pair of dumps that cannot be compared pixel for pixel: different
 * rasters, arrays that are not width x height, case sets that differ, case
 * ids the corpus does not know, or no case to adjudicate at all.
 */
const validateDumps = (before: PixelDump, after: PixelDump, corpusIds: readonly string[]): void => {
  const { width, height } = after.raster;
  if (before.raster.width !== width || before.raster.height !== height) {
    throw new Error(
      `raster differs: before ${String(before.raster.width)}x${String(before.raster.height)}, ` +
        `after ${String(width)}x${String(height)}`,
    );
  }
  const beforeIds = Object.keys(before.cases).sort();
  const afterIds = Object.keys(after.cases).sort();
  if (beforeIds.join(',') !== afterIds.join(',')) {
    throw new Error(
      `case sets differ: before [${beforeIds.join(', ')}], after [${afterIds.join(', ')}]`,
    );
  }
  const known = new Set(corpusIds);
  for (const id of afterIds) {
    if (!known.has(id)) throw new Error(`case ${id} is not in the corpus`);
  }
  for (const [label, dump] of [
    ['before', before],
    ['after', after],
  ] as const) {
    for (const id of afterIds) {
      const data = dump.cases[id];
      if (data === undefined) throw new Error(`${label} dump lacks ${id}`);
      for (const field of [
        'packedStatusPeriod',
        'smoothIterationOrMultiplierMagnitude',
        'multiplierAngle',
      ] as const) {
        const length = data[field].length;
        if (length !== width * height) {
          throw new Error(
            `${label} dump ${id} ${field} has ${String(length)} entries, expected ${String(width * height)}`,
          );
        }
      }
    }
  }
};

const parseArguments = (): { beforePath: string; afterPath: string; outDir: string } => {
  const [beforePath, afterPath, outDir] = process.argv.slice(2);
  if (beforePath === undefined || afterPath === undefined || outDir === undefined) {
    process.stderr.write(
      'usage: npm run evidence:period-four -- <before.json> <after.json> <out-dir>\n',
    );
    process.exit(2);
  }
  return { beforePath, afterPath, outDir };
};

// eslint-disable-next-line complexity -- one pass over every pixel of every case; the branches are the tallies
const main = (): void => {
  const { beforePath, afterPath, outDir } = parseArguments();
  const before = JSON.parse(readFileSync(path.resolve(beforePath), 'utf8')) as PixelDump;
  const after = JSON.parse(readFileSync(path.resolve(afterPath), 'utf8')) as PixelDump;
  const { width, height } = after.raster;
  const corpus = loadCorpusCases();
  validateDumps(
    before,
    after,
    corpus.map((corpusCase) => corpusCase.id),
  );
  mkdirSync(path.resolve(outDir), { recursive: true });
  const sample = createOrbitSample();
  const rows: Record<string, Row[]> = {};
  const transitions: Record<string, Record<string, number>> = {};
  const colors: Record<string, ReturnType<typeof colorChanges>> = {};
  const unresolved: Record<string, { before: number; after: number }> = {};
  const unsupported: string[] = [];
  let changed = 0;
  let analyticAnswered = 0;
  const outsideChanged: string[] = [];
  let maxAnalyticError = 0;
  let maxBeforeError = 0;
  let maxAllowance = 0;
  let maxErrorToAllowance = 0;

  // Every corpus case the after dump holds (all of them at the golden
  // raster; a subset for the deep-view check at the shipping raster).
  const cases = corpus.filter((candidate) => after.cases[candidate.id] !== undefined);
  if (cases.length === 0) throw new Error('no corpus case was adjudicated');
  for (const corpusCase of cases) {
    const beforeCase = before.cases[corpusCase.id];
    const afterCase = after.cases[corpusCase.id];
    if (beforeCase === undefined || afterCase === undefined) {
      throw new Error(`dump lacks ${corpusCase.id}`);
    }
    unresolved[corpusCase.id] = {
      before: countUnresolved(beforeCase),
      after: countUnresolved(afterCase),
    };
    const transform = createViewportTransform(corpusCase.viewport, after.raster);
    const columns = new Float64Array(width);
    prepareRealColumns(transform, width, 1, columns);
    const caseRows: Row[] = [];
    const tally: Record<string, number> = {};
    for (let y = 0; y < height; y += 1) {
      const cIm = preparedRowImaginary(transform, height, 1, y);
      for (let x = 0; x < width; x += 1) {
        const offset = y * width + x;
        const old = pixelAt(beforeCase, offset);
        const now = pixelAt(afterCase, offset);
        const cRe = columns[x] ?? Number.NaN;
        const answeredAnalytically = classifyPeriodFourInto(cRe, cIm, sample);
        if (answeredAnalytically) analyticAnswered += 1;
        if (samePixel(old, now)) {
          // An unchanged pixel must lie outside the analytic path's answers.
          if (answeredAnalytically)
            outsideChanged.push(`${corpusCase.id} (${String(x)}, ${String(y)})`);
          continue;
        }
        changed += 1;
        const transition = `${describeWord(old.word)} -> ${describeWord(now.word)}`;
        tally[transition] = (tally[transition] ?? 0) + 1;
        const verdict = adjudicate(cRe, cIm, old, now, sample);
        if (!verdict.supported) unsupported.push(`${corpusCase.id} (${String(x)}, ${String(y)})`);
        maxAnalyticError = Math.max(maxAnalyticError, verdict.analyticError ?? 0);
        maxBeforeError = Math.max(maxBeforeError, verdict.beforeError ?? 0);
        if (!Number.isNaN(verdict.allowance)) {
          maxAllowance = Math.max(maxAllowance, verdict.allowance);
        }
        if (verdict.analyticError !== null && !Number.isNaN(verdict.allowance)) {
          maxErrorToAllowance = Math.max(
            maxErrorToAllowance,
            verdict.analyticError / verdict.allowance,
          );
        }
        caseRows.push([
          x,
          y,
          old.word,
          now.word,
          verdict.analyticError,
          verdict.beforeError,
          verdict.allowance,
        ]);
      }
    }
    transitions[corpusCase.id] = tally;
    colors[corpusCase.id] = colorChanges(before, after, beforeCase, afterCase);
    if (caseRows.length > 0) rows[corpusCase.id] = caseRows;
  }

  const raw = {
    schemaVersion: 1,
    description:
      'Every pixel whose stable-pass output changed at the golden raster (ADR 0013), with its dd adjudication. c is the golden-raster pixel centre of (x, y) for the corpus viewport (createViewportTransform, prepareRealColumns). Aggregates in semantic-comparison.json and summary.md are derived views.',
    raster: after.raster,
    beforeCommit: before.commit,
    afterCommit: after.commit,
    fields: ['x', 'y', 'beforeWord', 'afterWord', 'analyticError', 'beforeError', 'allowance'],
    fieldNotes: {
      beforeWord: 'packed status/period word before (poc-packed-1.0.0)',
      afterWord: 'packed status/period word after',
      analyticError: '|lambda_after - lambda_dd|; null when dd did not certify period 4',
      beforeError: '|lambda_before - lambda_dd| when the pixel was already period 4, else null',
      allowance: 'the certificate allowance A = 64 h + 2^-50 at c (PERFORMANCE-MATHEMATICS 12)',
    },
    statusWords: {
      [String(UNRESOLVED_WORD)]: 'unresolved',
      [String(ATTRACTING_P4_WORD)]: 'attracting-p4',
    },
    unsupported,
    cases: rows,
  };
  const comparison = {
    schemaVersion: 1,
    description:
      'Analytic period-4 path (ADR 0013): every pixel whose stable-pass output changed at the golden raster, adjudicated against the dd period-4 cycle',
    raster: after.raster,
    beforeCommit: before.commit,
    afterCommit: after.commit,
    tolerance: ADJUDICATION_TOLERANCE,
    changedPixels: changed,
    analyticAnsweredPixels: analyticAnswered,
    analyticAnsweredButUnchanged: outsideChanged,
    changedSetEqualsAnalyticSet: outsideChanged.length === 0 && analyticAnswered === changed,
    unsupportedPixels: unsupported.length,
    transitionsByCase: transitions,
    colorChangesByCase: colors,
    unresolvedByCase: unresolved,
    maxAnalyticError,
    maxBeforeError,
    maxAllowance,
    maxErrorToAllowance,
  };
  writeFileSync(path.join(outDir, 'raw-observations.json'), `${JSON.stringify(raw, null, 2)}\n`);
  writeFileSync(
    path.join(outDir, 'semantic-comparison.json'),
    `${JSON.stringify(comparison, null, 2)}\n`,
  );
  printSummary(comparison);
  process.stdout.write(
    `analytic path answered ${String(analyticAnswered)}, changed ${String(changed)}, answered but unchanged ${String(outsideChanged.length)}\n`,
  );
  if (!comparison.changedSetEqualsAnalyticSet) {
    process.stderr.write('changed pixel set differs from the analytic path answer set\n');
    process.exit(1);
  }
  if (unsupported.length > 0) process.exit(1);
};

main();
