import { describe, expect, it } from 'vitest';

import {
  catalogGroups,
  componentSizeEstimate,
  GROUP_OPEN_LIMIT,
} from '../../../../src/catalog/navigation';
import { createCatalogIndex } from '../../../../src/catalog/viewport-index';
import { DEFAULT_VIEWPORT } from '../../../../src/domain/viewport';
import {
  GLYPH_CENTRE_PX,
  GLYPH_MAX_PX,
  GLYPH_MIN_PX,
  MARKER_CAP,
  markerScale,
  planMarkers,
} from '../../../../src/ui/marker-density';
import { fullCatalog } from './core-bytes';

const CATALOG = fullCatalog();
const INDEX = createCatalogIndex(CATALOG);
const DESKTOP = { width: 922, height: 576 };
const PHONE = { width: 300, height: 225 };
const VIEWS = {
  default: DEFAULT_VIEWPORT,
  'rabbit 8×': { center: { re: -0.1225611668766535, im: 0.7448617666197435 }, spanY: 0.3 },
  '13×': { center: { re: 0.305376533, im: 0.552677981 }, spanY: 0.19230769230769232 },
  '126×': { center: { re: -0.158902249, im: -1.034028 }, spanY: 0.01984126984126984 },
};

const plan = (
  view: keyof typeof VIEWS,
  size: { width: number; height: number },
  selectedId?: string,
) => planMarkers({ index: INDEX, viewport: VIEWS[view], ...size, remPx: 16, selectedId });

describe('marker density on the real period ≤12 core (Q4, ADR 0014)', () => {
  it.each([
    ['default', DESKTOP, 29, 53],
    ['default', PHONE, 16, 53],
    ['rabbit 8×', DESKTOP, 25, 587],
    ['rabbit 8×', PHONE, 15, 581],
    ['13×', DESKTOP, 27, 486],
    ['13×', PHONE, 11, 360],
    ['126×', DESKTOP, 5, 180],
    ['126×', PHONE, 5, 164],
  ] as const)('%s on %o places %i markers, examining %i entries', (view, size, placed, visited) => {
    const result = plan(view, size);
    expect(result.markers).toHaveLength(placed);
    expect(result.visited).toBe(visited);
    expect(result.markers.length).toBeLessThanOrEqual(MARKER_CAP);
  });

  it('leaves Period 5, rays 7/31 and 8/31 off the default desktop view, and a selection forces it in', () => {
    const id = 'mi-p5-7-8';
    expect(plan('default', DESKTOP).markers.some((marker) => marker.component.id === id)).toBe(
      false,
    );
    const forced = plan('default', DESKTOP, id);
    expect(forced.markers.find((marker) => marker.component.id === id)?.labelVisible).toBe(true);
    expect(forced.markers.length).toBeLessThanOrEqual(MARKER_CAP);
  });

  it('keeps every curated marker at the default desktop view after the core loads', () => {
    const shown = plan('default', DESKTOP).markers.map((marker) => marker.component.id);
    expect(shown.slice(0, 11)).toEqual([
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
});

describe('the catalog panel at full size (ADR 0014)', () => {
  it('groups 4,016 entries in twelve periods; only periods 1 to 4 start open', () => {
    const groups = catalogGroups(CATALOG);
    expect(groups.map((group) => group.components.length)).toEqual([
      1, 1, 3, 6, 15, 27, 63, 120, 252, 495, 1023, 2010,
    ]);
    expect(groups.filter((group) => group.openByDefault).map((group) => group.period)).toEqual([
      1, 2, 3, 4,
    ]);
    expect(GROUP_OPEN_LIMIT).toBe(8);
  });
});

describe('marker glyphs sized to their components (handoff item 3)', () => {
  it('follows the size on screen within 10 to 40 px, then rings a satellite', () => {
    expect(markerScale(4, true)).toEqual({ glyphPx: GLYPH_MIN_PX });
    expect(markerScale(23.5, false)).toEqual({ glyphPx: 23.5 });
    expect(markerScale(GLYPH_MAX_PX, true)).toEqual({ glyphPx: GLYPH_MAX_PX });
    expect(markerScale(115, true)).toEqual({ glyphPx: GLYPH_CENTRE_PX, ringPx: 115 });
    expect(markerScale(230, false)).toEqual({ glyphPx: GLYPH_CENTRE_PX });
    expect(markerScale(Number.NaN, true)).toEqual({ glyphPx: GLYPH_MIN_PX });
  });

  it('grows a glyph with the zoom and rings the 1/2-bulb once it outgrows it', () => {
    const at = (center: { re: number; im: number }, spanY: number) =>
      planMarkers({ index: INDEX, viewport: { center, spanY }, ...DESKTOP, remPx: 16 }).markers;
    const scaleOf = (id: string, spanY: number) =>
      at(DEFAULT_VIEWPORT.center, spanY).find((marker) => marker.component.id === id)?.scale;
    // The main cardioid (size 1) is a cardioid: past 40 px a small glyph, never a ring.
    expect(scaleOf('mi-p1-0-1', 2.5)).toEqual({ glyphPx: GLYPH_CENTRE_PX });
    // The 1/2-bulb (size 0.5) is 115 px across at the default view: a ring of that diameter.
    const basilica = scaleOf('mi-p2-1-2', 2.5);
    expect(basilica?.glyphPx).toBe(GLYPH_CENTRE_PX);
    expect(basilica?.ringPx).toBeCloseTo((0.5 * DESKTOP.height) / 2.5, 9);
    // A period-6 bulb at the default view, then four times closer.
    const small = INDEX.entries.find(
      (entry) =>
        entry.component.period === 6 &&
        entry.size * (DESKTOP.height / 2.5) < GLYPH_MAX_PX / 4 &&
        plan('default', DESKTOP).markers.some((marker) => marker.component === entry.component),
    );
    expect(small).toBeDefined();
    if (small === undefined) return;
    const pxAt = (spanY: number) =>
      (componentSizeEstimate(small.component) * DESKTOP.height) / spanY;
    const glyphAt = (spanY: number) =>
      at(small.component.center, spanY).find((marker) => marker.component === small.component)
        ?.scale.glyphPx;
    expect(glyphAt(2.5)).toBe(Math.max(GLYPH_MIN_PX, pxAt(2.5)));
    expect(glyphAt(2.5 / 4)).toBeCloseTo(Math.max(GLYPH_MIN_PX, pxAt(2.5 / 4)), 9);
    expect(glyphAt(2.5 / 4) ?? 0).toBeGreaterThan(glyphAt(2.5) ?? Infinity);
  });
});
