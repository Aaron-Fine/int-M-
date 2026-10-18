import type { CatalogComponent } from '../catalog/schema';
import {
  viewportBounds,
  type CatalogIndex,
  type IndexedComponent,
} from '../catalog/viewport-index';
import type { Viewport } from '../domain/types';
import { complexToPixel } from '../domain/viewport';

/**
 * Catalog marker density policy (owner decision Q4, ADR 0012): which
 * catalog entries get an interactive marker on the canvas, where, and with
 * which label. A pure function of the view, so it is tested at the scale of
 * the period ≤12 core without a browser.
 *
 * 1. Candidates are the in-view entries of the lowest periods (the viewport
 *    index), plus the selected entry when it is in view.
 * 2. In priority order (selected first, then period, then larger components,
 *    then catalog order), a candidate is placed unless the cap is reached or
 *    its 1.5rem dot would overlap a dot already placed.
 * 3. A placed marker whose 2.75rem hit box overlaps another placed marker's
 *    hit box is compact: its hit box shrinks to its 1.5rem dot, so hit boxes
 *    never overlap and every target keeps at least 24 × 24 CSS px.
 * 4. In the same priority order, a label is shown only where it covers no
 *    earlier label and no other marker; the selected entry always keeps its
 *    label. A collision hides a label, never its marker.
 * 5. The markers come back in catalog order, the DOM and keyboard focus
 *    order, which does not depend on the view.
 *
 * Precondition: the canvas size is in whole CSS pixels. The caller rounds it;
 * a size that is not a positive integer yields no markers.
 */

/** Owner decision Q4: about 40 interactive markers at once, lowest periods first. */
export const MARKER_CAP = 40;
/** Hit box of a marker, in rem (`.catalog-marker` in styles.css). */
export const MARKER_HIT_REM = 2.75;
/** Hit box of a compact marker: its dot (`.catalog-marker--compact`). */
export const COMPACT_HIT_REM = 1.5;
/** A label starts this far from its marker's centre (`.catalog-marker__label`). */
export const LABEL_OFFSET_REM = 1.475;
/** Label box estimate: 0.67rem text, 0.35rem side padding, at most 14rem wide (styles.css). */
const LABEL_HEIGHT_REM = 1.2;
const LABEL_CHARACTER_REM = 0.42;
const LABEL_PADDING_REM = 0.7;
const LABEL_MAX_REM = 14;
/** Markers right of this fraction of the width put their label on their left. */
export const LEFT_FACING_FROM = 0.76;

export interface MarkerPlanInput {
  readonly index: CatalogIndex;
  readonly viewport: Viewport;
  /** Canvas size in whole CSS pixels. */
  readonly width: number;
  readonly height: number;
  /** CSS pixels per rem (the root font size). */
  readonly remPx: number;
  readonly selectedId?: string | undefined;
  /** Defaults to MARKER_CAP. */
  readonly cap?: number;
}

export interface PlannedMarker {
  readonly component: CatalogComponent;
  /** Centre as fractions of the canvas width and height. */
  readonly x: number;
  readonly y: number;
  /** The hit box shrinks to the dot because a neighbour is close. */
  readonly compact: boolean;
  readonly labelVisible: boolean;
  /** The label sits left of the marker (near the right edge). */
  readonly leftFacing: boolean;
}

export interface MarkerPlan {
  /** In catalog order: the DOM and keyboard focus order. */
  readonly markers: readonly PlannedMarker[];
  /** Index entries examined (the MI-PERF-008 cost measure). */
  readonly visited: number;
}

interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

interface Placement {
  readonly entry: IndexedComponent;
  /** Centre in CSS pixels. */
  readonly x: number;
  readonly y: number;
  readonly dot: Box;
  readonly full: Box;
}

const square = (x: number, y: number, side: number): Box => ({
  left: x - side / 2,
  top: y - side / 2,
  right: x + side / 2,
  bottom: y + side / 2,
});

const isPositiveInteger = (value: number): boolean => Number.isInteger(value) && value > 0;

const overlaps = (a: Box, b: Box): boolean =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

