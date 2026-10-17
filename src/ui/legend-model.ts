import {
  colorForAttracting,
  colorForEscaped,
  ESCAPE_BAND_RATE,
  modulateForMultiplierDirection,
  MULTIPLIER_STRIPE_AMPLITUDE,
  MULTIPLIER_STRIPE_FREQUENCY,
  OTHER_PERIODS_COLOR,
  unresolvedTextureColors,
  type PeriodKey,
  type Rgba,
  type SemanticView,
} from '../domain';

/**
 * The semantic legend as data (MI-UX-010, MI-UX-018, MI-UX-021). Every swatch
 * and scale colour is computed from the src/domain palette functions the
 * colorizer uses, so the legend cannot drift from the raster.
 */

export interface LegendTick {
  /** 0 (left end) to 1 (right end) along the scale bar. */
  readonly position: number;
  readonly label: string;
}

/**
 * One multiplier stripe sample: the light/dark pair the raster draws at one
 * arg λ, laid out at the raster's pitch and orientation.
 */
export interface LegendStripeSample {
  readonly label: string;
  /** arg λ in radians. */
  readonly argLambda: number;
  /** CSS angle of the gradient line, in degrees. */
  readonly angleDeg: number;
  /** Width of one light or dark band, in CSS pixels. */
  readonly pitch: number;
  readonly light: string;
  readonly dark: string;
  /** CSS background: a repeating light/dark gradient. */
  readonly background: string;
}

export interface LegendScale {
  readonly kind: 'scale';
  readonly label: string;
  readonly detail: string;
  /** CSS background of the bar. */
  readonly background: string;
  readonly ticks: readonly LegendTick[];
  /** Stripe samples drawn beside the bar (multiplier angle only). */
  readonly stripes?: readonly LegendStripeSample[];
}

export interface LegendSwatch {
  readonly kind: 'swatch';
  readonly label: string;
  readonly detail: string;
  /** CSS background of the swatch. */
  readonly background: string;
  readonly border: 'solid' | 'dashed' | 'dotted';
  /** Set on period-key entries: the exact period, or 'other' for the neutral class. */
  readonly period?: number | 'other';
}

export interface LegendNote {
  readonly kind: 'note';
  readonly text: string;
}

export type LegendItem = LegendScale | LegendSwatch | LegendNote;

export interface LegendModel {
  readonly definition: string;
  readonly items: readonly LegendItem[];
}

export const DEFINITIONS: Readonly<Record<SemanticView, string>> = {
  stability: 'Lighter regions settle faster. κ = −ln|λ| / p measures attraction per iteration.',
  multiplier:
    'Hue and oriented stripes show rotation (arg λ); lightness shows attraction strength through |λ|.',
  period:
    'Up to five periods covering the most area in this view get a color, in ascending period order; all other periods share one gray. Colors can change when the view changes or refines, so this key always shows the current mapping.',
};

/** CSS colour of a palette colour (alpha is always 255 in the raster). */
export const cssColor = (color: Rgba): string => `rgb(${color[0]} ${color[1]} ${color[2]})`;

const SCALE_STOPS = 16;

/** A left-to-right CSS gradient sampling `colorAt` at evenly spaced positions. */
const gradient = (colorAt: (position: number) => Rgba): string => {
  const stops = Array.from({ length: SCALE_STOPS + 1 }, (_, index) => {
    const position = index / SCALE_STOPS;
    return `${cssColor(colorAt(position))} ${(position * 100).toFixed(2)}%`;
  });
  return `linear-gradient(90deg, ${stops.join(', ')})`;
};

/** Normalized stability position of κ: the ramp is linear in 1 − e^−κ. */
export const stabilityPosition = (kappa: number): number => 1 - Math.exp(-kappa);

const STABILITY_TICKS: readonly LegendTick[] = [
  { position: stabilityPosition(0), label: '0' },
  { position: stabilityPosition(0.5), label: '0.5' },
  { position: stabilityPosition(1), label: '1' },
  { position: stabilityPosition(2), label: '2' },
  { position: 1, label: '∞' },
];

const stabilityScale = (): LegendScale => ({
  kind: 'scale',
  label: 'Stability κ',
  detail:
    'κ = −ln|λ| / p from 0 (dark, weakly attracting) to ∞ (light, a cycle center); ticks at κ = 0.5, 1, 2',
  // Position n is κ = −ln(1 − n) for period 1, i.e. |λ| = 1 − n.
  background: gradient((position) => colorForAttracting(1, 1 - position, 0, 'stability')),
  ticks: STABILITY_TICKS,
});

const magnitudeScale = (): LegendScale => ({
  kind: 'scale',
  label: 'Attraction |λ|',
  detail: `|λ| from 0 (light, strongly attracting) to 1 (dark, neutral); ticks at |λ| = 0.25, 0.5, 0.75; shown at arg λ = 0; the raster adds ±${MULTIPLIER_STRIPE_AMPLITUDE} lightness stripes to these colours`,
  background: gradient((position) => colorForAttracting(1, position, 0, 'multiplier')),
  ticks: [0, 0.25, 0.5, 0.75, 1].map((position) => ({ position, label: String(position) })),
});

/** Width of one light or dark stripe band: half the period of sin(f·projection). */
const STRIPE_PITCH = Math.PI / MULTIPLIER_STRIPE_FREQUENCY;

const STRIPE_SAMPLE_ANGLES: readonly { readonly label: string; readonly argLambda: number }[] = [
  { label: '−π/2', argLambda: -Math.PI / 2 },
  { label: '0', argLambda: 0 },
  { label: 'π/2', argLambda: Math.PI / 2 },
];

