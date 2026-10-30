/**
 * Production half of the ADR 0015 closure-tolerance evidence. Classifies a
 * deterministic subsample of the deepest frozen-corpus views (shipping raster)
 * and of minibrot tiles at the 6,000,000x zoom bound with production
 * classifyOrbit, and writes each sample's parameter c (binary64, exactly as the
 * renderer computes it), status, period, escape iteration and multiplier.
 * tools/closure_tolerance_compare.py then checks every sample against the
 * independent interval oracle (tools/perturbation_oracle.py).
 *
 * Usage: npm run evidence:closure-tolerance -- <out-dir> [--stride N]
 * Writes <out-dir>/production.json. Node, deterministic; no timing is recorded.
 */
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { classifyOrbit, createViewportTransform, type Viewport } from '../src/domain';
import { loadCorpusCases, profileQuality, SHIPPING_RASTER } from './benchmark/judge/corpus';

/** Corpus cases of the evidence, deepest first (a magnification of 2.5 / spanY). */
export const DEEP_CASES = [
  'mi-scale-6mx-basilica-rim',
  'mi-fallback-unknown-high-period',
  'mi-fallback-budget-exhaustion',
  'mi-hard-supplied-609x',
  'mi-fallback-weak-attraction',
] as const;

export const DEFAULT_STRIDE = 8;

/** The ceiling of ADR 0002: the span at 6,000,000x is 2.5 / 6e6 (about 2^-21.2). */
export const BOUND_SPAN_Y = 2.5 / 6_000_000;

interface MinibrotTile {
  readonly id: string;
  /** 'bound': at the zoom bound; 'control': beyond it, where the ADR records false interiors. */
  readonly role: 'bound' | 'control';
  /** Centre pixel's parameter (binary64) and the pixel pitch, 2^-stepExponent. */
  readonly re: number;
  readonly im: number;
  readonly stepExponent: number;
  readonly size: number;
  readonly profile: 'Balanced' | 'Detailed';
}

/** Minibrot references of tools/perturbation_oracle.py INTERIOR_TILES. */
const P34 = { re: -0.10111537313879465, im: 0.9562964985177921 } as const;
const P61 = { re: 0.0016437219710060931, im: 0.8224676332982375 } as const;
const P25 = { re: -0.10133043579283234, im: 0.9564326741946593 } as const;

/**
 * Minibrot tiles. The 2^-31 pitch is the 6,000,000x bound at an 895 px raster
 * height (2.5 / 6e6 / 2^-31); 2^-26 is the pilot's period-25 tile. The
 * controls are the pilot's tiles beyond the bound (2^-33, 2^-40), where the
 * ADR records false interiors: finding them shows this comparison can.
 */
export const TILES: readonly MinibrotTile[] = [
  {
    id: 'tile-p34-step-2^-31',
    role: 'bound',
    ...P34,
    stepExponent: 31,
    size: 48,
    profile: 'Detailed',
  },
  {
    id: 'tile-p61-step-2^-31',
    role: 'bound',
    ...P61,
    stepExponent: 31,
    size: 48,
    profile: 'Detailed',
  },
  {
    id: 'tile-p25-step-2^-26',
    role: 'bound',
    ...P25,
    stepExponent: 26,
    size: 48,
    profile: 'Detailed',
  },
  {
    id: 'tile-p34-step-2^-31-balanced',
    role: 'bound',
    ...P34,
    stepExponent: 31,
    size: 48,
    profile: 'Balanced',
  },
  {
    id: 'control-p34-step-2^-33',
    role: 'control',
    ...P34,
    stepExponent: 33,
    size: 32,
    profile: 'Detailed',
  },
  {
    id: 'control-p61-step-2^-33',
    role: 'control',
    ...P61,
    stepExponent: 33,
    size: 32,
    profile: 'Detailed',
  },
  {
    id: 'control-p34-step-2^-40',
    role: 'control',
    ...P34,
    stepExponent: 40,
    size: 32,
    profile: 'Detailed',
  },
  {
    id: 'control-p61-step-2^-40',
    role: 'control',
    ...P61,
    stepExponent: 40,
    size: 32,
    profile: 'Detailed',
  },
];

interface Sample {
  readonly x: number;
  readonly y: number;
  readonly re: number;
  readonly im: number;
  readonly status: 'escaped' | 'attracting' | 'unresolved';
  readonly period: number;
  readonly escapeIteration: number;
  readonly iterations: number;
  readonly multiplierMagnitude: number;
}

interface TargetOutput {
  readonly id: string;
  readonly kind: 'corpus-view' | 'minibrot-tile' | 'control-beyond-bound';
  readonly profile: string;
  readonly maxIterations: number;
  readonly maxPeriod: number;
  readonly description: string;
  readonly samples: Sample[];
}

