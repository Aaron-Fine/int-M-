/**
 * Legend isolation (MI-UX-018, owner decision 2026-10-17): hovering,
 * focusing or activating an emphasized period's legend entry dims every
 * pixel not of that period. Pure state so the rules are unit-tested; the
 * legend feeds it DOM events and the renderer recolors with the result.
 *
 * - Hover (mouse only) and keyboard focus isolate while they last.
 * - Activation (click, Enter, Space, or a tap) toggles a persistent
 *   isolation; activating the pressed entry again, or Escape, restores the
 *   full view, including any hover or focus isolation in effect.
 * - A view change resets everything. Each new frame drops hover and focus
 *   on periods its key no longer lists (their buttons are gone). A pressed
 *   period is dropped only by a stable frame that does not list it: a coarse
 *   preview routinely lacks small periods, so the isolation survives it, and
 *   until the stable frame arrives the raster shows only dimmed pixels.
 */

export interface IsolationState {
  /** The persistent isolation, shown as `aria-pressed="true"`. */
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

/** The period the raster isolates: a hover or focus preview, else the pressed entry. */
export const isolatedPeriodOf = (state: IsolationState): number | undefined =>
  state.hovered ?? state.focused ?? state.pressed;
