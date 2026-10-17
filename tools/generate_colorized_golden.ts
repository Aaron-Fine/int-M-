/**
 * Colorized-buffer goldens (PHASE2-TODO item 5, owner decision Q6,
 * MI-VER-UX-006): SHA-256 of colorizeFrame's RGBA bytes for every semantic
 * view on the default view and two zoomed views, plus one isolated period, at
 * the kernel golden's raster. These hashes are the image-regression gate; the
 * browser screenshots under tests/visual/ are advisory.
 * Usage: npm run fixtures:colorized-golden [-- --check]
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  buildPeriodKey,
  type RenderQuality,
  type SemanticView,
  type Viewport,
} from '../src/domain';
import type { SemanticFrame } from '../src/render';
import { classifyRows } from '../src/render/classify-rows';
import { colorizeFrame, periodHistogram } from '../src/render/colorize';
import { loadCorpusCases, profileQuality } from './benchmark/judge/corpus';

/**
 * The kernel golden's raster (tools/generate_kernel_golden.ts). Not imported
 * from there: bundled together, that tool's entry guard would run its main.
 */
export const GOLDEN_RASTER = { width: 160, height: 100 } as const;

// Resolved from the repo root (npm runs scripts there), as in generate_kernel_golden.ts.
const FIXTURE = path.resolve(process.cwd(), 'fixtures/colorized-golden.v1.json');

/**
 * Frozen-corpus views: the default full-set view, the 126x period-4
 * neighbourhood (periods 4, 8, 12 and 16 in one frame) and the 2,500x
 * Feigenbaum view (deep periods and the unresolved texture).
 */
export const COLORIZED_GOLDEN_VIEWPORTS = [
  'mi-easy-default-full',
  'mi-hard-supplied-126x',
  'mi-fallback-budget-exhaustion',
] as const;

export const COLORIZED_GOLDEN_SEMANTIC_VIEWS: readonly SemanticView[] = [
  'stability',
  'multiplier',
  'period',
];

/** The isolated-period case: the default view's period view with period 2 isolated. */
export const ISOLATION_CASE = { viewport: 'mi-easy-default-full', period: 2 } as const;

export interface ColorizedGoldenCase {
  readonly id: string;
  readonly corpusCase: string;
  readonly view: SemanticView;
  readonly isolatedPeriod?: number;
}

export interface ColorizedGoldenRecord {
  readonly sha256: string;
  /** Period view only: the emphasized periods, ascending (diagnostic). */
  readonly emphasizedPeriods?: readonly number[];
}

export const colorizedGoldenCases = (): readonly ColorizedGoldenCase[] => [
  ...COLORIZED_GOLDEN_VIEWPORTS.flatMap((corpusCase) =>
    COLORIZED_GOLDEN_SEMANTIC_VIEWS.map((view) => ({
      id: `${corpusCase}/${view}`,
      corpusCase,
      view,
    })),
  ),
  {
    id: `${ISOLATION_CASE.viewport}/period/isolate-${ISOLATION_CASE.period}`,
    corpusCase: ISOLATION_CASE.viewport,
    view: 'period',
    isolatedPeriod: ISOLATION_CASE.period,
  },
];

/** The stable one-band frame of the kernel golden for this viewport. */
export const goldenFrame = async (
  viewport: Viewport,
  quality: RenderQuality,
): Promise<SemanticFrame> => {
  const band = await classifyRows(
    { viewport, size: GOLDEN_RASTER, quality },
    quality,
    1,
    0,
    GOLDEN_RASTER.height,
    new AbortController().signal,
  );
  return { stage: 'stable', size: GOLDEN_RASTER, sampleStride: 1, bands: [band], progress: 1 };
};

export const colorizedRecord = (
  frame: SemanticFrame,
  view: SemanticView,
  isolatedPeriod?: number,
): ColorizedGoldenRecord => {
  const rgba = colorizeFrame(frame, view, undefined, isolatedPeriod);
  const sha256 = createHash('sha256').update(rgba).digest('hex');
  if (view !== 'period') return { sha256 };
  const emphasizedPeriods = buildPeriodKey(periodHistogram(frame)).emphasized.map(
    (entry) => entry.period,
  );
  return { sha256, emphasizedPeriods };
};

export const computeColorizedGoldens = async (): Promise<Record<string, ColorizedGoldenRecord>> => {
  const corpus = new Map(loadCorpusCases().map((corpusCase) => [corpusCase.id, corpusCase]));
  const frames = new Map<string, SemanticFrame>();
  const records: Record<string, ColorizedGoldenRecord> = {};
  for (const goldenCase of colorizedGoldenCases()) {
    const corpusCase = corpus.get(goldenCase.corpusCase);
    if (corpusCase === undefined) throw new Error(`no corpus case ${goldenCase.corpusCase}`);
    let frame = frames.get(corpusCase.id);
    if (frame === undefined) {
      frame = await goldenFrame(corpusCase.viewport, profileQuality(corpusCase.profile));
      frames.set(corpusCase.id, frame);
    }
    records[goldenCase.id] = colorizedRecord(frame, goldenCase.view, goldenCase.isolatedPeriod);
  }
  return records;
};

const main = async (): Promise<void> => {
  const cases = await computeColorizedGoldens();
  const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  const fixture = {
    schemaVersion: 1,
    raster: GOLDEN_RASTER,
    colorizer:
      'colorizeFrame (src/render/colorize.ts): stability and multiplier palettes, five-period Okabe-Ito key with isolation dimming (MI-UX-018, MI-UX-021)',
    generatedFrom: commit,
    cases,
  };
  if (process.argv.includes('--check')) {
    const current = JSON.parse(readFileSync(FIXTURE, 'utf8')) as { cases: unknown };
    if (JSON.stringify(current.cases) !== JSON.stringify(cases)) {
      process.stderr.write('colorized golden fixture is stale\n');
      process.exit(1);
    }
    return;
  }
  writeFileSync(FIXTURE, `${JSON.stringify(fixture, null, 2)}\n`);
};

if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('generate_colorized_golden.js')
) {
  await main();
  // The yield scheduler's MessagePort keeps the event loop alive; exit explicitly as the other tools do.
  process.exit(0);
}