const classify = (
  re: number,
  im: number,
  x: number,
  y: number,
  maxIterations: number,
  maxPeriod: number,
): Sample => {
  const result = classifyOrbit({ re, im }, { maxIterations, maxPeriod });
  if (result.status === 'escaped') {
    return {
      x,
      y,
      re,
      im,
      status: 'escaped',
      period: 0,
      escapeIteration: result.escapeIteration,
      iterations: result.iterations,
      multiplierMagnitude: 0,
    };
  }
  if (result.status === 'attracting-cycle') {
    return {
      x,
      y,
      re,
      im,
      status: 'attracting',
      period: result.period,
      escapeIteration: 0,
      iterations: result.iterations,
      multiplierMagnitude: result.multiplierMagnitude,
    };
  }
  return {
    x,
    y,
    re,
    im,
    status: 'unresolved',
    period: 0,
    escapeIteration: 0,
    iterations: result.iterations,
    multiplierMagnitude: 0,
  };
};

const corpusTarget = (id: string, stride: number): TargetOutput => {
  const corpusCase = loadCorpusCases().find((c) => c.id === id);
  if (corpusCase === undefined) throw new Error(`corpus case ${id} not found`);
  const quality = profileQuality(corpusCase.profile);
  const transform = createViewportTransform(corpusCase.viewport, SHIPPING_RASTER);
  const samples: Sample[] = [];
  const offset = stride / 2;
  for (let y = offset; y < SHIPPING_RASTER.height; y += stride) {
    for (let x = offset; x < SHIPPING_RASTER.width; x += stride) {
      const c = transform.pixelToComplex(x, y);
      samples.push(classify(c.re, c.im, x, y, quality.maxIterations, quality.maxPeriod));
    }
  }
  return {
    id,
    kind: 'corpus-view',
    profile: corpusCase.profile,
    maxIterations: quality.maxIterations,
    maxPeriod: quality.maxPeriod,
    description:
      `${SHIPPING_RASTER.width}x${SHIPPING_RASTER.height}, every ${stride}th pixel in both ` +
      `axes (pixel offset ${offset}); centre ${corpusCase.viewport.center.re}, ` +
      `${corpusCase.viewport.center.im}, spanY ${corpusCase.viewport.spanY}`,
    samples,
  };
};

const tileTarget = (tile: MinibrotTile): TargetOutput => {
  const quality = profileQuality(tile.profile);
  const step = 2 ** -tile.stepExponent;
  const half = tile.size / 2;
  const samples: Sample[] = [];
  for (let y = 0; y < tile.size; y += 1) {
    for (let x = 0; x < tile.size; x += 1) {
      // Exact in binary64: the offsets are small multiples of a power of two.
      const re = tile.re + (x - half) * step;
      const im = tile.im + (half - y) * step;
      samples.push(classify(re, im, x, y, quality.maxIterations, quality.maxPeriod));
    }
  }
  return {
    id: tile.id,
    kind: tile.role === 'bound' ? 'minibrot-tile' : 'control-beyond-bound',
    profile: tile.profile,
    maxIterations: quality.maxIterations,
    maxPeriod: quality.maxPeriod,
    description:
      `${tile.size}x${tile.size} pixels at pitch 2^-${tile.stepExponent}, every pixel; ` +
      `centre pixel (${half}, ${half}) at ${tile.re}, ${tile.im}`,
    samples,
  };
};

const main = (): void => {
  const args = process.argv.slice(2);
  const outDir = args[0];
  if (outDir === undefined || outDir.startsWith('--')) {
    process.stderr.write('usage: npm run evidence:closure-tolerance -- <out-dir> [--stride N]\n');
    process.exit(2);
  }
  const strideIndex = args.indexOf('--stride');
  const stride = strideIndex === -1 ? DEFAULT_STRIDE : Number(args[strideIndex + 1]);
  if (!Number.isInteger(stride) || stride < 1) throw new RangeError('--stride must be positive');
  const viewport = (id: string): Viewport => {
    const found = loadCorpusCases().find((c) => c.id === id);
    if (found === undefined) throw new Error(id);
    return found.viewport;
  };
  const targets = [...DEEP_CASES.map((id) => corpusTarget(id, stride)), ...TILES.map(tileTarget)];
  const commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  const output = {
    schemaVersion: 1,
    commit,
    stride,
    boundSpanY: BOUND_SPAN_Y,
    magnification: Object.fromEntries(
      DEEP_CASES.map((id) => [id, 2.5 / viewport(id).spanY] as const),
    ),
    targets,
  };
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, 'production.json'), `${JSON.stringify(output)}\n`);
  for (const target of targets) {
    const counts: Record<string, number> = {};
    for (const s of target.samples) counts[s.status] = (counts[s.status] ?? 0) + 1;
    process.stdout.write(
      `${target.id}: ${target.samples.length} samples ${JSON.stringify(counts)}\n`,
    );
  }
};

main();
