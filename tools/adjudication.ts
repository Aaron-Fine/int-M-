/**
 * The shared part of the analytic-path adjudicators
 * (tools/adjudicate_period_three.ts, tools/adjudicate_period_four.ts; ADR 0007
 * intended-change rule). Each compares two pixel dumps of one raster
 * (tools/kernel_pixel_dump.ts), before and after a change, and checks every
 * changed pixel against a dd oracle. This module validates the dumps, walks
 * every corpus case the after dump holds pixel by pixel, tallies the
 * transitions and colour changes, and writes the two evidence files; each
 * tool supplies its analytic path, its verdict and its output records.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createOrbitSample, createViewportTransform, type OrbitSample } from '../src/domain';
import { prepareRealColumns, preparedRowImaginary } from '../src/render/classify-rows';
import { colorizeFrame } from '../src/render/colorize';
import type { SemanticFrame } from '../src/render/renderer';
import { PACK_PERIOD_BITS, PACK_PERIOD_MAX } from '../src/render/packed-semantic';
import { loadCorpusCases } from './benchmark/judge/corpus';
import type { PixelDump, PixelDumpCase } from './kernel_pixel_dump';

export const UNRESOLVED_WORD = 3 << PACK_PERIOD_BITS;

/** The packed word of an attracting cycle of this period. */
export const attractingWord = (period: number): number => (2 << PACK_PERIOD_BITS) | period;

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
export const distance = (m1: number, a1: number, m2: number, a2: number): number =>
  Math.hypot(m1 * Math.cos(a1) - m2 * Math.cos(a2), m1 * Math.sin(a1) - m2 * Math.sin(a2));

