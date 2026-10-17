import { MAX_VIEWPORT_SPAN_Y, MIN_VIEWPORT_SPAN_Y } from '../domain/viewport';
import type { CatalogComponent } from './schema';

/**
 * Catalog order, grouping and zoom framing (PHASE2-TODO item 6, ADR 0012).
 * Pure functions of the entries, so they hold for the 4,016-entry core of
 * item 7 as well as for today's eleven.
 */

/** The lower characteristic ray's numerator over 2^p − 1; the main cardioid's root angle is 0. */
export const lowerRayNumerator = (component: CatalogComponent): number =>
  component.characteristicRays?.[0].numerator ?? 0;

/**
 * Catalog order: by period, then by the lower characteristic angle
 * a / (2^p − 1), which is the order of the roots around the set. Exact
 * integers, the ones the id carries (read here from `characteristicRays`),
 * and total: within a period no two components share a lower angle.
 */
export const compareCatalogOrder = (left: CatalogComponent, right: CatalogComponent): number =>
  left.period - right.period || lowerRayNumerator(left) - lowerRayNumerator(right);

/**
 * Size estimate of a hyperbolic component from its period p and centre c
 * (Heiland-Allen, "Mandelbrot set component size estimates"): with
 * z_q = f_c^q(0), l_q = 2^q z_1 ⋯ z_q and b = 1 + Σ 1/l_q over q < p, the size
 * is 1 / |b l_{p−1}²|. It is about a bulb's diameter (0.5 for the period-2
 * disk) and 1 for the main cardioid. Evaluated at (Re c, |Im c|), so a
 * component and its conjugate get identical sizes; 0 if the orbit overflows.
 */
export const componentSizeEstimate = (component: CatalogComponent): number => {
  const cRe = component.center.re;
  const cIm = Math.abs(component.center.im);
  let zRe = 0;
  let zIm = 0;
  let lRe = 1;
  let lIm = 0;
  let bRe = 1;
  let bIm = 0;
  for (let step = 1; step < component.period; step += 1) {
    const nextZRe = zRe * zRe - zIm * zIm + cRe;
    zIm = 2 * zRe * zIm + cIm;
    zRe = nextZRe;
    const nextLRe = 2 * (zRe * lRe - zIm * lIm);
    lIm = 2 * (zRe * lIm + zIm * lRe);
    lRe = nextLRe;
    const norm = lRe * lRe + lIm * lIm;
    bRe += lRe / norm;
    bIm -= lIm / norm;
  }
  const squareRe = lRe * lRe - lIm * lIm;
  const squareIm = 2 * lRe * lIm;
  const size = 1 / Math.hypot(bRe * squareRe - bIm * squareIm, bRe * squareIm + bIm * squareRe);
  return Number.isFinite(size) ? size : 0;
};

/** A component fills about 40% of the view height when activated from the list. */
export const ZOOM_SPAN_PER_SIZE = 2.5;

/**
 * The view height (spanY) that frames a component: 2.5 times its size
 * estimate, within the zoom range, so never past the 6,000,000× ceiling
 * (ADR 0002). The main cardioid gets 2.5, the default view's height.
 */
export const zoomSpanFor = (component: CatalogComponent): number =>
  Math.min(
    MAX_VIEWPORT_SPAN_Y,
    Math.max(MIN_VIEWPORT_SPAN_Y, ZOOM_SPAN_PER_SIZE * componentSizeEstimate(component)),
  );

/** Groups with at most this many entries start expanded in the catalog panel. */
export const GROUP_OPEN_LIMIT = 8;

export interface CatalogGroup {
  readonly period: number;
  /** In catalog order. */
  readonly components: readonly CatalogComponent[];
  readonly openByDefault: boolean;
}

/** One group per period, in ascending period order, each in catalog order. */
export const catalogGroups = (components: readonly CatalogComponent[]): CatalogGroup[] => {
  const byPeriod = new Map<number, CatalogComponent[]>();
  for (const component of [...components].sort(compareCatalogOrder)) {
    const members = byPeriod.get(component.period);
    if (members === undefined) byPeriod.set(component.period, [component]);
    else members.push(component);
  }
  return [...byPeriod].map(([period, members]) => ({
    period,
    components: members,
    openByDefault: members.length <= GROUP_OPEN_LIMIT,
  }));
};
