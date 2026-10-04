import type { SemanticFrame } from './renderer';

export interface RowBand {
  readonly y0: number;
  readonly y1: number;
}

export interface BandArrays {
  readonly status: Uint8Array;
  readonly period: Uint32Array;
  readonly smoothIterationOrMultiplierMagnitude: Float64Array;
  readonly multiplierUnitRe: Float32Array;
  readonly multiplierUnitIm: Float32Array;
}

/** Remainder-front exclusive [y0, y1) covering [0, height). Stride-1 only. */
export function splitRowBands(height: number, bandCount: number): readonly RowBand[] {
  if (height < 1 || bandCount < 1) throw new RangeError('height and bandCount must be >= 1');
  const count = Math.min(bandCount, height);
  const base = Math.floor(height / count);
  let remainder = height % count;
  let y = 0;
  const bands: RowBand[] = [];
  for (let i = 0; i < count; i += 1) {
    const extra = remainder > 0 ? 1 : 0;
    if (remainder > 0) remainder -= 1;
    const y1 = y + base + extra;
    bands.push({ y0: y, y1 });
    y = y1;
  }
  return bands;
}

/** Merge a band's semantic channels into a full-raster frame at y0 * width. */
export function copyBandIntoFrame(
  frame: Pick<
    SemanticFrame,
    | 'status'
    | 'period'
    | 'smoothIterationOrMultiplierMagnitude'
    | 'multiplierUnitRe'
    | 'multiplierUnitIm'
    | 'size'
  >,
  band: BandArrays & RowBand,
): void {
  const offset = band.y0 * frame.size.width;
  frame.status.set(band.status, offset);
  frame.period.set(band.period, offset);
  frame.smoothIterationOrMultiplierMagnitude.set(band.smoothIterationOrMultiplierMagnitude, offset);
  frame.multiplierUnitRe.set(band.multiplierUnitRe, offset);
  frame.multiplierUnitIm.set(band.multiplierUnitIm, offset);
}

/** Conjugation preserves all scalar channels and negates multiplier direction's im. */
export function copyConjugateRow(
  arrays: BandArrays,
  source: number,
  target: number,
  width: number,
): void {
  arrays.status.set(arrays.status.subarray(source, source + width), target);
  arrays.period.set(arrays.period.subarray(source, source + width), target);
  arrays.smoothIterationOrMultiplierMagnitude.set(
    arrays.smoothIterationOrMultiplierMagnitude.subarray(source, source + width),
    target,
  );
  arrays.multiplierUnitRe.set(arrays.multiplierUnitRe.subarray(source, source + width), target);
  for (let x = 0; x < width; x += 1) {
    const im = arrays.multiplierUnitIm[source + x] ?? 0;
    arrays.multiplierUnitIm[target + x] = im === 0 ? 0 : -im;
  }
}
