import { describe, expect, it } from 'vitest';

import {
  isolatedPeriodOf,
  NO_ISOLATION,
  outlinedPeriodOf,
  nextDroppedPeriod,
  nextIsolation,
  type IsolationEvent,
  type IsolationState,
} from '../../../src/ui/period-isolation';

const run = (...events: readonly IsolationEvent[]): IsolationState =>
  events.reduce(nextIsolation, NO_ISOLATION);

describe('legend period isolation', () => {
  it('outlines, never isolates, while an entry is hovered or focused', () => {
    expect(outlinedPeriodOf(run({ type: 'hover', period: 2 }))).toBe(2);
    expect(isolatedPeriodOf(run({ type: 'hover', period: 2 }))).toBeUndefined();
    expect(
      outlinedPeriodOf(run({ type: 'hover', period: 2 }, { type: 'unhover', period: 2 })),
    ).toBe(undefined);
    expect(outlinedPeriodOf(run({ type: 'focus', period: 4 }))).toBe(4);
    expect(isolatedPeriodOf(run({ type: 'focus', period: 4 }))).toBeUndefined();
    expect(outlinedPeriodOf(run({ type: 'focus', period: 4 }, { type: 'blur', period: 4 }))).toBe(
      undefined,
    );
  });

  it('prefers the hovered entry over the focused one for the outline', () => {
    expect(outlinedPeriodOf(run({ type: 'focus', period: 1 }, { type: 'hover', period: 3 }))).toBe(
      3,
    );
  });

  it('keeps an activated entry isolated after focus leaves it', () => {
    const state = run(
      { type: 'focus', period: 1 },
      { type: 'activate', period: 1 },
      { type: 'blur', period: 1 },
    );

    expect(state.pressed).toBe(1);
    expect(isolatedPeriodOf(state)).toBe(1);
  });

  it('restores the full view on a second activation, focus and hover included', () => {
    const state = run(
      { type: 'hover', period: 1 },
      { type: 'focus', period: 1 },
      { type: 'activate', period: 1 },
      { type: 'activate', period: 1 },
    );

    expect(state).toEqual(NO_ISOLATION);
    expect(isolatedPeriodOf(state)).toBeUndefined();
  });

  it('toggles on a tap (focus then activation) and off on the next tap', () => {
    const tapped = run({ type: 'focus', period: 3 }, { type: 'activate', period: 3 });
    expect(isolatedPeriodOf(tapped)).toBe(3);
    expect(
      isolatedPeriodOf(nextIsolation(tapped, { type: 'activate', period: 3 })),
    ).toBeUndefined();
  });

  it('restores on Escape while the entry keeps focus', () => {
    const state = run(
      { type: 'focus', period: 2 },
      { type: 'activate', period: 2 },
      { type: 'escape' },
    );

    expect(isolatedPeriodOf(state)).toBeUndefined();
    expect(isolatedPeriodOf(nextIsolation(state, { type: 'activate', period: 2 }))).toBe(2);
  });

  it('outlines another period over the pressed one, which stays isolated', () => {
    const pressed = run({ type: 'activate', period: 1 });
    const previewing = nextIsolation(pressed, { type: 'hover', period: 5 });

    expect(isolatedPeriodOf(previewing)).toBe(1);
    expect(outlinedPeriodOf(previewing)).toBe(5);
    expect(outlinedPeriodOf(nextIsolation(previewing, { type: 'unhover', period: 5 }))).toBe(
      undefined,
    );
  });

  it('does not outline the isolated period itself', () => {
    const state = run({ type: 'hover', period: 2 }, { type: 'activate', period: 2 });

    expect(isolatedPeriodOf(state)).toBe(2);
    expect(outlinedPeriodOf(state)).toBeUndefined();
  });

  it('ignores a stale leave event for another entry', () => {
    const state = run({ type: 'hover', period: 2 }, { type: 'unhover', period: 3 });

    expect(outlinedPeriodOf(state)).toBe(2);
  });

  it('resets on a view change and drops periods a stable key no longer lists', () => {
    const state = run({ type: 'activate', period: 4 }, { type: 'focus', period: 2 });

    expect(nextIsolation(state, { type: 'reset' })).toEqual(NO_ISOLATION);
    expect(nextIsolation(state, { type: 'available', periods: [1, 2, 3], final: true })).toEqual({
      pressed: undefined,
      hovered: undefined,
      focused: 2,
    });
  });

  it('keeps a pressed isolation through a coarse frame that lacks the period, then clears it on a stable frame without it', () => {
    const pressed = run({ type: 'activate', period: 4 }, { type: 'hover', period: 4 });
    const coarse = nextIsolation(pressed, { type: 'available', periods: [1, 2], final: false });

    expect(coarse).toEqual({ pressed: 4, hovered: undefined, focused: undefined });
    expect(isolatedPeriodOf(coarse)).toBe(4);
    const stableWithIt = nextIsolation(coarse, {
      type: 'available',
      periods: [1, 2, 4],
      final: true,
    });
    expect(isolatedPeriodOf(stableWithIt)).toBe(4);
    const stableWithout = nextIsolation(coarse, {
      type: 'available',
      periods: [1, 2, 3],
      final: true,
    });
    expect(isolatedPeriodOf(stableWithout)).toBeUndefined();
  });
});

describe('dropped-isolation note', () => {
  /** Applies events, tracking the note the way the legend does. */
  const note = (...events: readonly IsolationEvent[]): number | undefined => {
    let state = NO_ISOLATION;
    let dropped: number | undefined;
    for (const event of events) {
      const next = nextIsolation(state, event);
      dropped = nextDroppedPeriod(dropped, state, next, event);
      state = next;
    }
    return dropped;
  };
  const pressed: IsolationEvent[] = [
    { type: 'available', periods: [1, 2], final: true },
    { type: 'activate', period: 2 },
  ];
  const drop: IsolationEvent = { type: 'available', periods: [1], final: true };

  it('is set by a stable frame that drops the pressed period, not by a coarse one', () => {
    expect(note(...pressed, { type: 'available', periods: [1], final: false })).toBeUndefined();
    expect(note(...pressed, drop)).toBe(2);
  });

  it('survives unrelated stable frames, previews and pointer leaving', () => {
    expect(note(...pressed, drop, { type: 'available', periods: [1], final: true })).toBe(2);
    expect(note(...pressed, drop, { type: 'unhover', period: 1 })).toBe(2);
    expect(note(...pressed, drop, { type: 'hover', period: 1 })).toBe(2);
    expect(note(...pressed, drop, { type: 'focus', period: 1 })).toBe(2);
  });

  it('clears on the next isolation of any period, Escape or an interior-view change', () => {
    for (const event of [
      { type: 'activate', period: 1 },
      { type: 'escape' },
      { type: 'reset' },
    ] as const) {
      expect(note(...pressed, drop, event), event.type).toBeUndefined();
    }
  });

  it('clears when a stable frame lists the period again', () => {
    expect(note(...pressed, drop, { type: 'available', periods: [1, 2], final: true })).toBe(
      undefined,
    );
  });
});
