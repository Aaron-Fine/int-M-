import { describe, expect, it } from 'vitest';

import {
  isolatedPeriodOf,
  NO_ISOLATION,
  nextIsolation,
  type IsolationEvent,
  type IsolationState,
} from '../../../src/ui/period-isolation';

const run = (...events: readonly IsolationEvent[]): IsolationState =>
  events.reduce(nextIsolation, NO_ISOLATION);

describe('legend period isolation', () => {
  it('isolates while an entry is hovered or focused, and restores after', () => {
    expect(isolatedPeriodOf(run({ type: 'hover', period: 2 }))).toBe(2);
    expect(
      isolatedPeriodOf(run({ type: 'hover', period: 2 }, { type: 'unhover', period: 2 })),
    ).toBe(undefined);
    expect(isolatedPeriodOf(run({ type: 'focus', period: 4 }))).toBe(4);
    expect(isolatedPeriodOf(run({ type: 'focus', period: 4 }, { type: 'blur', period: 4 }))).toBe(
      undefined,
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

  it('previews another period over the pressed one, then returns to it', () => {
    const pressed = run({ type: 'activate', period: 1 });
    const previewing = nextIsolation(pressed, { type: 'hover', period: 5 });

    expect(isolatedPeriodOf(previewing)).toBe(5);
    expect(isolatedPeriodOf(nextIsolation(previewing, { type: 'unhover', period: 5 }))).toBe(1);
  });

  it('ignores a stale leave event for another entry', () => {
    const state = run({ type: 'hover', period: 2 }, { type: 'unhover', period: 3 });

    expect(isolatedPeriodOf(state)).toBe(2);
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
