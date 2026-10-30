import { describe, expect, it } from 'vitest';

import { componentSizeEstimate, zoomSpanFor } from '../../../../src/catalog/navigation';
import {
  createNestingLookup,
  deepestAround,
  insideMainCardioid,
  NESTING_MIN_SIZE_PER_SPAN,
  type NestingStep,
} from '../../../../src/catalog/nesting';
import type { CatalogComponent } from '../../../../src/catalog/schema';
import { createCatalogIndex } from '../../../../src/catalog/viewport-index';
import { DEFAULT_VIEWPORT, MIN_VIEWPORT_SPAN_Y } from '../../../../src/domain/viewport';
import { fullCatalog } from './core-bytes';

const CATALOG = fullCatalog();
const INDEX = createCatalogIndex(CATALOG);
const LOOKUP = createNestingLookup(INDEX);

const byAddress = (text: string): CatalogComponent => {
  const found = CATALOG.find(
    (component) =>
      [
        '1',
        ...(component.angledInternalAddress ?? []).map(
          (step) =>
            `${step.rotation.numerator}/${step.rotation.denominator} ${String(step.toPeriod)}`,
        ),
      ].join(' ') === text,
  );
  if (found === undefined) throw new Error(`no component at ${text}`);
  return found;
};

/** "1 1/3 3 1/2 6": each period after the first preceded by the angle passed through. */
const spelled = (steps: readonly NestingStep[]): string =>
  steps
    .map((step) =>
      step.rotation === undefined
        ? String(step.period)
        : `${step.rotation.numerator}/${step.rotation.denominator} ${step.period}`,
    )
    .join(' ');

const framed = (component: CatalogComponent) =>
  LOOKUP.trail(component.center, zoomSpanFor(component));

describe('nesting trail on the real period ≤12 core (UI review Proposal C)', () => {
  it('is the main cardioid alone at the default view', () => {
    const trail = LOOKUP.trail(DEFAULT_VIEWPORT.center, DEFAULT_VIEWPORT.spanY);
    expect(spelled(trail)).toBe('1');
    expect(trail[0]?.component?.label).toBe('Main cardioid');
  });

  it('follows the rabbit to its 1/2 child of period 6, with each ancestor', () => {
    const child = byAddress('1 1/3 3 1/2 6');
    const trail = framed(child);
    expect(spelled(trail)).toBe('1 1/3 3 1/2 6');
    expect(trail.map((step) => step.component?.label)).toEqual([
      'Main cardioid',
      '1/3-bulb (Douady rabbit)',
      child.label,
    ]);
  });

  it('ends every component framed from the catalog at that component', () => {
    const framable = CATALOG.filter((component) => zoomSpanFor(component) > MIN_VIEWPORT_SPAN_Y);
    expect(framable.length).toBeGreaterThan(2_500);
    const misses = framable.filter(
      (component) => framed(component).at(-1)?.component !== component,
    );
    expect(misses.map((component) => component.id)).toEqual([]);
  });

  it('ends at the deepest ancestor the view shows when the zoom bound cannot frame a component', () => {
    // At the 6,000,000× bound these are under a quarter of the view height.
    const tooSmall = CATALOG.filter(
      (component) =>
        NESTING_MIN_SIZE_PER_SPAN * MIN_VIEWPORT_SPAN_Y > componentSizeEstimate(component),
    );
    expect(tooSmall.length).toBeGreaterThan(0);
    for (const component of tooSmall) {
      const trail = framed(component);
      const address = component.angledInternalAddress ?? [];
      expect(trail.length).toBeLessThanOrEqual(address.length);
      // Still a prefix of the component's own address.
      expect(trail.slice(1).map((step) => step.period)).toEqual(
        address.slice(0, trail.length - 1).map((step) => step.toPeriod),
      );
    }
  });

  it('finds every ancestor of every component', () => {
    const missing = CATALOG.flatMap((component) =>
      framed(component)
        .filter((step) => step.component === undefined)
        .map((step) => `${component.id} at period ${step.period}`),
    );
    expect(missing).toEqual([]);
  });

  it('keeps a point inside the main cardioid there, next to the 1/2-bulb', () => {
    expect(spelled(LOOKUP.trail({ re: -0.7, im: 0 }, 0.05))).toBe('1');
    expect(spelled(LOOKUP.trail({ re: -0.8, im: 0 }, 0.05))).toBe('1 1/2 2');
  });

  it('names only components at least a quarter of the view height', () => {
    const rabbit = byAddress('1 1/3 3');
    expect(deepestAround(INDEX, rabbit.center, 0.3)?.component).toBe(rabbit);
    // Zoomed out far enough, the rabbit is too small to be the view's context.
    expect(deepestAround(INDEX, rabbit.center, 2.5)?.component.period).toBe(1);
  });

  it('tests the main cardioid exactly', () => {
    expect(insideMainCardioid({ re: 0, im: 0 })).toBe(true);
    expect(insideMainCardioid({ re: -0.74, im: 0 })).toBe(true);
    expect(insideMainCardioid({ re: -0.76, im: 0 })).toBe(false);
    expect(insideMainCardioid({ re: 0.24, im: 0 })).toBe(true);
    expect(insideMainCardioid({ re: 0.26, im: 0 })).toBe(false);
    // The 1/3-bulb's root, e^{2πi/3}/2 − e^{4πi/3}/4, is on the boundary; its nucleus is outside.
    expect(insideMainCardioid({ re: -0.1225611668766535, im: 0.7448617666197435 })).toBe(false);
    expect(insideMainCardioid({ re: -0.1, im: -0.6 })).toBe(true);
  });
});
