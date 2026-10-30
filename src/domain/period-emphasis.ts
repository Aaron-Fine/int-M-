import type { Rgba } from './semantic';

/**
 * Period-view emphasis (PLAN §8, owner decision Q1, MI-UX-018). The period
 * view colours at most PERIOD_EMPHASIS_LIMIT periods: those covering the most
 * pixels of the frame being colorized. They take PERIOD_EMPHASIS_PALETTE in
 * ascending period order, so a period's colour can change between views, and
 * every other period is OTHER_PERIODS_COLOR. The key is a pure function of
 * the frame's period histogram, so a recolor of a cached frame reproduces it
 * without a semantic field or a SEMANTIC_ALGORITHM_VERSION bump.
 */

export const PERIOD_EMPHASIS_LIMIT = 5;

/**
 * Okabe and Ito (2008) yellow, sky blue, reddish purple, vermillion and blue,
 * in the order assigned to ascending emphasized periods. Selected against
 * the palette floors in tests/unit/palette (palette-selection.test.ts).
 */
export const PERIOD_EMPHASIS_PALETTE: readonly Rgba[] = Object.freeze([
  Object.freeze([240, 228, 66, 255] as const),
  Object.freeze([86, 180, 233, 255] as const),
  Object.freeze([204, 121, 167, 255] as const),
  Object.freeze([213, 94, 0, 255] as const),
  Object.freeze([0, 114, 178, 255] as const),
]);

/** The single neutral for every period that is not emphasized (Paul Tol's grey). */
export const OTHER_PERIODS_COLOR: Rgba = [187, 187, 187, 255];

export interface PeriodKeyEntry {
  readonly period: number;
  readonly color: Rgba;
  /** Attracting-cycle pixels of this period in the frame. */
  readonly pixelCount: number;
}

/** The period-to-colour mapping a period-view raster was drawn with. */
export interface PeriodKey {
  /** Emphasized periods in ascending order, each with its palette colour. */
  readonly emphasized: readonly PeriodKeyEntry[];
  /** Distinct periods drawn in OTHER_PERIODS_COLOR. */
  readonly otherPeriodCount: number;
  /** Pixels drawn in OTHER_PERIODS_COLOR. */
  readonly otherPixelCount: number;
  /** Every attracting-cycle pixel of the frame. */
  readonly attractingPixelCount: number;
}

export const EMPTY_PERIOD_KEY: PeriodKey = Object.freeze({
  emphasized: Object.freeze([]),
  otherPeriodCount: 0,
  otherPixelCount: 0,
  attractingPixelCount: 0,
});

const isPeriodKey = (period: number): boolean => Number.isInteger(period) && period >= 1;

type HistogramEntry = readonly [period: number, pixelCount: number];

/** Most pixels first; equal areas go to the lower period. */
const byAreaThenPeriod = (a: HistogramEntry, b: HistogramEntry): number =>
  b[1] - a[1] || a[0] - b[0];

const sumPixels = (entries: readonly HistogramEntry[]): number =>
  entries.reduce((total, [, pixelCount]) => total + pixelCount, 0);

/**
 * Ranks a frame's period histogram (period -> attracting pixel count): the
 * PERIOD_EMPHASIS_LIMIT largest areas are emphasized and coloured in ascending
 * period order. Keys that are not integers >= 1 (0, negatives, fractions, NaN,
 * infinities) and counts that are not positive are ignored, so they neither
 * take a colour nor count as other periods.
 */
export const buildPeriodKey = (histogram: ReadonlyMap<number, number>): PeriodKey => {
  const ranked = [...histogram.entries()]
    .filter(([period, pixelCount]) => isPeriodKey(period) && pixelCount > 0)
    .sort(byAreaThenPeriod);
  const chosen = ranked.slice(0, PERIOD_EMPHASIS_LIMIT).sort((a, b) => a[0] - b[0]);
  const rest = ranked.slice(PERIOD_EMPHASIS_LIMIT);
  const emphasized = chosen.map(([period, pixelCount], index): PeriodKeyEntry => ({
    period,
    color: PERIOD_EMPHASIS_PALETTE[index] ?? OTHER_PERIODS_COLOR,
    pixelCount,
  }));
  return {
    emphasized,
    otherPeriodCount: rest.length,
    otherPixelCount: sumPixels(rest),
    attractingPixelCount: sumPixels(ranked),
  };
};

/** The colour of an attracting-cycle pixel of `period` under `key`. */
export const colorForPeriod = (period: number, key: PeriodKey): Rgba =>
  key.emphasized.find((entry) => entry.period === period)?.color ?? OTHER_PERIODS_COLOR;

/**
 * Isolating a period from the legend (MI-UX-018) keeps that period's pixels
 * and scales every channel of every other pixel by this factor. 0.12 is the
 * largest step of 0.02 at which the darkest emphasized colour (blue, under
 * simulated deutan vision) keeps 3:1 non-text contrast (WCAG 2.2 SC 1.4.11)
 * against every dimmed raster colour; the 0.18 of the cue experiment gives
 * 2.6:1 (tests/unit/palette/isolation-contrast.test.ts).
 */
export const ISOLATION_DIM_FACTOR = 0.12;

/** One dimmed channel value. */
export const dimChannel = (value: number): number => Math.round(value * ISOLATION_DIM_FACTOR);

/**
 * Previewing a period from the legend (hover or focus, UI review finding 5)
 * outlines its pixels without dimming anything: a ring OUTLINE_RING_WIDTH
 * pixels wide of this colour just outside every region of the period, with a
 * one-pixel halo of OUTLINE_HALO_COLOR outside the ring, so the ring reads on
 * light and dark neighbours alike. Neither colour is a period colour.
 */
export const OUTLINE_RING_COLOR: Rgba = [255, 255, 255, 255];
export const OUTLINE_HALO_COLOR: Rgba = [17, 21, 24, 255];
/** Raster pixels: one pixel is lost against small components at device scale 1. */
export const OUTLINE_RING_WIDTH = 2;

/** A colour as it is drawn around an isolated period. */
export const dimColor = (color: Rgba): Rgba => [
  dimChannel(color[0]),
  dimChannel(color[1]),
  dimChannel(color[2]),
  color[3],
];