const stripeSample = (label: string, argLambda: number): LegendStripeSample => {
  const base = colorForAttracting(1, 0.5, argLambda, 'multiplier');
  const unitRe = Math.cos(argLambda);
  const unitIm = Math.sin(argLambda);
  // Projections at the centres of a light band (sin > 0) and a dark band (sin < 0).
  const light = cssColor(
    modulateForMultiplierDirection(
      base,
      (STRIPE_PITCH / 2) * unitRe,
      (STRIPE_PITCH / 2) * unitIm,
      unitRe,
      unitIm,
    ),
  );
  const dark = cssColor(
    modulateForMultiplierDirection(
      base,
      ((3 * STRIPE_PITCH) / 2) * unitRe,
      ((3 * STRIPE_PITCH) / 2) * unitIm,
      unitRe,
      unitIm,
    ),
  );
  // The raster's stripe coordinate runs along (cos λ, sin λ) with y down; a CSS
  // gradient at angle a runs along (sin a, −cos a), so a = λ + 90°.
  const angleDeg = (argLambda * 180) / Math.PI + 90;
  const pitch = STRIPE_PITCH;
  const edge = pitch.toFixed(2);
  const end = (2 * pitch).toFixed(2);
  return {
    label,
    argLambda,
    angleDeg,
    pitch,
    light,
    dark,
    background: `repeating-linear-gradient(${angleDeg}deg, ${light} 0 ${edge}px, ${dark} ${edge}px ${end}px)`,
  };
};

const angleScale = (): LegendScale => ({
  kind: 'scale',
  label: 'Multiplier angle',
  detail:
    'Hue represents arg λ from −π to π; lightness stripes turn with arg λ, as in the samples at −π/2, 0 and π/2; ticks at arg λ = −π/2, 0, π/2; shown at |λ| = 0.5',
  background: gradient((position) =>
    colorForAttracting(1, 0.5, Math.PI * (2 * position - 1), 'multiplier'),
  ),
  ticks: [
    { position: 0, label: '−π' },
    { position: 0.25, label: '−π/2' },
    { position: 0.5, label: '0' },
    { position: 0.75, label: 'π/2' },
    { position: 1, label: 'π' },
  ],
  stripes: STRIPE_SAMPLE_ANGLES.map(({ label, argLambda }) => stripeSample(label, argLambda)),
});

/** A share of attracting-cycle pixels, never rounded to 0% or 100% when it is neither. */
export const formatShare = (part: number, whole: number): string => {
  if (whole <= 0 || part <= 0) return '0%';
  const percent = (100 * part) / whole;
  if (percent < 0.1) return '<0.1%';
  if (percent < 10) return `${percent.toFixed(1)}%`;
  if (part < whole && percent >= 99.5) return '>99%';
  return `${Math.round(percent)}%`;
};

const periodItems = (key: PeriodKey | undefined): readonly LegendItem[] => {
  if (key === undefined) return [{ kind: 'note', text: 'Ranking the periods in this view…' }];
  const emphasized = key.emphasized.map((entry): LegendSwatch => ({
    kind: 'swatch',
    label: `Period ${entry.period}`,
    detail: `${formatShare(entry.pixelCount, key.attractingPixelCount)} of attracting-cycle pixels`,
    background: cssColor(entry.color),
    border: 'solid',
    period: entry.period,
  }));
  const count = key.otherPeriodCount;
  const other: LegendSwatch = {
    kind: 'swatch',
    label: 'Other periods',
    detail:
      count === 0
        ? 'None in this view'
        : `${count} more ${count === 1 ? 'period' : 'periods'} · ${formatShare(
            key.otherPixelCount,
            key.attractingPixelCount,
          )} of attracting-cycle pixels`,
    background: cssColor(OTHER_PERIODS_COLOR),
    border: 'solid',
    period: 'other',
  };
  const none: readonly LegendItem[] =
    key.attractingPixelCount === 0
      ? [{ kind: 'note', text: 'No attracting cycle detected in this view.' }]
      : [];
  return [...none, ...emphasized, other];
};

const escapedSwatch = (view: SemanticView): LegendSwatch => ({
  kind: 'swatch',
  label: 'Escaped',
  detail: `Outside the Mandelbrot set; shading repeats every ${Math.round(1 / ESCAPE_BAND_RATE)} escape iterations`,
  background: gradient((band) => colorForEscaped(Math.min(band, 0.999) / ESCAPE_BAND_RATE, view)),
  border: 'dashed',
});

const unresolvedSwatch = (): LegendSwatch => {
  const [dark, light] = unresolvedTextureColors();
  return {
    kind: 'swatch',
    label: 'Unresolved',
    detail: 'No claim at current quality',
    background: `repeating-conic-gradient(${cssColor(dark)} 0 25%, ${cssColor(light)} 0 50%) 0 0 / 0.5rem 0.5rem`,
    border: 'dotted',
  };
};

const viewItems = (view: SemanticView, key: PeriodKey | undefined): readonly LegendItem[] => {
  switch (view) {
    case 'stability':
      return [stabilityScale()];
    case 'multiplier':
      return [magnitudeScale(), angleScale()];
    case 'period':
      return periodItems(key);
  }
};

/**
 * The legend for `view`. In the period view `periodKey` is the key of the
 * frame on screen; before one arrives the key is a pending note.
 */
export const legendModel = (view: SemanticView, periodKey?: PeriodKey): LegendModel => ({
  definition: DEFINITIONS[view],
  items: [...viewItems(view, periodKey), escapedSwatch(view), unresolvedSwatch()],
});
