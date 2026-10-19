/**
 * Oracle adjudication of every pixel the analytic period-4 path changed
 * (ADR 0007 intended-change rule; ADR 0013). Compares two pixel dumps of the
 * golden raster (tools/kernel_pixel_dump.ts), before and after the change,
 * and checks every changed pixel against the dd period-4 cycle
 * (tests/unit/domain/dd-oracle.ts ddPeriodFourCycle: dd Newton and dd
 * certification, no cubic). Also tallies the unresolved pixels of every case
 * before and after (the deep-view check of the 6,000,000x view). It reads the
 * raster from the dumps and adjudicates every corpus case the after dump
 * holds (tools/adjudication.ts).
 *
 * Usage: npm run evidence:period-four -- <before.json> <after.json> <out-dir>
 * Writes <out-dir>/raw-observations.json and <out-dir>/semantic-comparison.json
 * and prints the summary tables. Exits 1 if any changed pixel is unsupported.
 */
import process from 'node:process';
import {
  classifyPeriodFourInto,
  type OrbitSample,
  type PeriodFourCertificate,
} from '../src/domain';
import type { PixelDumpCase } from './kernel_pixel_dump';
import { ddPeriodFourCycle } from '../tests/unit/domain/dd-oracle';
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

/**
 * Complex distance allowed between the analytic and the dd multiplier, on
 * top of the certificate's own allowance (dd rounding and dd Newton error).
 */
export const ADJUDICATION_TOLERANCE = 1e-12;

const ATTRACTING_P4_WORD = attractingWord(4);

interface PeriodFourVerdict extends Verdict {
  readonly allowance: number;
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
): PeriodFourVerdict => {
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

const countUnresolved = (data: PixelDumpCase): number =>
  data.packedStatusPeriod.reduce((count, word) => count + (word === UNRESOLVED_WORD ? 1 : 0), 0);

/** The tables summary.md quotes, from semantic-comparison.json. */
const printSummary = (
  adjudication: Adjudication<PeriodFourVerdict>,
  unresolvedByCase: Record<string, { before: number; after: number }>,
  maxAllowance: number,
  maxErrorToAllowance: number,
): void => {
  printTables(adjudication);
  process.stdout.write(
    '\n| Case | Unresolved before | Unresolved after |\n| --- | ---: | ---: |\n',
  );
  for (const [caseId, counts] of Object.entries(unresolvedByCase)) {
    if (counts.before === counts.after) continue;
    process.stdout.write(`| ${caseId} | ${String(counts.before)} | ${String(counts.after)} |\n`);
  }
  process.stdout.write(
    `\nchanged ${String(adjudication.changedPixels)}, unsupported ${String(adjudication.unsupported.length)}, ` +
      `max analytic error ${adjudication.maxAnalyticError.toExponential(2)}, ` +
      `max allowance ${maxAllowance.toExponential(2)}, ` +
      `max error/allowance ${maxErrorToAllowance.toExponential(2)}, ` +
      `max orbit-product error before ${adjudication.maxBeforeError.toExponential(2)}\n`,
  );
};

const main = (): void => {
  const { beforePath, afterPath, outDir } = parseArguments('evidence:period-four');
  const adjudication = adjudicateDumps(
    beforePath,
    afterPath,
    (cRe, cIm, sample) => classifyPeriodFourInto(cRe, cIm, sample),
    adjudicate,
  );
  const { before, after } = adjudication;
  const rows: Record<string, Row[]> = {};
  const unresolved: Record<string, { before: number; after: number }> = {};
  let maxAllowance = 0;
  let maxErrorToAllowance = 0;
  for (const [caseId, { beforeCase, afterCase, changed }] of adjudication.cases) {
    unresolved[caseId] = {
      before: countUnresolved(beforeCase),
      after: countUnresolved(afterCase),
    };
    for (const { verdict } of changed) {
      if (!Number.isNaN(verdict.allowance)) {
        maxAllowance = Math.max(maxAllowance, verdict.allowance);
      }
      if (verdict.analyticError !== null && !Number.isNaN(verdict.allowance)) {
        maxErrorToAllowance = Math.max(
          maxErrorToAllowance,
          verdict.analyticError / verdict.allowance,
        );
      }
    }
    if (changed.length === 0) continue;
    rows[caseId] = changed.map(({ x, y, before: old, after: now, verdict }) => [
      x,
      y,
      old.word,
      now.word,
      verdict.analyticError,
      verdict.beforeError,
      verdict.allowance,
    ]);
  }
  const cases = [...adjudication.cases];
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
    unsupported: adjudication.unsupported,
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
    changedPixels: adjudication.changedPixels,
    analyticAnsweredPixels: adjudication.analyticAnsweredPixels,
    analyticAnsweredButUnchanged: adjudication.analyticAnsweredButUnchanged,
    changedSetEqualsAnalyticSet: changedSetEqualsAnalyticSet(adjudication),
    unsupportedPixels: adjudication.unsupported.length,
    transitionsByCase: Object.fromEntries(cases.map(([id, c]) => [id, c.transitions])),
    colorChangesByCase: Object.fromEntries(cases.map(([id, c]) => [id, c.colors])),
    unresolvedByCase: unresolved,
    maxAnalyticError: adjudication.maxAnalyticError,
    maxBeforeError: adjudication.maxBeforeError,
    maxAllowance,
    maxErrorToAllowance,
  };
  finish(adjudication, outDir, raw, comparison, () => {
    printSummary(adjudication, unresolved, maxAllowance, maxErrorToAllowance);
  });
};

main();
