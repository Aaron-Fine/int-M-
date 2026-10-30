import { hyperbolicSizeEstimate } from '../domain/child-component';
import { MAX_VIEWPORT_SPAN_Y, MIN_VIEWPORT_SPAN_Y } from '../domain/viewport';
import type { CatalogComponent } from './schema';

/**
 * Catalog order, grouping and zoom framing (PHASE2-TODO item 6, ADR 0012).
 * Pure functions of the entries, so they serve both the curated eleven and
 * the merged 4,016-entry catalog.
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
 * Size estimate of a catalog component (Heiland-Allen, "Mandelbrot set
 * component size estimates"): hyperbolicSizeEstimate of its centre and
 * period. About a bulb's diameter (0.5 for the period-2 disk) and 1 for the
 * main cardioid; a component and its conjugate get identical sizes.
 */
export const componentSizeEstimate = (component: CatalogComponent): number =>
  hyperbolicSizeEstimate(component.center, component.period);

/** A component fills about 40% of the view height when activated from the list. */
export const ZOOM_SPAN_PER_SIZE = 2.5;

/**
 * The view height (spanY) that frames a component of size estimate `size`:
 * 2.5 times it, within the zoom range, so never past the 6,000,000× ceiling
 * (ADR 0002).
 */
export const zoomSpanForSize = (size: number): number =>
  Math.min(MAX_VIEWPORT_SPAN_Y, Math.max(MIN_VIEWPORT_SPAN_Y, ZOOM_SPAN_PER_SIZE * size));

/** The view height that frames a catalog component; the main cardioid gets 2.5, the default view's. */
export const zoomSpanFor = (component: CatalogComponent): number =>
  zoomSpanForSize(componentSizeEstimate(component));

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
