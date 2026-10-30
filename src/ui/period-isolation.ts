/**
 * Legend isolation (MI-UX-018; owner decision 2026-10-17, revised by UI
 * review finding 5 on 2026-10-29): activating an emphasized period's legend
 * entry dims every pixel not of that period, and hovering or focusing one
 * only outlines it. Pure state so the rules are unit-tested; the legend feeds
 * it DOM events and the renderer recolors with the result.
 *
 * - Hover (mouse only) and keyboard focus preview a period while they last:
 *   its regions are outlined and nothing is dimmed, so a pointer that merely
 *   passes over the legend never changes what the image shows.
 * - Activation (click, Enter, Space, or a tap) toggles a persistent
 *   isolation; activating the pressed entry again, or Escape, restores the
 *   full view.
 * - A view change resets everything. Each new frame drops hover and focus
 *   on periods its key no longer lists (their buttons are gone). A pressed
 *   period is dropped only by a stable frame that does not list it: a coarse
 *   preview routinely lacks small periods, so the isolation survives it, and
 *   until the stable frame arrives the raster shows only dimmed pixels.
 */

export interface IsolationState {
  /** The isolation, shown as `aria-pressed="true"`. */
  readonly pressed: number | undefined;
  readonly hovered: number | undefined;
  readonly focused: number | undefined;
}

export const NO_ISOLATION: IsolationState = Object.freeze({
  pressed: undefined,
  hovered: undefined,
  focused: undefined,
});

export type IsolationEvent =
  | {
      readonly type: 'hover' | 'unhover' | 'focus' | 'blur' | 'activate';
      readonly period: number;
    }
  | { readonly type: 'escape' | 'reset' }
  | {
      readonly type: 'available';
      readonly periods: readonly number[];
      /** True for a stable frame: only then can a pressed period be dropped. */
      readonly final: boolean;
    };

const unless = (slot: number | undefined, period: number): number | undefined =>
  slot === period ? undefined : slot;

const keepListed = (slot: number | undefined, periods: readonly number[]): number | undefined =>
  slot !== undefined && periods.includes(slot) ? slot : undefined;

export const nextIsolation = (state: IsolationState, event: IsolationEvent): IsolationState => {
  switch (event.type) {
    case 'hover':
      return { ...state, hovered: event.period };
    case 'unhover':
      return { ...state, hovered: unless(state.hovered, event.period) };
    case 'focus':
      return { ...state, focused: event.period };
    case 'blur':
      return { ...state, focused: unless(state.focused, event.period) };
    case 'activate':
      return state.pressed === event.period ? NO_ISOLATION : { ...state, pressed: event.period };
    case 'escape':
    case 'reset':
      return NO_ISOLATION;
    case 'available':
      return {
        pressed: event.final ? keepListed(state.pressed, event.periods) : state.pressed,
        hovered: keepListed(state.hovered, event.periods),
        focused: keepListed(state.focused, event.periods),
      };
  }
};

/** The period the raster isolates: the pressed entry only. */
export const isolatedPeriodOf = (state: IsolationState): number | undefined => state.pressed;

/**
 * The period the raster outlines: a hover, else a focus preview. None when it
 * is the isolated period, which already stands out.
 */
export const outlinedPeriodOf = (state: IsolationState): number | undefined => {
  const preview = state.hovered ?? state.focused;
  return preview === state.pressed ? undefined : preview;
};

/**
 * The period named by the "no longer among the five largest" note, after
 * `event`. A stable frame that drops a pressed period sets it; a new
 * isolation, Escape, a view change, or a stable frame listing the period
 * again clears it. Previews (hover, focus) leave it.
 */
export const nextDroppedPeriod = (
  dropped: number | undefined,
  before: IsolationState,
  after: IsolationState,
  event: IsolationEvent,
): number | undefined => {
  switch (event.type) {
    case 'available':
      if (!event.final) return dropped;
      if (before.pressed !== undefined && after.pressed === undefined) return before.pressed;
      return dropped !== undefined && event.periods.includes(dropped) ? undefined : dropped;
    case 'activate':
    case 'escape':
    case 'reset':
      return undefined;
    case 'hover':
    case 'focus':
    case 'unhover':
    case 'blur':
      return dropped;
  }
};
