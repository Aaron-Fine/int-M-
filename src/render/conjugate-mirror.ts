import { mirrorSourceOf, type ConjugateMirrorPlan } from '../domain';
import { unpackStatus } from './packed-semantic';
import type { SemanticBand } from './renderer';

/**
 * Fills the mirrored rows of a stride-1 semantic frame from their computed
 * source rows (performance workstream M, EXPERIMENT; see
 * src/domain/conjugate-mirror.ts for the exactness argument).
 *
 * Race-freedom: this runs on a single thread AFTER every band's classifier
 * has returned and its buffers are owned by the caller (in the tile pool,
 * after the last tile-result; zero-copy views are re-owned by the supervisor
 * on arrival). Tile workers never write a mirrored row and never read another
 * row, so source and destination rows may live in different bands/workers
 * without any shared mutable state during classification.
 *
 * Field handling: status/period (packed word) and the smooth-iteration-or-
 * multiplier-magnitude channel are conjugation-invariant and copied as is.
 * The multiplier angle is negated only for an attracting pixel with a nonzero
 * multiplier magnitude. Every other pixel is written as +0: non-attracting
 * pixels and the superattracting identity (magnitude 0) carry +0 in the direct
 * path, and negating that would produce -0.
 */
export const applyConjugateMirror = (
  plan: ConjugateMirrorPlan,
  bands: readonly SemanticBand[],
  width: number,
): void => {
  const bandIndexOfRow = new Int32Array(plan.height).fill(-1);
  bands.forEach((band, index) => {
    for (let y = band.y0; y < band.y1; y += 1) bandIndexOfRow[y] = index;
  });

  for (let y = 0; y < plan.height; y += 1) {
    const sourceY = mirrorSourceOf(plan, y);
    if (sourceY < 0) continue;
    const destination = bands[bandIndexOfRow[y] ?? -1];
    const source = bands[bandIndexOfRow[sourceY] ?? -1];
    if (destination === undefined || source === undefined) {
      throw new RangeError(`bands do not cover mirrored row ${y} and its source ${sourceY}`);
    }
    const from = (sourceY - source.y0) * width;
    const to = (y - destination.y0) * width;
    destination.packedStatusPeriod.set(source.packedStatusPeriod.subarray(from, from + width), to);
    destination.smoothIterationOrMultiplierMagnitude.set(
      source.smoothIterationOrMultiplierMagnitude.subarray(from, from + width),
      to,
    );
    for (let x = 0; x < width; x += 1) {
      const index = from + x;
      const attracting = unpackStatus(source.packedStatusPeriod[index] ?? 0) === 2;
      const magnitude = source.smoothIterationOrMultiplierMagnitude[index] ?? 0;
      destination.multiplierAngle[to + x] =
        attracting && magnitude !== 0 ? -(source.multiplierAngle[index] ?? 0) : 0;
    }
  }
};
