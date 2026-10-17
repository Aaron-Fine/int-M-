import { describe, expect, it } from 'vitest';
import {
  armOrder,
  releaseDefaultReps,
  releaseRepsProblem,
} from '../../../tools/benchmark/harness/schedule.ts';

describe('arm order', () => {
  it('keeps the declared order for the cold repetition', () => {
    expect(armOrder(['hook', 'plain', 'previous'], 0)).toEqual(['hook', 'plain', 'previous']);
  });

  it('rotates warm repetitions on the warm index', () => {
    expect(armOrder(['hook', 'plain'], 1)).toEqual(['hook', 'plain']);
    expect(armOrder(['hook', 'plain'], 2)).toEqual(['plain', 'hook']);
    expect(armOrder(['a', 'b', 'c'], 3)).toEqual(['c', 'a', 'b']);
  });

  it.each([2, 3, 4])('leads equally often over the release warm repetitions (%i arms)', (count) => {
    const arms = Array.from({ length: count }, (_, index) => `arm${index}`);
    const reps = releaseDefaultReps(count);
    const leads = new Map(arms.map((arm) => [arm, 0]));
    const positions = new Map(arms.map((arm) => [arm, new Array<number>(count).fill(0)]));
    for (let repetition = 1; repetition < reps; repetition += 1) {
      const order = armOrder(arms, repetition);
      leads.set(order[0] ?? '', (leads.get(order[0] ?? '') ?? 0) + 1);
      order.forEach((arm, index) => {
        const row = positions.get(arm);
        if (row) row[index] = (row[index] ?? 0) + 1;
      });
    }
    expect(new Set(leads.values()).size).toBe(1);
    for (const row of positions.values()) expect(new Set(row).size).toBe(1);
  });
});

describe('release repetitions', () => {
  it('defaults to one cold plus the smallest balanced warm count of at least 21', () => {
    expect(releaseDefaultReps(2)).toBe(23);
    expect(releaseDefaultReps(3)).toBe(22);
    expect(releaseDefaultReps(4)).toBe(25);
  });

  it('keeps the default at or above 22 repetitions', () => {
    for (const count of [2, 3, 4, 5]) expect(releaseDefaultReps(count)).toBeGreaterThanOrEqual(22);
  });

  it('refuses unbalanced or short release counts', () => {
    expect(releaseRepsProblem(23, 2)).toBeUndefined();
    expect(releaseRepsProblem(22, 3)).toBeUndefined();
    expect(releaseRepsProblem(22, 2)).toMatch(/multiple of the 2 arms.*; use --reps 23$/);
    expect(releaseRepsProblem(26, 2)).toMatch(/use --reps 23 or 27$/);
    expect(releaseRepsProblem(21, 3)).toMatch(/at least 21 warm/);
    expect(releaseRepsProblem(20, 1)).toMatch(/at least 21 warm/);
  });
});
