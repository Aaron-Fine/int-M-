import type { SemanticFrame } from './renderer';

export interface RowBand {
  readonly y0: number;
  readonly y1: number;
}

export interface BandArrays {
  readonly status: Uint8Array;
  readonly period: Uint32Array;
  readonly smoothIterationOrMultiplierMagnitude: Float64Array;
  readonly multiplierAngle: Float64Array;
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

/** Merge a band's four channels into a full-raster frame at y0 * width. */
export function copyBandIntoFrame(
  frame: Pick<
    SemanticFrame,
    'status' | 'period' | 'smoothIterationOrMultiplierMagnitude' | 'multiplierAngle' | 'size'
  >,
  band: BandArrays & RowBand,
): void {
  const offset = band.y0 * frame.size.width;
  frame.status.set(band.status, offset);
  frame.period.set(band.period, offset);
  frame.smoothIterationOrMultiplierMagnitude.set(band.smoothIterationOrMultiplierMagnitude, offset);
  frame.multiplierAngle.set(band.multiplierAngle, offset);
}
