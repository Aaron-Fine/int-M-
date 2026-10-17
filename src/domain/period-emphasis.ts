import type { Rgba } from './semantic';

/**
 * Period-view emphasis (PLAN §8, owner decision Q1, MI-UX-018). The period
 * view colours at most PERIOD_EMPHASIS_LIMIT periods: those covering the most
 * pixels of the frame being colorized. They take PERIOD_EMPHASIS_PALETTE in
 * ascending period order, so a period's colour can change between views, and
 * every other period is OTHER_PERIODS_COLOR. The key is a pure function of
 * the frame's period histogram, so a recolor of a cached frame reproduces it
 * and no semantic field is added (the semantic algorithm version is
 * unchanged).
 */

export const PERIOD_EMPHASIS_LIMIT = 5;

/**
 * Okabe and Ito (2008) yellow, sky blue, reddish purple, vermillion and blue,
 * in the order assigned to ascending emphasized periods. Selected against
 * the palette floors in tests/unit/palette (palette-selection.test.ts).
 */
export const PERIOD_EMPHASIS_PALETTE: readonly Rgba[] = [
  [240, 228, 66, 255],
  [86, 180, 233, 255],
  [204, 121, 167, 255],
  [213, 94, 0, 255],
  [0, 114, 178, 255],
];

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

type HistogramEntry = readonly [period: number, pixelCount: number];

/** Most pixels first; equal areas go to the lower period. */
const byAreaThenPeriod = (a: HistogramEntry, b: HistogramEntry): number =>
  b[1] - a[1] || a[0] - b[0];

const sumPixels = (entries: readonly HistogramEntry[]): number =>
  entries.reduce((total, [, pixelCount]) => total + pixelCount, 0);

/**
 * Ranks a frame's period histogram (period -> attracting pixel count): the
 * PERIOD_EMPHASIS_LIMIT largest areas are emphasized and coloured in ascending
 * period order. Periods with a zero or negative count are ignored.
 */
export const buildPeriodKey = (histogram: ReadonlyMap<number, number>): PeriodKey => {
  const ranked = [...histogram.entries()]
    .filter(([, pixelCount]) => pixelCount > 0)
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