const byPriority =
  (selectedId: string | undefined) =>
  (left: IndexedComponent, right: IndexedComponent): number =>
    Number(right.component.id === selectedId) - Number(left.component.id === selectedId) ||
    left.component.period - right.component.period ||
    right.size - left.size ||
    left.rank - right.rank;

const candidatesFor = (input: MarkerPlanInput, cap: number) => {
  const bounds = viewportBounds(input.viewport, input.width, input.height);
  const query = input.index.lowestPeriodsInView(bounds, cap);
  const candidates = [...query.entries];
  const selected = input.selectedId === undefined ? undefined : input.index.find(input.selectedId);
  if (selected !== undefined && !candidates.includes(selected)) candidates.push(selected);
  return { candidates: candidates.sort(byPriority(input.selectedId)), visited: query.visited };
};

const place = (
  candidates: readonly IndexedComponent[],
  input: MarkerPlanInput,
  cap: number,
): Placement[] => {
  const size = { width: input.width, height: input.height };
  const placed: Placement[] = [];
  for (const entry of candidates) {
    if (placed.length >= cap) break;
    const { x, y } = complexToPixel(input.viewport, size, entry.component.center);
    if (x < 0 || x > input.width || y < 0 || y > input.height) continue;
    const dot = square(x, y, COMPACT_HIT_REM * input.remPx);
    if (placed.some((other) => overlaps(dot, other.dot))) continue;
    placed.push({ entry, x, y, dot, full: square(x, y, MARKER_HIT_REM * input.remPx) });
  }
  return placed;
};

const labelBox = (placement: Placement, input: MarkerPlanInput, leftFacing: boolean): Box => {
  const characters = Array.from(placement.entry.component.label).length;
  const width =
    Math.min(LABEL_MAX_REM, LABEL_PADDING_REM + LABEL_CHARACTER_REM * characters) * input.remPx;
  const offset = LABEL_OFFSET_REM * input.remPx;
  const left = leftFacing ? placement.x - offset - width : placement.x + offset;
  const half = (LABEL_HEIGHT_REM * input.remPx) / 2;
  return { left, right: left + width, top: placement.y - half, bottom: placement.y + half };
};

/**
 * Plans the catalog markers for one view; see the module comment for the rules.
 * A canvas that is not a positive whole number of CSS pixels in both
 * directions has no room for markers, so the plan is empty. Callers round
 * sizes to whole CSS pixels.
 */
export const planMarkers = (input: MarkerPlanInput): MarkerPlan => {
  const cap = input.cap ?? MARKER_CAP;
  if (!Number.isFinite(cap) || cap < 1) {
    throw new RangeError(`marker cap must be a finite number of at least 1, got ${cap}`);
  }
  if (!isPositiveInteger(input.width) || !isPositiveInteger(input.height)) {
    return { markers: [], visited: 0 };
  }
  const { candidates, visited } = candidatesFor(input, cap);
  const placed = place(candidates, input, cap);
  const compact = placed.map((placement) =>
    placed.some((other) => other !== placement && overlaps(placement.full, other.full)),
  );
  const hitBoxes = placed.map((placement, index) =>
    compact[index] === true ? placement.dot : placement.full,
  );
  const labels: Box[] = [];
  const ranked = placed.map((placement, index) => {
    const leftFacing = placement.x / input.width > LEFT_FACING_FROM;
    const box = labelBox(placement, input, leftFacing);
    const labelVisible =
      placement.entry.component.id === input.selectedId ||
      (labels.every((other) => !overlaps(box, other)) &&
        hitBoxes.every((other, otherIndex) => otherIndex === index || !overlaps(box, other)));
    if (labelVisible) labels.push(box);
    const marker: PlannedMarker = {
      component: placement.entry.component,
      x: placement.x / input.width,
      y: placement.y / input.height,
      compact: compact[index] === true,
      labelVisible,
      leftFacing,
    };
    return { rank: placement.entry.rank, marker };
  });
  ranked.sort((left, right) => left.rank - right.rank);
  return { markers: ranked.map((item) => item.marker), visited };
};
