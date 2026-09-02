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

/**
 * Deterministic center-out dispatch order over row bands (plan §5
 * renderer-path detail): band indices sorted by the distance of the band's
 * row-range midpoint from the raster's vertical center. Ties (a band above
 * and one below the center at equal distance) break toward the lower band
 * index, so the order is a pure function of the band geometry.
 */
export function orderRowBandsCenterOut(
  bands: readonly RowBand[],
  height: number,
): readonly number[] {
  if (height < 1) throw new RangeError('height must be >= 1');
  const center = (height - 1) / 2;
  return bands
    .map((band, index) => ({ index, distance: Math.abs((band.y0 + band.y1 - 1) / 2 - center) }))
    .sort((a, b) => a.distance - b.distance || a.index - b.index)
    .map((entry) => entry.index);
}

/**
 * Dispatch order for the queued stable pass: the first wave (one band per
 * worker) is dispatched center-out so mid-screen rows classify first, and the
 * remaining bands follow in row order. Pairing the measured first-wave-only
 * center-out with row-ordered remainder keeps the time-to-50%-rows win while
 * avoiding the tail cost of deferring expensive periphery bands behind the
 * whole queue (observed on periphery-heavy views such as
 * mi-hard-rabbit-boundary during the M1 paired run).
 */
export function orderRowBandsForDispatch(
  bands: readonly RowBand[],
  height: number,
  waveSize: number,
): readonly number[] {
  if (waveSize < 1) throw new RangeError('waveSize must be >= 1');
  const centerOut = orderRowBandsCenterOut(bands, height);
  const firstWave = centerOut.slice(0, Math.min(waveSize, centerOut.length));
  const remainder = centerOut.slice(firstWave.length).sort((a, b) => a - b);
  return [...firstWave, ...remainder];
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
