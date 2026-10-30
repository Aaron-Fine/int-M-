import { colorForPeriod, EMPTY_PERIOD_KEY, type PeriodKey } from './period-emphasis';
import type { OrbitResult, SemanticView } from './types';

export type Rgba = readonly [red: number, green: number, blue: number, alpha: number];

const clampByte = (value: number): number => Math.max(0, Math.min(255, Math.round(value)));

const hslToRgba = (hue: number, saturation: number, lightness: number): Rgba => {
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
    255,
  ];
};

/** Escaped shading cycles once every 1 / ESCAPE_BAND_RATE smooth iterations (about 27). */
export const ESCAPE_BAND_RATE = 0.037;

const escapeBand = (smoothIteration: number): number =>
  (((smoothIteration * ESCAPE_BAND_RATE) % 1) + 1) % 1;

export const colorForUnresolved = (): Rgba => [96, 96, 96, 255];

/** The unresolved checker texture offsets the unresolved gray by this in alternate cells. */
export const UNRESOLVED_TEXTURE_OFFSET = 12;

/** The two cells of the unresolved checker texture: [darker, lighter]. */
export const unresolvedTextureColors = (): readonly [Rgba, Rgba] => {
  const [red, green, blue, alpha] = colorForUnresolved();
  const offset = UNRESOLVED_TEXTURE_OFFSET;
  return [
    [red - offset, green - offset, blue - offset, alpha],
    [red + offset, green + offset, blue + offset, alpha],
  ];
};

export const colorForEscaped = (smoothIteration: number, view: SemanticView): Rgba => {
  const band = escapeBand(smoothIteration);
  if (view === 'stability') {
    const value = clampByte(18 + 42 * band);
    return [value, value, value, 255];
  }
  return hslToRgba(210 + 35 * band, 0.55, 0.12 + 0.16 * band);
};

/**
 * Attracting-cycle colour. The period view colours by the frame's period key
 * (period-emphasis.ts); without one every period is the neutral "other".
 */
export const colorForAttracting = (
  period: number,
  multiplierMagnitude: number,
  multiplierAngle: number,
  view: SemanticView,
  periodKey: PeriodKey = EMPTY_PERIOD_KEY,
): Rgba => {
  switch (view) {
    case 'period':
      return colorForPeriod(period, periodKey);
    case 'multiplier':
      return hslToRgba(
        ((multiplierAngle / (2 * Math.PI)) * 360 + 360) % 360,
        0.72,
        0.3 + 0.35 * (1 - multiplierMagnitude),
      );
    case 'stability': {
      const stabilityExponent = -Math.log(multiplierMagnitude) / period;
      const normalized = Number.isFinite(stabilityExponent) ? 1 - Math.exp(-stabilityExponent) : 1;
      const value = clampByte(35 + 205 * normalized);
      return [value, value, value, 255];
    }
  }
};

/**
 * Oriented lightness stripes encode arg λ without relying on hue, so Multiplier
 * view remains readable under protanopia, deuteranopia, and tritanopia.
 */
export const modulateForMultiplierAngle = (
  color: Rgba,
  x: number,
  y: number,
  multiplierAngle: number,
  stripeWeight = 1,
): Rgba => {
  return modulateForMultiplierDirection(
    color,
    x,
    y,
    Math.cos(multiplierAngle),
    Math.sin(multiplierAngle),
    stripeWeight,
  );
};

/** A contour pixel: every channel scaled by MULTIPLIER_CONTOUR_SHADE. */
export const shadeForMultiplierContour = (color: Rgba): Rgba => [
  clampByte(color[0] * MULTIPLIER_CONTOUR_SHADE),
  clampByte(color[1] * MULTIPLIER_CONTOUR_SHADE),
  clampByte(color[2] * MULTIPLIER_CONTOUR_SHADE),
  color[3],
];

/** Spatial frequency of the multiplier stripes: radians of phase per pixel. */
export const MULTIPLIER_STRIPE_FREQUENCY = 0.45;

/** Lightness offset (±) the multiplier stripes add to every channel. */
export const MULTIPLIER_STRIPE_AMPLITUDE = 22;

