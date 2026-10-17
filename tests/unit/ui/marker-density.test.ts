import { describe, expect, it } from 'vitest';

import { COMPONENT_CATALOG } from '../../../src/catalog/components';
import { compareCatalogOrder } from '../../../src/catalog/navigation';
import { createCatalogIndex, viewportBounds } from '../../../src/catalog/viewport-index';
import type { Viewport } from '../../../src/domain/types';
import {
  complexToPixel,
  DEFAULT_VIEWPORT,
  MAX_VIEWPORT_SPAN_Y,
  MIN_VIEWPORT_SPAN_Y,
} from '../../../src/domain/viewport';
import {
  COMPACT_HIT_REM,
  MARKER_CAP,
  MARKER_HIT_REM,
  planMarkers,
  type MarkerPlan,
} from '../../../src/ui/marker-density';
import { syntheticCatalog, testComponent } from '../catalog/synthetic-catalog';

const REM = 16;
const SYNTHETIC = syntheticCatalog().components;
const INDEX = createCatalogIndex(SYNTHETIC);
const CURATED = createCatalogIndex(COMPONENT_CATALOG);
/** The canvas at 1280 × 720 (Playwright's desktop) and at 320 px wide. */
const DESKTOP = { width: 922, height: 576 };
const PHONE = { width: 300, height: 225 };
const WIDE = { width: 960, height: 600 };

const plan = (
  viewport: Viewport,
  options: { selectedId?: string; cap?: number; size?: { width: number; height: number } } = {},
  index = INDEX,
): MarkerPlan =>
  planMarkers({
    index,
    viewport,
    ...(options.size ?? WIDE),
    remPx: REM,
    selectedId: options.selectedId,
    ...(options.cap === undefined ? {} : { cap: options.cap }),
  });

const ids = (result: MarkerPlan): string[] => result.markers.map((m) => m.component.id);

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

/** Views at every zoom from the widest to the ceiling, half of them centred on an entry. */
const views = (count: number, seed: number): Viewport[] => {
  const next = random(seed);
  return Array.from({ length: count }, (_, trial) => {
    const spanY = Math.exp(
      Math.log(MIN_VIEWPORT_SPAN_Y) +
        next() * (Math.log(MAX_VIEWPORT_SPAN_Y) - Math.log(MIN_VIEWPORT_SPAN_Y)),
    );
    const anchor = INDEX.entries[Math.floor(next() * INDEX.entries.length)]!.component.center;
    const center = trial % 2 === 0 ? anchor : { re: -2 + 2.5 * next(), im: -1.25 + 2.5 * next() };
    return { center, spanY };
  });
};

const hitSide = (compact: boolean): number => (compact ? COMPACT_HIT_REM : MARKER_HIT_REM) * REM;

