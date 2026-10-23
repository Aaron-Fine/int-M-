/**
 * Oracle adjudication of every pixel the analytic period-3 path changed
 * (ADR 0007 intended-change rule; ADR 0010). Compares two pixel dumps of the
 * golden raster (tools/kernel_pixel_dump.ts), before and after the change,
 * and checks every changed pixel against the dd period-3 cycle
 * (tests/unit/domain/dd-oracle.ts ddPeriodThreeCycle: dd Newton and dd
 * certification, no closed form).
 *
 * It reads the raster from the dumps and adjudicates every corpus case the after
 * dump holds (tools/adjudication.ts).
 *
 * Usage: npm run evidence:period-three -- <before.json> <after.json> <out-dir>
 * Writes <out-dir>/raw-observations.json and <out-dir>/semantic-comparison.json
 * and prints the summary table. Exits 1 if any changed pixel is unsupported.
 */
import process from 'node:process';
import { classifyPeriodThreeInto, type OrbitSample } from '../src/domain';
import { ddPeriodThreeCycle } from '../tests/unit/domain/dd-oracle';
import {
  adjudicateDumps,
  attractingWord,
  changedSetEqualsAnalyticSet,
  distance,
  finish,
  parseArguments,
  printTables,
  UNRESOLVED_WORD,
  type Adjudication,
  type Pixel,
  type Verdict,
} from './adjudication';

/** Complex distance allowed between the analytic and the dd multiplier. */
export const ADJUDICATION_TOLERANCE = 1e-12;

const ATTRACTING_P3_WORD = attractingWord(3);

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

/** The tables summary.md quotes, from semantic-comparison.json. */
const printSummary = (adjudication: Adjudication<Verdict>): void => {
  printTables(adjudication);
  process.stdout.write(
    `\nchanged ${String(adjudication.changedPixels)}, unsupported ${String(adjudication.unsupported.length)}, ` +
      `max analytic error ${adjudication.maxAnalyticError.toExponential(2)}, ` +
      `max orbit-product error before ${adjudication.maxBeforeError.toExponential(2)}\n`,
  );
};

const main = (): void => {
  const { beforePath, afterPath, outDir } = parseArguments('evidence:period-three');
  const adjudication = adjudicateDumps(
    beforePath,
    afterPath,
    (cRe, cIm, sample) => classifyPeriodThreeInto(cRe, cIm, sample),
    adjudicate,
  );
  const { before, after } = adjudication;
  const rows: Record<string, Row[]> = {};
  for (const [caseId, { changed }] of adjudication.cases) {
    if (changed.length === 0) continue;
    rows[caseId] = changed.map(({ x, y, before: old, after: now, verdict }) => [
      x,
      y,
      old.word,
      now.word,
      verdict.analyticError,
      verdict.beforeError,
    ]);
  }
  const cases = [...adjudication.cases];
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
    unsupported: adjudication.unsupported,
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
    changedPixels: adjudication.changedPixels,
    analyticAnsweredPixels: adjudication.analyticAnsweredPixels,
    analyticAnsweredButUnchanged: adjudication.analyticAnsweredButUnchanged,
    changedSetEqualsAnalyticSet: changedSetEqualsAnalyticSet(adjudication),
    unsupportedPixels: adjudication.unsupported.length,
    transitionsByCase: Object.fromEntries(cases.map(([id, c]) => [id, c.transitions])),
    colorChangesByCase: Object.fromEntries(cases.map(([id, c]) => [id, c.colors])),
    maxAnalyticError: adjudication.maxAnalyticError,
    maxBeforeError: adjudication.maxBeforeError,
  };
  finish(adjudication, outDir, raw, comparison, () => {
    printSummary(adjudication);
  });
};

main();
