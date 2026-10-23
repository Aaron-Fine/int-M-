import { describe, expect, it } from 'vitest';

import { catalogGroups, GROUP_OPEN_LIMIT } from '../../../../src/catalog/navigation';
import { createCatalogIndex } from '../../../../src/catalog/viewport-index';
import { DEFAULT_VIEWPORT } from '../../../../src/domain/viewport';
import { MARKER_CAP, planMarkers } from '../../../../src/ui/marker-density';
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
