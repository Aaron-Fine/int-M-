import type { Complex } from '../domain/types';
import type { AngledAddressStep, CatalogComponent, RationalAngle } from './schema';
import type { CatalogIndex, IndexedComponent } from './viewport-index';

/**
 * The nesting trail (UI review Proposal C): the angled internal address of
 * the deepest catalog component around the view's centre, one step per
 * ancestor, so the view says where it sits as it zooms.
 *
 * "Around" is geometry from the size estimate s (about a bulb's diameter,
 * componentSizeEstimate). A component's body is the disk of radius s/2 about
 * its centre; the main cardioid's is exact, |1 − √(1 − 4c)| < 1. Its
 * neighbourhood is the disk of radius s, which also holds its first child
 * bulbs and the decorations near it. Only components at least a quarter of
 * the view's height count, so the trail names what the view shows. The
 * centre's component is the deepest whose body holds it; if no body does, the
 * deepest whose neighbourhood does. That is an estimate, not a proof: the
 * trail is a guide for navigation, not a classification.
 */

/** Components smaller than this fraction of the view height are not part of the trail. */
export const NESTING_MIN_SIZE_PER_SPAN = 0.25;

export interface NestingStep {
  /** The period at this step: 1 for the main cardioid. */
  readonly period: number;
  /** The internal angle passed through to reach this step; absent for the main cardioid. */
  readonly rotation?: RationalAngle;
  /** The catalog entry, once it is loaded (the core holds every period up to 12). */
  readonly component?: CatalogComponent;
}

/** True when `point` lies inside the main cardioid: c = μ/2 − μ²/4 with |μ| < 1. */
export const insideMainCardioid = (point: Complex): boolean => {
  // μ = 1 − √(1 − 4c), principal square root.
  const re = 1 - 4 * point.re;
  const im = -4 * point.im;
  const modulus = Math.hypot(re, im);
  const rootRe = Math.sqrt((modulus + re) / 2);
  const rootIm = Math.sign(im) * Math.sqrt((modulus - re) / 2);
  return Math.hypot(1 - rootRe, rootIm) < 1;
};

const distance = (left: Complex, right: Complex): number =>
  Math.hypot(left.re - right.re, left.im - right.im);

const insideBody = (entry: IndexedComponent, point: Complex): boolean =>
  entry.component.period === 1
    ? insideMainCardioid(point)
    : distance(entry.component.center, point) < entry.size / 2;

/** The deepest catalog component around `center` at view height `spanY`, or undefined. */
export const deepestAround = (
  index: CatalogIndex,
  center: Complex,
  spanY: number,
): IndexedComponent | undefined => {
  const minimumSize = NESTING_MIN_SIZE_PER_SPAN * spanY;
  let body: IndexedComponent | undefined;
  let neighbourhood: IndexedComponent | undefined;
  const deeper = (entry: IndexedComponent, than: IndexedComponent | undefined): boolean =>
    than === undefined ||
    entry.size < than.size ||
    (entry.size === than.size && entry.rank < than.rank);
  for (const entry of index.entries) {
    if (entry.size < minimumSize) continue;
    if (insideBody(entry, center)) {
      if (deeper(entry, body)) body = entry;
    } else if (distance(entry.component.center, center) <= entry.size) {
      if (deeper(entry, neighbourhood)) neighbourhood = entry;
    }
  }
  return body ?? neighbourhood;
};

const addressKey = (steps: readonly AngledAddressStep[]): string =>
  steps
    .map((step) => `${step.toPeriod}@${step.rotation.numerator}/${step.rotation.denominator}`)
    .join(' ');

export interface NestingLookup {
  /** Root first: the main cardioid, then each ancestor, then the deepest component. */
  trail(center: Complex, spanY: number): NestingStep[];
}

/**
 * The trail over one index. Ancestors are found by their angled internal
 * address, a prefix of the deepest component's; each period's addresses are
 * derived only when a trail first needs that period.
 */
export const createNestingLookup = (index: CatalogIndex): NestingLookup => {
  const byPeriod = new Map<number, Map<string, CatalogComponent>>();
  const ancestor = (steps: readonly AngledAddressStep[]): CatalogComponent | undefined => {
    const period = steps.at(-1)?.toPeriod ?? 1;
    let addresses = byPeriod.get(period);
    if (addresses === undefined) {
      addresses = new Map();
      for (const { component } of index.entries) {
        if (component.period === period) {
          addresses.set(addressKey(component.angledInternalAddress ?? []), component);
        }
      }
      byPeriod.set(period, addresses);
    }
    return addresses.get(addressKey(steps));
  };
  return {
    trail: (center, spanY) => {
      const deepest = deepestAround(index, center, spanY)?.component;
      const steps = deepest?.angledInternalAddress ?? [];
      const cardioid = ancestor([]);
      const root: NestingStep =
        cardioid === undefined ? { period: 1 } : { period: 1, component: cardioid };
      return [
        root,
        ...steps.map((step, position): NestingStep => {
          const component =
            position === steps.length - 1 ? deepest : ancestor(steps.slice(0, position + 1));
          return {
            period: step.toPeriod,
            rotation: step.rotation,
            ...(component === undefined ? {} : { component }),
          };
        }),
      ];
    },
  };
};