/**
 * Stripe anti-aliasing. The stripe phase is MULTIPLIER_STRIPE_FREQUENCY times
 * the projection x cos(arg λ) + y sin(arg λ), with each pixel's own angle.
 * Where arg λ turns quickly (near component centres and roots) the phase jumps
 * by more than a stripe per pixel and the stripes alias into moiré. The
 * stripe weight fades them out between these phase steps per pixel (to a
 * same-component neighbour); a constant angle steps at most 0.45 rad, so
 * readable stripes keep their full amplitude.
 */
export const MULTIPLIER_STRIPE_FADE_START = Math.PI / 4;
export const MULTIPLIER_STRIPE_FADE_END = Math.PI / 2;

/** Stripe amplitude weight in [0, 1] for the largest phase step to a neighbour. */
export const multiplierStripeWeight = (phaseStep: number): number =>
  phaseStep <= MULTIPLIER_STRIPE_FADE_START
    ? 1
    : phaseStep >= MULTIPLIER_STRIPE_FADE_END
      ? 0
      : (MULTIPLIER_STRIPE_FADE_END - phaseStep) /
        (MULTIPLIER_STRIPE_FADE_END - MULTIPLIER_STRIPE_FADE_START);

/** Stripe phase of a pixel: the quantity whose sine sets the stripe sign. */
export const multiplierStripePhase = (
  x: number,
  y: number,
  unitRe: number,
  unitIm: number,
): number => (x * unitRe + y * unitIm) * MULTIPLIER_STRIPE_FREQUENCY;

/**
 * Internal-coordinate contours of the multiplier view: rings of constant |λ|
 * and internal rays of constant arg λ at 0, 1/4, 1/3, 1/2, 2/3 and 3/4 of a
 * turn, where child components attach. A pixel lies on a contour when the
 * value crosses a level between it and a neighbour of the same component.
 */
export const MULTIPLIER_CONTOUR_MAGNITUDES: readonly number[] = Object.freeze([0.25, 0.5, 0.75]);
export const MULTIPLIER_CONTOUR_ANGLES: readonly number[] = Object.freeze(
  [0, 1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4].map((turn) => {
    const angle = 2 * Math.PI * turn;
    return angle > Math.PI ? angle - 2 * Math.PI : angle;
  }),
);
/** Contour pixels keep this fraction of each channel. */
export const MULTIPLIER_CONTOUR_SHADE = 0.45;

const wrapAngle = (angle: number): number =>
  angle > Math.PI ? angle - 2 * Math.PI : angle <= -Math.PI ? angle + 2 * Math.PI : angle;

/** Whether a contour level lies between this pixel's multiplier and a neighbour's. */
export const crossesMultiplierContour = (
  magnitude: number,
  angle: number,
  neighbourMagnitude: number,
  neighbourAngle: number,
): boolean => {
  for (const level of MULTIPLIER_CONTOUR_MAGNITUDES) {
    if (magnitude >= level !== neighbourMagnitude >= level) return true;
  }
  for (const level of MULTIPLIER_CONTOUR_ANGLES) {
    const here = wrapAngle(angle - level);
    const there = wrapAngle(neighbourAngle - level);
    // A sign change near the level, not across its opposite branch cut.
    if (here >= 0 !== there >= 0 && Math.abs(here - there) < Math.PI / 2) return true;
  }
  return false;
};

/** Raster form consumes the multiplier direction without an angle round trip. */
export const modulateForMultiplierDirection = (
  color: Rgba,
  x: number,
  y: number,
  unitRe: number,
  unitIm: number,
  stripeWeight = 1,
): Rgba => {
  const projection = x * unitRe + y * unitIm;
  const amplitude =
    stripeWeight === 1 ? MULTIPLIER_STRIPE_AMPLITUDE : MULTIPLIER_STRIPE_AMPLITUDE * stripeWeight;
  const offset = Math.sin(projection * MULTIPLIER_STRIPE_FREQUENCY) >= 0 ? amplitude : -amplitude;
  return [
    clampByte(color[0] + offset),
    clampByte(color[1] + offset),
    clampByte(color[2] + offset),
    color[3],
  ];
};

export const colorForOrbit = (
  result: OrbitResult,
  view: SemanticView,
  periodKey: PeriodKey = EMPTY_PERIOD_KEY,
): Rgba => {
  if (result.status === 'unresolved') {
    return colorForUnresolved();
  }
  if (result.status === 'escaped') {
    return colorForEscaped(result.smoothIteration, view);
  }
  return colorForAttracting(
    result.period,
    result.multiplierMagnitude,
    result.multiplierAngle,
    view,
    periodKey,
  );
};