describe('catalog marker density policy (Q4)', () => {
  it('shows every curated marker at the default desktop view, in catalog order', () => {
    const result = plan(DEFAULT_VIEWPORT, { size: DESKTOP }, CURATED);
    expect(ids(result)).toEqual(
      [...COMPONENT_CATALOG].sort(compareCatalogOrder).map((component) => component.id),
    );
    // The airplane and the period-4 component at the tip are 43 px apart: both shrink to their dots.
    expect(result.markers.filter((m) => m.compact).map((m) => m.component.id)).toEqual([
      'mi-p3-3-4',
      'mi-p4-7-8',
    ]);
  });

  it('drops only the marker whose dot would cover the airplane at 320 px', () => {
    const result = plan(DEFAULT_VIEWPORT, { size: PHONE }, CURATED);
    expect(result.markers).toHaveLength(10);
    expect(ids(result)).not.toContain('mi-p4-7-8');
  });

  it('never shows more than 40 markers, at any centre and zoom', () => {
    for (const viewport of [DEFAULT_VIEWPORT, ...views(200, 1)]) {
      expect(plan(viewport).markers.length).toBeLessThanOrEqual(MARKER_CAP);
    }
    expect(plan(DEFAULT_VIEWPORT, { cap: 5 }).markers.length).toBeLessThanOrEqual(5);
  });

  it('examines only periods 1 to 6 of 4,016 entries at the default view', () => {
    const result = plan(DEFAULT_VIEWPORT);
    expect(result.visited).toBe(53);
    expect(Math.max(...result.markers.map((m) => m.component.period))).toBeLessThanOrEqual(6);
  });

  it('fills the cap from the lowest periods, skipping only covered dots', () => {
    const dot = COMPACT_HIT_REM * REM;
    for (const viewport of views(200, 2)) {
      const result = plan(viewport);
      const shown = new Set(ids(result));
      const query = INDEX.lowestPeriodsInView(
        viewportBounds(viewport, WIDE.width, WIDE.height),
        MARKER_CAP,
      );
      const cut = Math.max(0, ...query.entries.map((entry) => entry.component.period));
      expect(result.markers.every((m) => m.component.period <= cut)).toBe(true);
      if (result.markers.length === MARKER_CAP) continue;
      for (const entry of query.entries) {
        if (shown.has(entry.component.id)) continue;
        const point = complexToPixel(viewport, WIDE, entry.component.center);
        if (point.x < 0 || point.x > WIDE.width || point.y < 0 || point.y > WIDE.height) continue;
        // An in-view candidate is missing only because its dot would cover a shown dot.
        const covered = result.markers.some(
          (m) =>
            Math.abs(m.x * WIDE.width - point.x) < dot &&
            Math.abs(m.y * WIDE.height - point.y) < dot,
        );
        expect(covered, entry.component.id).toBe(true);
      }
    }
  });

  it('keeps hit boxes apart, so every marker keeps a 24 px target', () => {
    for (const viewport of views(200, 3)) {
      const markers = plan(viewport).markers;
      for (const [index, a] of markers.entries()) {
        for (const b of markers.slice(index + 1)) {
          const reach = (hitSide(a.compact) + hitSide(b.compact)) / 2;
          const apart =
            Math.abs(a.x - b.x) * WIDE.width >= reach || Math.abs(a.y - b.y) * WIDE.height >= reach;
          expect(apart, `${a.component.id} and ${b.component.id}`).toBe(true);
        }
      }
    }
  });

  it('always shows the selected entry when it is in view, with its label', () => {
    const selected = INDEX.entries.find(
      (entry) => entry.component.period === 12 && entry.component.center.im > 0.2,
    );
    if (selected === undefined) throw new Error('no period-12 entry above the axis');
    const result = plan(DEFAULT_VIEWPORT, { selectedId: selected.component.id });
    const marker = result.markers.find((m) => m.component.id === selected.component.id);
    expect(marker?.labelVisible).toBe(true);
    expect(result.markers.length).toBeLessThanOrEqual(MARKER_CAP);
    const away = { center: { re: 5, im: 5 }, spanY: 0.01 };
    expect(ids(plan(away, { selectedId: selected.component.id }))).toEqual([]);
  });

  it('returns markers in catalog order, so panning never reorders focus', () => {
    const rank = new Map(INDEX.entries.map((entry) => [entry.component.id, entry.rank]));
    let previous: string[] = [];
    for (let step = 0; step < 12; step += 1) {
      const viewport = { center: { re: -1.2 + 0.08 * step, im: 0.3 }, spanY: 0.6 };
      const current = ids(plan(viewport));
      const ranks = current.map((id) => rank.get(id) ?? -1);
      expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
      const common = current.filter((id) => previous.includes(id));
      expect(common).toEqual(previous.filter((id) => current.includes(id)));
      previous = current;
    }
  });

  it('gives the same plan whatever order the index was built from', () => {
    const reversed = createCatalogIndex([...SYNTHETIC].reverse());
    for (const viewport of views(20, 4)) {
      expect(plan(viewport, {}, reversed)).toEqual(plan(viewport));
    }
  });

  it('returns an empty plan, without throwing, for a canvas that is not whole positive pixels', () => {
    for (const size of [
      { width: 0, height: 600 },
      { width: 960, height: 0 },
      { width: 960.5, height: 600 },
    ]) {
      expect(plan(DEFAULT_VIEWPORT, { size })).toEqual({ markers: [], visited: 0 });
    }
  });

  it('rejects a cap that is not a finite number of at least 1', () => {
    for (const cap of [0, 0.5, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => plan(DEFAULT_VIEWPORT, { cap })).toThrow(RangeError);
    }
    expect(plan(DEFAULT_VIEWPORT, { cap: 1 }).markers.length).toBeLessThanOrEqual(1);
  });
});

