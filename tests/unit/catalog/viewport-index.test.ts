import { describe, expect, it } from 'vitest';

import { COMPONENT_CATALOG } from '../../../src/catalog/components';
import { compareCatalogOrder } from '../../../src/catalog/navigation';
import {
  createCatalogIndex,
  viewportBounds,
  type ComplexBounds,
  type IndexedComponent,
} from '../../../src/catalog/viewport-index';
import {
  DEFAULT_VIEWPORT,
  MAX_VIEWPORT_SPAN_Y,
  MIN_VIEWPORT_SPAN_Y,
} from '../../../src/domain/viewport';
import { syntheticCatalog } from './synthetic-catalog';

const SYNTHETIC = syntheticCatalog().components;
const INDEX = createCatalogIndex(SYNTHETIC);
const WIDTH = 960;
const HEIGHT = 600;

const inside = (entry: IndexedComponent, bounds: ComplexBounds): boolean =>
  entry.component.center.re >= bounds.reMin &&
  entry.component.center.re <= bounds.reMax &&
  entry.component.center.im >= bounds.imMin &&
  entry.component.center.im <= bounds.imMax;

/** The full scan the index replaces: the query's answer and the slab entries it may examine. */
const bruteForce = (bounds: ComplexBounds, atLeast: number) => {
  let collected = 0;
  let lastPeriod = 12;
  for (let period = 1; period <= 12; period += 1) {
    collected += INDEX.entries.filter(
      (entry) => entry.component.period === period && inside(entry, bounds),
    ).length;
    if (collected >= atLeast) {
      lastPeriod = period;
      break;
    }
  }
  const walked = INDEX.entries.filter((entry) => entry.component.period <= lastPeriod);
  return {
    ids: walked.filter((entry) => inside(entry, bounds)).map((entry) => entry.component.id),
    slab: walked.filter(
      (entry) =>
        entry.component.center.re >= bounds.reMin && entry.component.center.re <= bounds.reMax,
    ).length,
  };
};

/** Deterministic pseudo-random numbers (mulberry32), so a failure reproduces. */
const random = (seed: number) => {
  let state = seed;
  return (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

describe('catalog viewport index', () => {
  it('ranks entries in catalog order and finds them by id', () => {
    const index = createCatalogIndex(COMPONENT_CATALOG);
    expect(index.entries.map((entry) => entry.rank)).toEqual(COMPONENT_CATALOG.map((_, i) => i));
    expect(index.entries.map((entry) => entry.component.id)).toEqual(
      [...COMPONENT_CATALOG].sort(compareCatalogOrder).map((component) => component.id),
    );
    expect(index.find('mi-p3-1-2')?.component.label).toBe('1/3-bulb (Douady rabbit)');
    expect(index.find('mi-p3-rabbit')).toBeUndefined();
  });

  it('examines only periods 1 to 6 at the default view of 4,016 entries', () => {
    const bounds = viewportBounds(DEFAULT_VIEWPORT, WIDTH, HEIGHT);
    const query = INDEX.lowestPeriodsInView(bounds, 40);
    // 1 + 1 + 3 + 6 + 15 + 27 entries: the first periods that reach 40.
    expect(query.visited).toBe(53);
    expect(query.entries).toHaveLength(53);
    expect(Math.max(...query.entries.map((entry) => entry.component.period))).toBe(6);
  });

  it('examines a few entries per period at the zoom ceiling', () => {
    const target = INDEX.entries.find(
      (entry) => entry.component.period === 12 && entry.component.center.im > 0.1,
    );
    if (target === undefined) throw new Error('no period-12 entry above the axis');
    const viewport = { center: target.component.center, spanY: MIN_VIEWPORT_SPAN_Y };
    const query = INDEX.lowestPeriodsInView(viewportBounds(viewport, WIDTH, HEIGHT), 40);
    expect(query.entries.map((entry) => entry.component.id)).toContain(target.component.id);
    expect(query.visited).toBeLessThanOrEqual(24);
  });

  it('agrees with a full scan and examines only the Re slab, at any centre and zoom', () => {
    const next = random(20261017);
    for (let trial = 0; trial < 300; trial += 1) {
      const spanY = Math.exp(
        Math.log(MIN_VIEWPORT_SPAN_Y) +
          next() * (Math.log(MAX_VIEWPORT_SPAN_Y) - Math.log(MIN_VIEWPORT_SPAN_Y)),
      );
      // Half the trials centre on an entry, so deep views still contain some.
      const anchor = INDEX.entries[Math.floor(next() * INDEX.entries.length)]!.component.center;
      const center = trial % 2 === 0 ? anchor : { re: -2 + 2.5 * next(), im: -1.25 + 2.5 * next() };
      const bounds = viewportBounds({ center, spanY }, WIDTH, HEIGHT);
      for (const atLeast of [40, Number.POSITIVE_INFINITY]) {
        const query = INDEX.lowestPeriodsInView(bounds, atLeast);
        const expected = bruteForce(bounds, atLeast);
        expect(query.entries.map((entry) => entry.component.id)).toEqual(expected.ids);
        expect(query.visited).toBe(expected.slab);
      }
    }
  });

  it('covers every pixel a marker can be drawn on', () => {
    const bounds = viewportBounds(DEFAULT_VIEWPORT, WIDTH, HEIGHT);
    const unitsPerPixel = DEFAULT_VIEWPORT.spanY / HEIGHT;
    expect(bounds.reMin).toBeCloseTo(-0.75 - (WIDTH / 2 + 1) * unitsPerPixel, 12);
    expect(bounds.imMax).toBeCloseTo((HEIGHT / 2 + 1) * unitsPerPixel, 12);
  });
});
