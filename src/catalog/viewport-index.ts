import type { Viewport } from '../domain/types';
import { compareCatalogOrder, componentSizeEstimate } from './navigation';
import type { CatalogComponent } from './schema';

/**
 * Viewport-indexed catalog lookup (PHASE2-TODO item 6, ADR 0012). Built once
 * at load: one bucket per period, each sorted by Re c. A query walks the
 * periods from the lowest, binary-searches each bucket for the view's Re
 * range and examines only that slab, and stops after the first period that
 * brings the collected entries up to the number asked for. At the default
 * view it examines periods 1 to 6 (53 entries of 4,016), and deep in a zoom
 * it examines a slab a few pixels wide in each period.
 */

export interface ComplexBounds {
  readonly reMin: number;
  readonly reMax: number;
  readonly imMin: number;
  readonly imMax: number;
}

export interface IndexedComponent {
  readonly component: CatalogComponent;
  /** Position in catalog order (period, then lower ray): the focus order. */
  readonly rank: number;
  /** componentSizeEstimate, computed once at load. */
  readonly size: number;
}

export interface CatalogQuery {
  /** The in-view entries found, in catalog order. */
  readonly entries: readonly IndexedComponent[];
  /** How many entries the query examined: the cost measure the tests bound. */
  readonly visited: number;
}

export interface CatalogIndex {
  /** Every entry, in catalog order. */
  readonly entries: readonly IndexedComponent[];
  find(id: string): IndexedComponent | undefined;
  /**
   * The entries inside `bounds` of the lowest periods: whole periods in
   * ascending order, until at least `atLeast` entries are collected or the
   * periods run out.
   */
  lowestPeriodsInView(bounds: ComplexBounds, atLeast: number): CatalogQuery;
}

interface PeriodBucket {
  /** This period's entries sorted by Re c, then rank. */
  readonly byRe: readonly IndexedComponent[];
  readonly re: Float64Array;
}

/** The first index whose value is at least `target`, in ascending `values`. */
const lowerBound = (values: Float64Array, target: number): number => {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if ((values[middle] ?? Number.POSITIVE_INFINITY) < target) low = middle + 1;
    else high = middle;
  }
  return low;
};

const bucketsByPeriod = (entries: readonly IndexedComponent[]): PeriodBucket[] => {
  const byPeriod = new Map<number, IndexedComponent[]>();
  for (const entry of entries) {
    const members = byPeriod.get(entry.component.period);
    if (members === undefined) byPeriod.set(entry.component.period, [entry]);
    else members.push(entry);
  }
  return [...byPeriod.values()].map((members) => {
    const byRe = [...members].sort(
      (left, right) =>
        left.component.center.re - right.component.center.re || left.rank - right.rank,
    );
    return { byRe, re: Float64Array.from(byRe, (entry) => entry.component.center.re) };
  });
};

/** Scans one bucket's Re slab, adding the entries inside `bounds`; returns the count examined. */
const scanSlab = (
  bucket: PeriodBucket,
  bounds: ComplexBounds,
  found: IndexedComponent[],
): number => {
  let visited = 0;
  for (let index = lowerBound(bucket.re, bounds.reMin); index < bucket.byRe.length; index += 1) {
    const entry = bucket.byRe[index];
    if (entry === undefined || entry.component.center.re > bounds.reMax) break;
    visited += 1;
    const im = entry.component.center.im;
    if (im >= bounds.imMin && im <= bounds.imMax) found.push(entry);
  }
  return visited;
};

export const createCatalogIndex = (components: readonly CatalogComponent[]): CatalogIndex => {
  const entries = [...components]
    .sort(compareCatalogOrder)
    .map((component, rank) => ({ component, rank, size: componentSizeEstimate(component) }));
  const byId = new Map(entries.map((entry) => [entry.component.id, entry] as const));
  // Map iteration follows insertion, and entries arrive in ascending period.
  const buckets = bucketsByPeriod(entries);
  return {
    entries,
    find: (id) => byId.get(id),
    lowestPeriodsInView: (bounds, atLeast) => {
      const found: IndexedComponent[] = [];
      let visited = 0;
      for (const bucket of buckets) {
        if (found.length >= atLeast) break;
        visited += scanSlab(bucket, bounds, found);
      }
      found.sort((left, right) => left.rank - right.rank);
      return { entries: found, visited };
    },
  };
};

/**
 * The part of the plane a viewport shows on a width × height canvas, widened
 * by `marginPx` pixels on each side so that nothing a projection places on
 * the canvas edge is missed.
 */
export const viewportBounds = (
  viewport: Viewport,
  width: number,
  height: number,
  marginPx = 1,
): ComplexBounds => {
  const unitsPerPixel = viewport.spanY / height;
  const halfRe = (width / 2 + marginPx) * unitsPerPixel;
  const halfIm = (height / 2 + marginPx) * unitsPerPixel;
  return {
    reMin: viewport.center.re - halfRe,
    reMax: viewport.center.re + halfRe,
    imMin: viewport.center.im - halfIm,
    imMax: viewport.center.im + halfIm,
  };
};