describe('catalog marker collisions', () => {
  const at = (x: number, y: number) => ({ re: x / 240, im: -y / 240 });
  // 960 × 600 at spanY 2.5 is 240 px per unit, centred on 0: offsets below are in CSS px.
  const view = { center: { re: 0, im: 0 }, spanY: 2.5 };
  const alpha = testComponent(2, 1, 2, at(0, 0), 'Alpha component');

  it('hides a label, never its marker, when labels collide', () => {
    const beta = testComponent(3, 1, 2, at(-40, 12), 'Beta component');
    const result = plan(view, {}, createCatalogIndex([alpha, beta]));
    expect(result.markers.map((m) => [m.component.label, m.compact, m.labelVisible])).toEqual([
      ['Alpha component', true, true],
      ['Beta component', true, false],
    ]);
  });

  it('drops a marker whose dot would cover a dot already placed', () => {
    const beta = testComponent(3, 1, 2, at(-10, 0), 'Beta component');
    expect(ids(plan(view, {}, createCatalogIndex([alpha, beta])))).toEqual([alpha.id]);
    // Selected, the lower-priority entry wins the place instead.
    expect(ids(plan(view, { selectedId: beta.id }, createCatalogIndex([alpha, beta])))).toEqual([
      beta.id,
    ]);
  });

  it('scales hit boxes with the root font size', () => {
    const beta = testComponent(3, 1, 2, at(-30, 0), 'Beta component');
    const index = createCatalogIndex([alpha, beta]);
    expect(ids(plan(view, {}, index))).toEqual([alpha.id, beta.id]);
    // At 200% text the dots are 48 px: 30 px apart, they would overlap.
    const large = planMarkers({ index, viewport: view, ...WIDE, remPx: 2 * REM });
    expect(ids(large)).toEqual([alpha.id]);
  });

  it('keeps the full hit box when no neighbour is near', () => {
    const beta = testComponent(3, 1, 2, at(-200, 0), 'Beta component');
    const result = plan(view, {}, createCatalogIndex([alpha, beta]));
    expect(result.markers.map((m) => [m.compact, m.labelVisible])).toEqual([
      [false, true],
      [false, true],
    ]);
  });

  it('puts labels on the left of markers near the right edge', () => {
    const right = testComponent(3, 1, 2, at(360, 0), 'Right component');
    const result = plan(view, {}, createCatalogIndex([alpha, right]));
    expect(result.markers.map((m) => m.leftFacing)).toEqual([false, true]);
  });

  it('shows a selected label even where it covers a neighbour marker', () => {
    const beta = testComponent(3, 1, 2, at(-30, 0), 'Beta component');
    const result = plan(view, { selectedId: beta.id }, createCatalogIndex([alpha, beta]));
    // The selected label is placed first and covers Alpha's label, so Alpha's label hides.
    expect(result.markers.map((m) => [m.component.label, m.labelVisible])).toEqual([
      ['Alpha component', false],
      ['Beta component', true],
    ]);
    const unselected = plan(view, {}, createCatalogIndex([alpha, beta]));
    expect(unselected.markers.map((m) => m.labelVisible)).toEqual([true, false]);
  });

  it('hides a label that covers an earlier label, with no marker in the way', () => {
    const ahead = testComponent(2, 1, 2, at(280, 0), 'Alpha component');
    const beta = testComponent(3, 1, 2, at(80, 0), 'Beta component');
    const result = plan(view, {}, createCatalogIndex([ahead, beta]));
    expect(result.markers.map((m) => [m.leftFacing, m.compact, m.labelVisible])).toEqual([
      [true, false, true],
      [false, false, false],
    ]);
  });

  it('hides a label that would cover a neighbour marker, with no label in the way', () => {
    const beta = testComponent(3, 1, 2, at(-30, 0), 'B');
    const result = plan(view, {}, createCatalogIndex([alpha, beta]));
    expect(result.markers.map((m) => [m.compact, m.labelVisible])).toEqual([
      [true, true],
      [true, false],
    ]);
  });

  it('compares full hit boxes at the root font size', () => {
    const beta = testComponent(3, 1, 2, at(-60, 0), 'Beta component');
    const index = createCatalogIndex([alpha, beta]);
    const at16 = planMarkers({ index, viewport: view, ...WIDE, remPx: 16 });
    const at32 = planMarkers({ index, viewport: view, ...WIDE, remPx: 32 });
    expect(at16.markers.map((m) => m.compact)).toEqual([false, false]);
    expect(at32.markers.map((m) => m.compact)).toEqual([true, true]);
  });

  it('offsets the label from its marker by the root font size', () => {
    const ahead = testComponent(2, 1, 2, at(0, 0), 'B');
    const beta = testComponent(3, 1, 2, at(110, 0), 'C');
    const index = createCatalogIndex([ahead, beta]);
    const at16 = planMarkers({ index, viewport: view, ...WIDE, remPx: 16 });
    const at32 = planMarkers({ index, viewport: view, ...WIDE, remPx: 32 });
    expect(at16.markers.map((m) => m.labelVisible)).toEqual([true, true]);
    expect(at32.markers.map((m) => m.labelVisible)).toEqual([false, true]);
  });

  it('breaks a tie within a period by size, larger first, before catalog order', () => {
    const first = testComponent(3, 1, 3, at(-5, 20), 'First component');
    const second = testComponent(3, 2, 3, at(5, 10), 'Second component');
    const index = createCatalogIndex([first, second]);
    const big =
      (index.find(first.id)?.size ?? 0) > (index.find(second.id)?.size ?? 0) ? first : second;
    const small = big === first ? second : first;
    // The test only means something if size and catalog order disagree.
    expect(index.find(big.id)?.size).not.toBe(index.find(small.id)?.size);
    expect(index.find(big.id)?.rank).toBeGreaterThan(index.find(small.id)?.rank ?? Infinity);
    // The two dots overlap, so only the first in priority is placed.
    expect(ids(plan(view, {}, index))).toEqual([big.id]);
  });

  it('breaks a tie between conjugates by catalog order, upper half first', () => {
    const upper = testComponent(3, 1, 7, { re: -0.2, im: 0.02 }, 'Upper component');
    const lower = testComponent(3, 6, 7, { re: -0.2, im: -0.02 }, 'Lower component');
    const index = createCatalogIndex([lower, upper]);
    expect(index.find(upper.id)?.size).toBe(index.find(lower.id)?.size);
    expect(index.find(upper.id)?.rank).toBeLessThan(index.find(lower.id)?.rank ?? -Infinity);
    // Equal sizes and overlapping dots: the upper half is placed, the lower half dropped.
    expect(ids(plan(view, {}, index))).toEqual([upper.id]);
    // At the cap boundary (one slot), the upper half still takes it.
    expect(ids(plan(view, { cap: 1 }, index))).toEqual([upper.id]);
  });

  it('places dots and hit boxes that exactly touch, since their edges do not overlap', () => {
    const touchingDot = testComponent(3, 1, 2, at(24, 0), 'Beta component');
    const dots = plan(view, {}, createCatalogIndex([alpha, touchingDot]));
    expect(ids(dots)).toEqual([alpha.id, touchingDot.id]);
    expect(dots.markers.map((m) => m.compact)).toEqual([true, true]);
    const touchingBox = testComponent(3, 1, 2, at(44, 0), 'Beta component');
    const boxes = plan(view, {}, createCatalogIndex([alpha, touchingBox]));
    expect(boxes.markers.map((m) => m.compact)).toEqual([false, false]);
  });

  it('checks a label against the compact hit box of a neighbour, not its full box', () => {
    const near = testComponent(2, 1, 2, at(0, 0), 'B');
    const beta = testComponent(3, 1, 2, at(58, 0), 'C');
    const gamma = testComponent(3, 2, 3, at(98, 0), 'D');
    const result = plan(view, {}, createCatalogIndex([near, beta, gamma]));
    const byLabel = new Map(result.markers.map((m) => [m.component.label, m]));
    expect(byLabel.get('B')?.compact).toBe(false);
    expect(byLabel.get('B')?.labelVisible).toBe(true);
    expect(byLabel.get('C')?.compact).toBe(true);
    expect(byLabel.get('D')?.compact).toBe(true);
  });
});
