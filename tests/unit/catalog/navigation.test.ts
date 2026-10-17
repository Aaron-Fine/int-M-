import { describe, expect, it } from 'vitest';

import { COMPONENT_CATALOG, findCatalogComponent } from '../../../src/catalog/components';
import {
  catalogGroups,
  compareCatalogOrder,
  componentSizeEstimate,
  GROUP_OPEN_LIMIT,
  zoomSpanFor,
} from '../../../src/catalog/navigation';
import { MAX_VIEWPORT_SPAN_Y, MIN_VIEWPORT_SPAN_Y } from '../../../src/domain/viewport';
import { COMPONENT_COUNTS, syntheticCatalog, testComponent } from './synthetic-catalog';

const SYNTHETIC = syntheticCatalog().components;

const component = (id: string) => {
  const found = findCatalogComponent(id);
  if (found === undefined) throw new Error(`no catalog entry ${id}`);
  return found;
};

/** A deterministic shuffle (mulberry32), so a failure reproduces. */
const shuffled = <T>(values: readonly T[], seed: number): T[] => {
  let state = seed;
  const random = (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [copy[index], copy[other]] = [copy[other]!, copy[index]!];
  }
  return copy;
};

describe('catalog order (ADR 0012)', () => {
  it('orders the curated catalog by period, then by the lower ray', () => {
    expect([...COMPONENT_CATALOG].sort(compareCatalogOrder).map((c) => c.id)).toEqual([
      'mi-p1-0-1',
      'mi-p2-1-2',
      'mi-p3-1-2',
      'mi-p3-3-4',
      'mi-p3-5-6',
      'mi-p4-1-2',
      'mi-p4-3-4',
      'mi-p4-6-9',
      'mi-p4-7-8',
      'mi-p4-11-12',
      'mi-p4-13-14',
    ]);
  });

  it('is a total order on 4,016 entries, whatever order they arrive in', () => {
    const sorted = [...SYNTHETIC].sort(compareCatalogOrder);
    for (let index = 1; index < sorted.length; index += 1) {
      expect(compareCatalogOrder(sorted[index - 1]!, sorted[index]!)).toBeLessThan(0);
    }
    expect(shuffled(SYNTHETIC, 7).sort(compareCatalogOrder)).toEqual(sorted);
  });
});

describe('component size estimate and zoom span', () => {
  it('matches the known sizes of the low-period components', () => {
    expect(componentSizeEstimate(component('mi-p1-0-1'))).toBe(1);
    expect(componentSizeEstimate(component('mi-p2-1-2'))).toBe(0.5);
    expect(componentSizeEstimate(component('mi-p3-3-4'))).toBeCloseTo(0.0190355, 6);
    expect(componentSizeEstimate(component('mi-p3-1-2'))).toBeCloseTo(0.1889138, 6);
    expect(componentSizeEstimate(component('mi-p4-6-9'))).toBeCloseTo(0.1179602, 6);
    expect(componentSizeEstimate(component('mi-p4-7-8'))).toBeCloseTo(0.00099163, 7);
  });

  it('gives a component and its conjugate the same size', () => {
    expect(componentSizeEstimate(component('mi-p3-5-6'))).toBe(
      componentSizeEstimate(component('mi-p3-1-2')),
    );
    expect(componentSizeEstimate(component('mi-p4-13-14'))).toBe(
      componentSizeEstimate(component('mi-p4-1-2')),
    );
  });

  it('frames a component at 2.5 times its size', () => {
    expect(zoomSpanFor(component('mi-p1-0-1'))).toBe(2.5);
    expect(zoomSpanFor(component('mi-p2-1-2'))).toBe(1.25);
    expect(zoomSpanFor(component('mi-p3-3-4'))).toBeCloseTo(0.0475888, 6);
  });

  it('never zooms past the 6,000,000× ceiling or out past the widest view', () => {
    // Near the tip at −2, a period-12 component is far below the ceiling.
    const tiny = testComponent(12, 1, 2, { re: -1.99999, im: 0 });
    expect(componentSizeEstimate(tiny)).toBeLessThan(MIN_VIEWPORT_SPAN_Y);
    expect(zoomSpanFor(tiny)).toBe(MIN_VIEWPORT_SPAN_Y);
    // An escaping orbit overflows: the size is 0, not NaN, so the span is the ceiling.
    const escaping = testComponent(12, 1, 2, { re: 2, im: 2 });
    expect(componentSizeEstimate(escaping)).toBe(0);
    expect(zoomSpanFor(escaping)).toBe(MIN_VIEWPORT_SPAN_Y);
    for (const entry of [...COMPONENT_CATALOG, ...SYNTHETIC]) {
      const span = zoomSpanFor(entry);
      expect(span, entry.id).toBeGreaterThanOrEqual(MIN_VIEWPORT_SPAN_Y);
      expect(span, entry.id).toBeLessThanOrEqual(MAX_VIEWPORT_SPAN_Y);
    }
  });
});

describe('catalog groups', () => {
  it('groups the curated catalog by period, all expanded', () => {
    const groups = catalogGroups(COMPONENT_CATALOG);
    expect(groups.map((group) => [group.period, group.components.length])).toEqual([
      [1, 1],
      [2, 1],
      [3, 3],
      [4, 6],
    ]);
    expect(groups.every((group) => group.openByDefault)).toBe(true);
    expect(groups[2]?.components.map((c) => c.label)).toEqual([
      'Douady rabbit',
      'Airplane',
      'Co-rabbit',
    ]);
  });

  it('puts each of 4,016 entries in exactly one group, collapsing the large ones', () => {
    const groups = catalogGroups(shuffled(SYNTHETIC, 11));
    expect(groups.map((group) => group.period)).toEqual(COMPONENT_COUNTS.map((_, i) => i + 1));
    expect(groups.map((group) => group.components.length)).toEqual([...COMPONENT_COUNTS]);
    expect(groups.map((group) => group.openByDefault)).toEqual(
      COMPONENT_COUNTS.map((count) => count <= GROUP_OPEN_LIMIT),
    );
    const ids = groups.flatMap((group) => group.components.map((c) => c.id));
    expect(ids).toEqual([...SYNTHETIC].sort(compareCatalogOrder).map((c) => c.id));
  });
});
