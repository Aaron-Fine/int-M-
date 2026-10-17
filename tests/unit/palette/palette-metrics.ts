/**
 * Palette acceptance metrics (owner decision Q5, MI-UX-021). Each metric is
 * the minimum CIEDE2000 difference between two sets of raster colours, taken
 * over normal vision and simulated protan, deutan and tritan vision
 * (color-science.ts). Floors come from the Phase 1 palette, whose CVD matrix
 * passed reviewer sign-off (evidence/phase-1/cvd-4fd4fdd-2026-08-29.md).
 */
import type { SemanticView } from '../../../src/domain';
import { deltaE, type Rgb, type Vision, VISIONS } from './color-science';

export const METRIC_NAMES = [
  'escaped-vs-unresolved/stability',
  'escaped-vs-unresolved/multiplier',
  'escaped-vs-unresolved/period',
  'unresolved-checker',
  'multiplier-stripes',
  'period-classes-pairwise',
  'period-classes-vs-unresolved',
  'period-classes-vs-escaped',
] as const;

export type MetricName = (typeof METRIC_NAMES)[number];

/** The raster colours a palette can produce, sampled. */
export interface PaletteSpec {
  /** Escaped colours per view over the full band cycle. */
  readonly escaped: Readonly<Record<SemanticView, readonly Rgb[]>>;
  /** The two cells of the unresolved checker texture. */
  readonly unresolvedCells: readonly [Rgb, Rgb];
  /** Multiplier-view colour pairs: light and dark stripe of one sample. */
  readonly multiplierStripePairs: readonly (readonly [Rgb, Rgb])[];
  /** Period-view interior classes (emphasized colours plus the neutral, or Phase 1 p1–p5). */
  readonly periodClasses: readonly Rgb[];
}

export interface MetricResult {
  readonly name: MetricName;
  readonly byVision: Readonly<Record<Vision, number>>;
  readonly min: number;
}

export const ESCAPE_BAND_SAMPLES = 64;
export const MULTIPLIER_ANGLE_STEPS = 72;
export const MULTIPLIER_MAGNITUDE_STEPS = 20;

const minBetween = (first: readonly Rgb[], second: readonly Rgb[], vision: Vision): number => {
  let minimum = Number.POSITIVE_INFINITY;
  for (const a of first) {
    for (const b of second) minimum = Math.min(minimum, deltaE(a, b, vision));
  }
  return minimum;
};

const minPairwise = (colors: readonly Rgb[], vision: Vision): number => {
  let minimum = Number.POSITIVE_INFINITY;
  colors.forEach((a, index) => {
    for (const b of colors.slice(index + 1)) minimum = Math.min(minimum, deltaE(a, b, vision));
  });
  return minimum;
};

const minOfPairs = (pairs: readonly (readonly [Rgb, Rgb])[], vision: Vision): number =>
  pairs.reduce((minimum, [a, b]) => Math.min(minimum, deltaE(a, b, vision)), Infinity);

const metricFunctions = (
  spec: PaletteSpec,
): Readonly<Record<MetricName, (vision: Vision) => number>> => {
  const cells: readonly Rgb[] = spec.unresolvedCells;
  return {
    'escaped-vs-unresolved/stability': (v) => minBetween(spec.escaped.stability, cells, v),
    'escaped-vs-unresolved/multiplier': (v) => minBetween(spec.escaped.multiplier, cells, v),
    'escaped-vs-unresolved/period': (v) => minBetween(spec.escaped.period, cells, v),
    'unresolved-checker': (v) => deltaE(spec.unresolvedCells[0], spec.unresolvedCells[1], v),
    'multiplier-stripes': (v) => minOfPairs(spec.multiplierStripePairs, v),
    'period-classes-pairwise': (v) => minPairwise(spec.periodClasses, v),
    'period-classes-vs-unresolved': (v) => minBetween(spec.periodClasses, cells, v),
    'period-classes-vs-escaped': (v) => minBetween(spec.periodClasses, spec.escaped.period, v),
  };
};