export interface Pixel {
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

/** What every verdict reports; a tool may add fields. */
export interface Verdict {
  readonly analyticError: number | null;
  readonly beforeError: number | null;
  readonly supported: boolean;
}

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

export type ColorChanges = Record<string, { statusChanged: number; multiplierOnly: number }>;

/**
 * Pixels whose colorized RGBA differs between the dumps, per semantic view,
 * split into status changes and multiplier-only changes.
 */
const colorChanges = (
  before: PixelDump,
  after: PixelDump,
  beforeCase: PixelDumpCase,
  afterCase: PixelDumpCase,
): ColorChanges => {
  const result: ColorChanges = {};
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

/** The command line: two dumps and an output directory, or the usage line and exit 2. */
export const parseArguments = (
  script: string,
): { beforePath: string; afterPath: string; outDir: string } => {
  const [beforePath, afterPath, outDir] = process.argv.slice(2);
  if (beforePath === undefined || afterPath === undefined || outDir === undefined) {
    process.stderr.write(`usage: npm run ${script} -- <before.json> <after.json> <out-dir>\n`);
    process.exit(2);
  }
  return { beforePath, afterPath, outDir };
};

export interface ChangedPixel<V extends Verdict> {
  readonly x: number;
  readonly y: number;
  readonly before: Pixel;
  readonly after: Pixel;
  readonly verdict: V;
}

export interface CaseAdjudication<V extends Verdict> {
  readonly beforeCase: PixelDumpCase;
  readonly afterCase: PixelDumpCase;
  readonly changed: readonly ChangedPixel<V>[];
  readonly transitions: Record<string, number>;
  readonly colors: ColorChanges;
}

export interface Adjudication<V extends Verdict> {
  readonly before: PixelDump;
  readonly after: PixelDump;
  /** By case id, in corpus order. */
  readonly cases: ReadonlyMap<string, CaseAdjudication<V>>;
  readonly changedPixels: number;
  readonly analyticAnsweredPixels: number;
  /** Pixels the analytic path answers whose output did not change. */
  readonly analyticAnsweredButUnchanged: readonly string[];
  readonly unsupported: readonly string[];
  readonly maxAnalyticError: number;
  readonly maxBeforeError: number;
}

/**
 * Reads and validates the dumps, then adjudicates every changed pixel of every
 * corpus case the after dump holds (all of them at the golden raster; a subset
 * for a deep-view check at the shipping raster). `answers` is the analytic
 * path; every changed pixel must be one it answers, and every pixel it
 * answers must have changed.
 */
export const adjudicateDumps = <V extends Verdict>(
  beforePath: string,
  afterPath: string,
  answers: (cRe: number, cIm: number, sample: OrbitSample) => boolean,
  adjudicate: (cRe: number, cIm: number, before: Pixel, after: Pixel, sample: OrbitSample) => V,
): Adjudication<V> => {
  const before = JSON.parse(readFileSync(path.resolve(beforePath), 'utf8')) as PixelDump;
  const after = JSON.parse(readFileSync(path.resolve(afterPath), 'utf8')) as PixelDump;
  const { width, height } = after.raster;
  const corpus = loadCorpusCases();
  validateDumps(
    before,
    after,
    corpus.map((corpusCase) => corpusCase.id),
  );
  const sample = createOrbitSample();
  const cases = new Map<string, CaseAdjudication<V>>();
  const unsupported: string[] = [];
  const answeredButUnchanged: string[] = [];
  let changedPixels = 0;
  let analyticAnswered = 0;
  let maxAnalyticError = 0;
  let maxBeforeError = 0;

  const adjudicated = corpus.filter((candidate) => after.cases[candidate.id] !== undefined);
  if (adjudicated.length === 0) throw new Error('no corpus case was adjudicated');
  for (const corpusCase of adjudicated) {
    const beforeCase = before.cases[corpusCase.id];
    const afterCase = after.cases[corpusCase.id];
    if (beforeCase === undefined || afterCase === undefined) {
      throw new Error(`dump lacks ${corpusCase.id}`);
    }
    const transform = createViewportTransform(corpusCase.viewport, after.raster);
    const columns = new Float64Array(width);
    prepareRealColumns(transform, width, 1, columns);
    const changed: ChangedPixel<V>[] = [];
    const transitions: Record<string, number> = {};
    for (let y = 0; y < height; y += 1) {
      const cIm = preparedRowImaginary(transform, height, 1, y);
      for (let x = 0; x < width; x += 1) {
        const offset = y * width + x;
        const old = pixelAt(beforeCase, offset);
        const now = pixelAt(afterCase, offset);
        const cRe = columns[x] ?? Number.NaN;
        const answeredAnalytically = answers(cRe, cIm, sample);
        if (answeredAnalytically) analyticAnswered += 1;
        if (samePixel(old, now)) {
          // An unchanged pixel must lie outside the analytic path's answers.
          if (answeredAnalytically)
            answeredButUnchanged.push(`${corpusCase.id} (${String(x)}, ${String(y)})`);
          continue;
        }
        changedPixels += 1;
        const transition = `${describeWord(old.word)} -> ${describeWord(now.word)}`;
        transitions[transition] = (transitions[transition] ?? 0) + 1;
        const verdict = adjudicate(cRe, cIm, old, now, sample);
        if (!verdict.supported) unsupported.push(`${corpusCase.id} (${String(x)}, ${String(y)})`);
        maxAnalyticError = Math.max(maxAnalyticError, verdict.analyticError ?? 0);
        maxBeforeError = Math.max(maxBeforeError, verdict.beforeError ?? 0);
        changed.push({ x, y, before: old, after: now, verdict });
      }
    }
    cases.set(corpusCase.id, {
      beforeCase,
      afterCase,
      changed,
      transitions,
      colors: colorChanges(before, after, beforeCase, afterCase),
    });
  }
  return {
    before,
    after,
    cases,
    changedPixels,
    analyticAnsweredPixels: analyticAnswered,
    analyticAnsweredButUnchanged: answeredButUnchanged,
    unsupported,
    maxAnalyticError,
    maxBeforeError,
  };
};

/** The transition and colour-change tables summary.md quotes. */
export const printTables = (adjudication: Adjudication<Verdict>): void => {
  process.stdout.write('| Case | Transition | Pixels |\n| --- | --- | ---: |\n');
  for (const [caseId, { transitions }] of adjudication.cases) {
    for (const [transition, count] of Object.entries(transitions)) {
      process.stdout.write(`| ${caseId} | ${transition} | ${String(count)} |\n`);
    }
  }
  process.stdout.write(
    '\n| Case | View | Colour changed: status | Colour changed: multiplier only |\n',
  );
  process.stdout.write('| --- | --- | ---: | ---: |\n');
  for (const [caseId, { colors }] of adjudication.cases) {
    for (const [view, counts] of Object.entries(colors)) {
      if (counts.statusChanged + counts.multiplierOnly === 0) continue;
      process.stdout.write(
        `| ${caseId} | ${view} | ${String(counts.statusChanged)} | ${String(counts.multiplierOnly)} |\n`,
      );
    }
  }
};

/** Whether the changed pixels are exactly the ones the analytic path answers. */
export const changedSetEqualsAnalyticSet = (adjudication: Adjudication<Verdict>): boolean =>
  adjudication.analyticAnsweredButUnchanged.length === 0 &&
  adjudication.analyticAnsweredPixels === adjudication.changedPixels;

/**
 * Writes raw-observations.json and semantic-comparison.json into outDir, runs
 * the tool's summary, and exits 1 if the changed set differs from the analytic
 * set or any changed pixel is unsupported.
 */
export const finish = (
  adjudication: Adjudication<Verdict>,
  outDir: string,
  raw: object,
  comparison: object,
  printSummary: () => void,
): void => {
  mkdirSync(path.resolve(outDir), { recursive: true });
  writeFileSync(path.join(outDir, 'raw-observations.json'), `${JSON.stringify(raw, null, 2)}\n`);
  writeFileSync(
    path.join(outDir, 'semantic-comparison.json'),
    `${JSON.stringify(comparison, null, 2)}\n`,
  );
  printSummary();
  process.stdout.write(
    `analytic path answered ${String(adjudication.analyticAnsweredPixels)}, changed ${String(adjudication.changedPixels)}, answered but unchanged ${String(adjudication.analyticAnsweredButUnchanged.length)}\n`,
  );
  if (!changedSetEqualsAnalyticSet(adjudication)) {
    process.stderr.write('changed pixel set differs from the analytic path answer set\n');
    process.exit(1);
  }
  if (adjudication.unsupported.length > 0) process.exit(1);
};
