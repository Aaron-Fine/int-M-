/**
 * Oracle adjudication of every pixel the analytic period-3 path changed
 * (ADR 0007 intended-change rule; ADR 0010). Compares two pixel dumps of the
 * golden raster (tools/kernel_pixel_dump.ts), before and after the change,
 * and checks every changed pixel against the dd period-3 cycle
 * (tests/unit/domain/dd-oracle.ts ddPeriodThreeCycle: dd Newton and dd
 * certification, no closed form).
 *
 * Usage: npm run evidence:period-three -- <before.json> <after.json> <out-dir>
 * Writes <out-dir>/raw-observations.json and <out-dir>/semantic-comparison.json
 * and prints the summary table. Exits 1 if any changed pixel is unsupported.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  classifyPeriodThreeInto,
  createOrbitSample,
  createViewportTransform,
  type OrbitSample,
} from '../src/domain';
import { prepareRealColumns, preparedRowImaginary } from '../src/render/classify-rows';
import { colorizeFrame } from '../src/render/colorize';
import type { SemanticFrame } from '../src/render/renderer';
import { PACK_PERIOD_BITS, PACK_PERIOD_MAX } from '../src/render/packed-semantic';
import { ddPeriodThreeCycle } from '../tests/unit/domain/dd-oracle';
import { loadCorpusCases } from './benchmark/judge/corpus';
import type { PixelDump, PixelDumpCase } from './kernel_pixel_dump';

/** Complex distance allowed between the analytic and the dd multiplier. */
export const ADJUDICATION_TOLERANCE = 1e-12;

const UNRESOLVED_WORD = 3 << PACK_PERIOD_BITS;
const ATTRACTING_P3_WORD = (2 << PACK_PERIOD_BITS) | 3;
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
  readonly supported: boolean;
}

/**
 * Supported: the new answer is exactly the analytic period-3 record at c,
 * and the dd period-3 cycle certifies period 3 with a multiplier within
 * ADJUDICATION_TOLERANCE of it.
 */
const adjudicate = (
  cRe: number,
  cIm: number,
  before: Pixel,
  after: Pixel,
  sample: OrbitSample,
): Verdict => {
  const matchesAnalytic =
    classifyPeriodThreeInto(cRe, cIm, sample) &&
    after.word === ATTRACTING_P3_WORD &&
    Object.is(sample.multiplierMagnitude, after.magnitude) &&
    Object.is(sample.multiplierAngle, after.angle);
  const oracle = ddPeriodThreeCycle(cRe, cIm);
  if (oracle.status !== 'attracting-cycle' || oracle.cycle.primitive !== 3) {
    return { analyticError: null, beforeError: null, supported: false };
  }
  const { magnitude, angle } = oracle.cycle;
  const analyticError = distance(after.magnitude, after.angle, magnitude, angle);
  const beforeError =
    before.word === ATTRACTING_P3_WORD
      ? distance(before.magnitude, before.angle, magnitude, angle)
      : null;
  return {
    analyticError,
    beforeError,
    supported: matchesAnalytic && analyticError <= ADJUDICATION_TOLERANCE,
  };
};

type Row = [number, number, number, number, number | null, number | null];

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

/** The tables summary.md quotes, from semantic-comparison.json. */
const printSummary = (comparison: {
  readonly transitionsByCase: Record<string, Record<string, number>>;
  readonly colorChangesByCase: Record<string, ReturnType<typeof colorChanges>>;
  readonly changedPixels: number;
  readonly unsupportedPixels: number;
  readonly maxAnalyticError: number;
  readonly maxBeforeError: number;
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
    `\nchanged ${String(comparison.changedPixels)}, unsupported ${String(comparison.unsupportedPixels)}, ` +
      `max analytic error ${comparison.maxAnalyticError.toExponential(2)}, ` +
      `max orbit-product error before ${comparison.maxBeforeError.toExponential(2)}\n`,
  );
};

const parseArguments = (): { beforePath: string; afterPath: string; outDir: string } => {
  const [beforePath, afterPath, outDir] = process.argv.slice(2);
  if (beforePath === undefined || afterPath === undefined || outDir === undefined) {
    process.stderr.write(
      'usage: npm run evidence:period-three -- <before.json> <after.json> <out-dir>\n',
    );
    process.exit(2);
  }
  return { beforePath, afterPath, outDir };
};

const main = (): void => {
  const { beforePath, afterPath, outDir } = parseArguments();
  const before = JSON.parse(readFileSync(path.resolve(beforePath), 'utf8')) as PixelDump;
  const after = JSON.parse(readFileSync(path.resolve(afterPath), 'utf8')) as PixelDump;
  const { width, height } = after.raster;
  const sample = createOrbitSample();
  const rows: Record<string, Row[]> = {};
  const transitions: Record<string, Record<string, number>> = {};
  const colors: Record<string, ReturnType<typeof colorChanges>> = {};
  const unsupported: string[] = [];
  let changed = 0;
  let analyticAnswered = 0;
  const outsideChanged: string[] = [];
  let maxAnalyticError = 0;
  let maxBeforeError = 0;

  for (const corpusCase of loadCorpusCases()) {
    const beforeCase = before.cases[corpusCase.id];
    const afterCase = after.cases[corpusCase.id];
    if (beforeCase === undefined || afterCase === undefined) {
      throw new Error(`dump lacks ${corpusCase.id}`);
    }
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
        const answeredAnalytically = classifyPeriodThreeInto(cRe, cIm, sample);
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
        caseRows.push([x, y, old.word, now.word, verdict.analyticError, verdict.beforeError]);
      }
    }
    transitions[corpusCase.id] = tally;
    colors[corpusCase.id] = colorChanges(before, after, beforeCase, afterCase);
    if (caseRows.length > 0) rows[corpusCase.id] = caseRows;
  }

  const raw = {
    schemaVersion: 1,
    description:
      'Every pixel whose stable-pass output changed at the golden raster (ADR 0010), with its dd adjudication. c is the golden-raster pixel centre of (x, y) for the corpus viewport (createViewportTransform, prepareRealColumns). Aggregates in semantic-comparison.json and summary.md are derived views.',
    raster: after.raster,
    beforeCommit: before.commit,
    afterCommit: after.commit,
    fields: ['x', 'y', 'beforeWord', 'afterWord', 'analyticError', 'beforeError'],
    fieldNotes: {
      beforeWord: 'packed status/period word before (poc-packed-1.0.0)',
      afterWord: 'packed status/period word after',
      analyticError: '|lambda_after - lambda_dd|; null when dd did not certify period 3',
      beforeError: '|lambda_before - lambda_dd| when the pixel was already period 3, else null',
    },
    statusWords: {
      [String(UNRESOLVED_WORD)]: 'unresolved',
      [String(ATTRACTING_P3_WORD)]: 'attracting-p3',
    },
    unsupported,
    cases: rows,
  };
  const comparison = {
    schemaVersion: 1,
    description:
      'Analytic period-3 path (ADR 0010): every pixel whose stable-pass output changed at the golden raster, adjudicated against the dd period-3 cycle',
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
    maxAnalyticError,
    maxBeforeError,
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
