import type { SemanticView } from '../domain';
import { unpackPeriod, unpackStatus } from './packed-semantic';
import type { SemanticFrame } from './renderer';

/**
 * Allocation-free colorization of a semantic frame. Byte-for-byte the colors
 * of the per-pixel functions in src/domain/semantic.ts (colorForEscaped,
 * colorForAttracting, modulateForMultiplierAngle, colorForUnresolved) plus
 * the unresolved texture, written straight into the RGBA buffer instead of
 * through per-pixel color tuples (tests/unit/render/colorize.test.ts pins the
 * bytes). The period view's color depends on the period alone and is
 * computed once per period.
 */

const clampByte = (value: number): number => Math.max(0, Math.min(255, Math.round(value)));

// Exact replacements for the floating-point remainders of semantic.ts: `%` on
// doubles is an fmod call in V8. Each form below returns exactly what `%`
// returns on the stated range (the subtractions are exact by Sterbenz's lemma,
// v - trunc(v) is exact for every finite v) and falls back to `%` elsewhere.
// Only the sign of a zero result can differ, and every use adds it to a
// nonzero constant.

/** v % 1. */
const fractionOf = (v: number): number => v - Math.trunc(v);

/** v % 360 for v in [0, 1080); `%` otherwise. */
const remainder360 = (v: number): number =>
  v >= 0 && v < 360 ? v : v >= 360 && v < 720 ? v - 360 : v >= 720 && v < 1080 ? v - 720 : v % 360;

/** v % 2 for v in [0, 6); `%` otherwise. */
const remainder2 = (v: number): number =>
  v >= 0 && v < 2 ? v : v >= 2 && v < 4 ? v - 2 : v >= 4 && v < 6 ? v - 4 : v % 2;

/** hslToRgba of semantic.ts, written at rgba[offset..offset+3]. */
const writeHsl = (
  rgba: Uint8ClampedArray,
  offset: number,
  hue: number,
  saturation: number,
  lightness: number,
): void => {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const sector = remainder360(remainder360(hue) + 360) / 60;
  const x = chroma * (1 - Math.abs(remainder2(sector) - 1));
  let r = chroma;
  let g = 0;
  let b = x;
  if (sector < 1) {
    g = x;
    b = 0;
  } else if (sector < 2) {
    r = x;
    g = chroma;
    b = 0;
  } else if (sector < 3) {
    r = 0;
    g = chroma;
  } else if (sector < 4) {
    r = 0;
    g = x;
    b = chroma;
  } else if (sector < 5) {
    r = x;
    b = chroma;
  }
  const shift = lightness - chroma / 2;
  rgba[offset] = clampByte((r + shift) * 255);
  rgba[offset + 1] = clampByte((g + shift) * 255);
  rgba[offset + 2] = clampByte((b + shift) * 255);
  rgba[offset + 3] = 255;
};

const writeGray = (rgba: Uint8ClampedArray, offset: number, value: number): void => {
  rgba[offset] = value;
  rgba[offset + 1] = value;
  rgba[offset + 2] = value;
  rgba[offset + 3] = 255;
};

/** Period-view colors (RGBA packed in one integer), filled on first use. */
const periodColors = new Map<number, number>();
const periodScratch = new Uint8ClampedArray(4);

const periodColor = (period: number): number => {
  let packed = periodColors.get(period);
  if (packed === undefined) {
    writeHsl(periodScratch, 0, (period * 137.508) % 360, 0.72, 0.54);
    packed =
      ((periodScratch[0] ?? 0) << 16) | ((periodScratch[1] ?? 0) << 8) | (periodScratch[2] ?? 0);
    periodColors.set(period, packed);
  }
  return packed;
};

const writeEscaped = (
  rgba: Uint8ClampedArray,
  offset: number,
  smoothIteration: number,
  view: SemanticView,
): void => {
  const band = fractionOf(fractionOf(smoothIteration * 0.037) + 1);
  if (view === 'stability') {
    writeGray(rgba, offset, clampByte(18 + 42 * band));
    return;
  }
  writeHsl(rgba, offset, 210 + 35 * band, 0.55, 0.12 + 0.16 * band);
};

const writeAttracting = (
  rgba: Uint8ClampedArray,
  offset: number,
  period: number,
  multiplierMagnitude: number,
  multiplierAngle: number,
  x: number,
  y: number,
  view: SemanticView,
): void => {
  if (view === 'period') {
    const packed = periodColor(period);
    rgba[offset] = packed >>> 16;
    rgba[offset + 1] = (packed >>> 8) & 255;
    rgba[offset + 2] = packed & 255;
    rgba[offset + 3] = 255;
    return;
  }
  if (view === 'stability') {
    const stabilityExponent = -Math.log(multiplierMagnitude) / period;
    const normalized = Number.isFinite(stabilityExponent) ? 1 - Math.exp(-stabilityExponent) : 1;
    writeGray(rgba, offset, clampByte(35 + 205 * normalized));
    return;
  }
  writeHsl(
    rgba,
    offset,
    remainder360((multiplierAngle / (2 * Math.PI)) * 360 + 360),
    0.72,
    0.3 + 0.35 * (1 - multiplierMagnitude),
  );
  // Oriented lightness stripes (modulateForMultiplierAngle).
  const projection = x * Math.cos(multiplierAngle) + y * Math.sin(multiplierAngle);
  const stripe = Math.sin(projection * 0.45) >= 0 ? 22 : -22;
  rgba[offset] = clampByte((rgba[offset] ?? 0) + stripe);
  rgba[offset + 1] = clampByte((rgba[offset + 1] ?? 0) + stripe);
  rgba[offset + 2] = clampByte((rgba[offset + 2] ?? 0) + stripe);
};

/** Unresolved gray (96) with the checker texture of cell 4 (stable) or the stride. */
const writeUnresolved = (
  rgba: Uint8ClampedArray,
  offset: number,
  x: number,
  y: number,
  stride: number,
): void => {
  const cellSize = stride === 1 ? 4 : stride;
  const alternate = (Math.floor(x / cellSize) + Math.floor(y / cellSize)) % 2 === 0;
  writeGray(rgba, offset, alternate ? 84 : 108);
};

export const colorizeFrame = (
  frame: SemanticFrame,
  view: SemanticView,
): Uint8ClampedArray<ArrayBuffer> => {
  const { width } = frame.size;
  const rgba = new Uint8ClampedArray(width * frame.size.height * 4);
  const stride = frame.sampleStride;
  // Bands partition the raster rows exactly, so iterating bands in order
  // covers every pixel once.
  for (const band of frame.bands) {
    const { packedStatusPeriod, smoothIterationOrMultiplierMagnitude, multiplierAngle } = band;
    const count = packedStatusPeriod.length;
    let x = 0;
    let y = band.y0;
    for (let index = 0; index < count; index += 1) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- index < count = length
      const word = packedStatusPeriod[index]!;
      const status = unpackStatus(word);
      const offset = (y * width + x) * 4;
      if (status === 1) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- same length as the band
        writeEscaped(rgba, offset, smoothIterationOrMultiplierMagnitude[index]!, view);
      } else if (status === 2) {
        writeAttracting(
          rgba,
          offset,
          unpackPeriod(word),
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- same length as the band
          smoothIterationOrMultiplierMagnitude[index]!,
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- same length as the band
          multiplierAngle[index]!,
          x,
          y,
          view,
        );
      } else {
        writeUnresolved(rgba, offset, x, y, stride);
      }
      x += 1;
      if (x === width) {
        x = 0;
        y += 1;
      }
    }
  }
  return rgba;
};
