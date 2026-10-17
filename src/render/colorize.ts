import {
  buildPeriodKey,
  EMPTY_PERIOD_KEY,
  ESCAPE_BAND_RATE,
  OTHER_PERIODS_COLOR,
  unresolvedTextureColors,
  type PeriodKey,
  type Rgba,
  type SemanticView,
} from '../domain';
import { PACK_PERIOD_BITS, PACK_STATUS_CODES, unpackPeriod, unpackStatus } from './packed-semantic';
import type { SemanticFrame } from './renderer';

/**
 * Allocation-free colorization of a semantic frame. Byte-for-byte the colors
 * of the per-pixel functions in src/domain/semantic.ts (colorForEscaped,
 * colorForAttracting, modulateForMultiplierAngle, colorForUnresolved) plus
 * the unresolved texture, written straight into the RGBA buffer instead of
 * through per-pixel color tuples (tests/unit/render/colorize.test.ts pins the
 * bytes). The period view's colors come from the frame's period key
 * (src/domain/period-emphasis.ts), resolved once per frame.
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

/** RGB packed in one integer (0xRRGGBB). */
const packRgb = (color: Rgba): number => (color[0] << 16) | (color[1] << 8) | color[2];

const OTHER_PERIODS_PACKED = packRgb(OTHER_PERIODS_COLOR);

/** Emphasized period -> packed color; every other period is OTHER_PERIODS_PACKED. */
const periodColorLookup = (key: PeriodKey): ReadonlyMap<number, number> =>
  new Map(key.emphasized.map((entry) => [entry.period, packRgb(entry.color)]));

/**
 * Attracting-cycle pixel count per period. Runs of equal period are counted
 * before touching the map, since periods repeat along rows.
 */
export const periodHistogram = (frame: SemanticFrame): Map<number, number> => {
  const counts = new Map<number, number>();
  const attracting = PACK_STATUS_CODES.attracting;
  let runPeriod = -1;
  let runLength = 0;
  for (const band of frame.bands) {
    for (const word of band.packedStatusPeriod) {
      const period = word >>> PACK_PERIOD_BITS === attracting ? unpackPeriod(word) : -1;
      if (period === runPeriod) {
        runLength += 1;
        continue;
      }
      if (runPeriod >= 0) counts.set(runPeriod, (counts.get(runPeriod) ?? 0) + runLength);
      runPeriod = period;
      runLength = 1;
    }
  }
  if (runPeriod >= 0) counts.set(runPeriod, (counts.get(runPeriod) ?? 0) + runLength);
  return counts;
};

const writeEscaped = (
  rgba: Uint8ClampedArray,
  offset: number,
  smoothIteration: number,
  view: SemanticView,
): void => {
  const band = fractionOf(fractionOf(smoothIteration * ESCAPE_BAND_RATE) + 1);
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
  periodColors: ReadonlyMap<number, number>,
): void => {
  if (view === 'period') {
    const packed = periodColors.get(period) ?? OTHER_PERIODS_PACKED;
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

const [UNRESOLVED_DARK_COLOR, UNRESOLVED_LIGHT_COLOR] = unresolvedTextureColors();
const UNRESOLVED_DARK = UNRESOLVED_DARK_COLOR[0];
const UNRESOLVED_LIGHT = UNRESOLVED_LIGHT_COLOR[0];

/** Unresolved gray with the checker texture of cell 4 (stable) or the stride. */
const writeUnresolved = (
  rgba: Uint8ClampedArray,
  offset: number,
  x: number,
  y: number,
  stride: number,
): void => {
  const cellSize = stride === 1 ? 4 : stride;
  const alternate = (Math.floor(x / cellSize) + Math.floor(y / cellSize)) % 2 === 0;
  writeGray(rgba, offset, alternate ? UNRESOLVED_DARK : UNRESOLVED_LIGHT);
};

/**
 * Colorizes `frame` in `view`. The period view draws with `periodKey`, which
 * defaults to the frame's own ranking; pass the key you report so the legend
 * and the raster cannot disagree.
 */
export const colorizeFrame = (
  frame: SemanticFrame,
  view: SemanticView,
  periodKey: PeriodKey = view === 'period'
    ? buildPeriodKey(periodHistogram(frame))
    : EMPTY_PERIOD_KEY,
): Uint8ClampedArray<ArrayBuffer> => {
  const { width } = frame.size;
  const rgba = new Uint8ClampedArray(width * frame.size.height * 4);
  const stride = frame.sampleStride;
  const periodColors = periodColorLookup(periodKey);
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
          periodColors,
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
