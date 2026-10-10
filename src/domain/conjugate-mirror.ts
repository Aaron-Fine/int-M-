import { createViewportTransform } from './viewport';
import type { MutableComplex, RasterSize, Viewport } from './types';

/**
 * Conjugate-symmetry row mirroring plan (performance workstream M, EXPERIMENT).
 *
 * The Mandelbrot dynamics commute with complex conjugation (see
 * proof/IntMProof/Symmetry.lean): the classification of conj(c) equals that
 * of c with the multiplier angle negated; status, primitive period,
 * multiplier magnitude and smooth escape iteration are unchanged.
 *
 * A raster row y' may be COPIED from row y only when the parameters of every
 * pixel in row y' are EXACTLY the conjugates of those of row y. The canonical
 * pixel mapping (viewport.ts) is
 *
 *   re(x) = center.re + (x + 0.5 - width / 2) * unitsPerPixel   (row independent)
 *   im(y) = center.im - (y + 0.5 - height / 2) * unitsPerPixel  (column independent)
 *
 * so the real part is shared by both rows and the condition reduces to the
 * binary64 identity `im(y') === -im(y)` on the values the classifier would
 * actually use. This module does not derive that identity algebraically: it
 * evaluates the production transform for every row and matches values
 * exactly. With center.im === 0 the identity holds for y' = height - 1 - y
 * (the factor y + 0.5 - height / 2 is an exact half-integer that negates
 * exactly, and IEEE multiplication and `0 - p` are sign-symmetric). With
 * center.im !== 0 pairs exist only if rounding happens to line up; any row
 * without an exact partner is simply classified directly. Rows are never
 * snapped or perturbed. Given the kernel's sign symmetry under conjugation,
 * status, period, and the magnitude/smooth channels are bit-identical between
 * the mirrored and direct rasters. The angle is the exact negation of the
 * source angle, except that a superattracting identity (magnitude 0) keeps +0.
 * One caveat remains: at an exact binary64 cancellation, x + (-x) = +0 for
 * both signs, so the direct conjugate could keep +0 where the mirror writes
 * -0 (or the sign of pi could differ). The parity tests and fuzz did not
 * observe this, and it does not affect status, period, or magnitude.
 *
 * Of each pair the LOWER raster index is computed and the higher one is
 * mirrored, so every source row is a computed row (no chains). The self-
 * conjugate row (im === 0) is always computed: its conjugate is itself, and
 * negating its angle would be wrong for angle pi.
 */
export interface ConjugateMirrorPlan {
  readonly height: number;
  /** For each raster row, the computed source row to copy from, or -1 if the row is classified directly. */
  readonly sourceRow: Int32Array;
  /** Number of rows with a source (rows that are copied rather than computed). */
  readonly mirroredRows: number;
}

/** The source row for row y, or -1 when y is classified directly. */
export const mirrorSourceOf = (plan: ConjugateMirrorPlan, y: number): number =>
  plan.sourceRow[y] ?? -1;

/**
 * When the computed (source-less) rows are exactly the leading rows [0, R),
 * returns R; otherwise undefined. This always holds for center.im === 0
 * (R = ceil(height / 2)) and is what lets the tile pool schedule bands over
 * the computed rows only (the scheduling design of PR #15 / commit 138a31b).
 */
export const computedPrefixRows = (plan: ConjugateMirrorPlan): number | undefined => {
  let rows = 0;
  while (rows < plan.height && mirrorSourceOf(plan, rows) < 0) rows += 1;
  for (let y = rows; y < plan.height; y += 1) {
    if (mirrorSourceOf(plan, y) < 0) return undefined;
  }
  return rows;
};

/**
 * Builds the mirroring plan for a stride-1 raster, or `undefined` when no row
 * has an exact conjugate partner (the view does not straddle the real axis,
 * or its imaginary sampling is not exactly symmetric).
 */
export const planConjugateMirror = (
  viewport: Viewport,
  size: RasterSize,
): ConjugateMirrorPlan | undefined => {
  const transform = createViewportTransform(viewport, size);
  const { height } = size;
  const imaginary = new Float64Array(height);
  const point: MutableComplex = { re: 0, im: 0 };
  // Rows by exact imaginary value. A Map keyed by number uses SameValueZero,
  // so +0 and -0 collide; that case is the self-conjugate row and is
  // excluded below. Duplicate values (sub-ulp pixel pitch) keep the first row.
  const rowByImaginary = new Map<number, number>();
  for (let y = 0; y < height; y += 1) {
    // The real part is irrelevant to the row identity; column 0 is used only
    // because the transform requires a pixel coordinate.
    transform.pixelToComplexInto(0, y, point);
    imaginary[y] = point.im;
    if (!rowByImaginary.has(point.im)) rowByImaginary.set(point.im, y);
  }

  const sourceRow = new Int32Array(height).fill(-1);
  let mirroredRows = 0;
  for (let y = 0; y < height; y += 1) {
    const im = imaginary[y] ?? 0;
    if (im === 0) continue;
    const partner = rowByImaginary.get(-im);
    // Strict equality of the stored values is the exactness check; the
    // partner must precede y and be computed itself (never a chain).
    if (partner === undefined || partner >= y) continue;
    if (imaginary[partner] !== -im || sourceRow[partner] !== -1) continue;
    sourceRow[y] = partner;
    mirroredRows += 1;
  }
  return mirroredRows === 0 ? undefined : { height, sourceRow, mirroredRows };
};
