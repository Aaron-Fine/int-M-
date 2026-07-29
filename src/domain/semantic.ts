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

const escapedColor = (result: Extract<OrbitResult, { status: 'escaped' }>): Rgba => {
  const band = (((result.smoothIteration * 0.037) % 1) + 1) % 1;
  return hslToRgba(210 + 35 * band, 0.55, 0.12 + 0.16 * band);
};

export const colorForOrbit = (result: OrbitResult, view: SemanticView): Rgba => {
  if (result.status === 'unresolved') {
    return [96, 96, 96, 255];
  }
  if (result.status === 'escaped') {
    if (view === 'stability') {
      const band = (((result.smoothIteration * 0.037) % 1) + 1) % 1;
      const value = clampByte(18 + 42 * band);
      return [value, value, value, 255];
    }
    return escapedColor(result);
  }

  switch (view) {
    case 'period':
      return hslToRgba((result.period * 137.508) % 360, 0.72, 0.54);
    case 'multiplier':
      return hslToRgba(
        ((result.multiplierAngle / (2 * Math.PI)) * 360 + 360) % 360,
        0.72,
        0.3 + 0.35 * (1 - result.multiplierMagnitude),
      );
    case 'stability': {
      const normalized = Number.isFinite(result.stabilityExponent)
        ? 1 - Math.exp(-result.stabilityExponent)
        : 1;
      const value = clampByte(35 + 205 * normalized);
      return [value, value, value, 255];
    }
  }
};
