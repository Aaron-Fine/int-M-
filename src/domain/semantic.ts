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

const escapeBand = (smoothIteration: number): number => (((smoothIteration * 0.037) % 1) + 1) % 1;

export const colorForUnresolved = (): Rgba => [96, 96, 96, 255];

export const colorForEscaped = (smoothIteration: number, view: SemanticView): Rgba => {
  const band = escapeBand(smoothIteration);
  if (view === 'stability') {
    const value = clampByte(18 + 42 * band);
    return [value, value, value, 255];
  }
  return hslToRgba(210 + 35 * band, 0.55, 0.12 + 0.16 * band);
};

export const colorForAttracting = (
  period: number,
  multiplierMagnitude: number,
  multiplierAngle: number,
  view: SemanticView,
): Rgba => {
  switch (view) {
    case 'period':
      return hslToRgba((period * 137.508) % 360, 0.72, 0.54);
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
): Rgba => {
  const projection = x * Math.cos(multiplierAngle) + y * Math.sin(multiplierAngle);
  const offset = Math.sin(projection * 0.45) >= 0 ? 22 : -22;
  return [
    clampByte(color[0] + offset),
    clampByte(color[1] + offset),
    clampByte(color[2] + offset),
    color[3],
  ];
};

export const colorForOrbit = (result: OrbitResult, view: SemanticView): Rgba => {
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
  );
};