export const measurePalette = (spec: PaletteSpec): readonly MetricResult[] => {
  const functions = metricFunctions(spec);
  return METRIC_NAMES.map((name) => {
    const byVision = Object.fromEntries(
      VISIONS.map((vision) => [vision, functions[name](vision)]),
    ) as Record<Vision, number>;
    return { name, byVision, min: Math.min(...VISIONS.map((vision) => byVision[vision])) };
  });
};

export const metricByName = (results: readonly MetricResult[], name: MetricName): MetricResult => {
  const result = results.find((entry) => entry.name === name);
  if (result === undefined) throw new Error(`metric ${name} missing`);
  return result;
};

// --- Phase 1 palette, frozen (src/domain/semantic.ts at 4fd4fdd) -----------

const clampByte = (value: number): number => Math.max(0, Math.min(255, Math.round(value)));

/** hslToRgba of the Phase 1 semantic.ts, without alpha. */
export const phase1Hsl = (hue: number, saturation: number, lightness: number): Rgb => {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const sector = (((hue % 360) + 360) % 360) / 60;
  const x = chroma * (1 - Math.abs((sector % 2) - 1));
  const [r, g, b] =
    sector < 1
      ? [chroma, x, 0]
      : sector < 2
        ? [x, chroma, 0]
        : sector < 3
          ? [0, chroma, x]
          : sector < 4
            ? [0, x, chroma]
            : sector < 5
              ? [x, 0, chroma]
              : [chroma, 0, x];
  const offset = lightness - chroma / 2;
  return [
    clampByte((r + offset) * 255),
    clampByte((g + offset) * 255),
    clampByte((b + offset) * 255),
  ];
};

const phase1Escaped = (band: number, view: SemanticView): Rgb => {
  if (view === 'stability') {
    const value = clampByte(18 + 42 * band);
    return [value, value, value];
  }
  return phase1Hsl(210 + 35 * band, 0.55, 0.12 + 0.16 * band);
};

const bands = (): readonly number[] =>
  Array.from({ length: ESCAPE_BAND_SAMPLES }, (_, index) => index / ESCAPE_BAND_SAMPLES);

const shift = (color: Rgb, offset: number): Rgb => [
  clampByte(color[0] + offset),
  clampByte(color[1] + offset),
  clampByte(color[2] + offset),
];

const phase1StripePairs = (): readonly (readonly [Rgb, Rgb])[] => {
  const pairs: (readonly [Rgb, Rgb])[] = [];
  for (let step = 0; step < MULTIPLIER_ANGLE_STEPS; step += 1) {
    const hue = (step * 360) / MULTIPLIER_ANGLE_STEPS;
    for (let m = 0; m <= MULTIPLIER_MAGNITUDE_STEPS; m += 1) {
      const magnitude = m / MULTIPLIER_MAGNITUDE_STEPS;
      const base = phase1Hsl(hue, 0.72, 0.3 + 0.35 * (1 - magnitude));
      pairs.push([shift(base, 22), shift(base, -22)]);
    }
  }
  return pairs;
};

/** Phase 1 period view: golden-angle hue per period; p1–p5 are the common classes. */
export const phase1PeriodColor = (period: number): Rgb =>
  phase1Hsl((period * 137.508) % 360, 0.72, 0.54);

/** The Phase 1 palette with a replaceable set of period-view classes. */
export const phase1PaletteSpec = (
  periodClasses: readonly Rgb[] = [1, 2, 3, 4, 5].map(phase1PeriodColor),
): PaletteSpec => ({
  escaped: {
    stability: bands().map((band) => phase1Escaped(band, 'stability')),
    multiplier: bands().map((band) => phase1Escaped(band, 'multiplier')),
    period: bands().map((band) => phase1Escaped(band, 'period')),
  },
  unresolvedCells: [
    [84, 84, 84],
    [108, 108, 108],
  ],
  multiplierStripePairs: phase1StripePairs(),
  periodClasses,
});

/** Parses '#rrggbb'. */
export const hexToRgb = (hex: string): Rgb => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
];
