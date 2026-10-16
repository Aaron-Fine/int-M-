import { describe, expect, it } from 'vitest';
import { armOrder } from '../../../tools/benchmark/harness/schedule.ts';

describe('arm order', () => {
  it('rotates so every arm takes every position', () => {
    const arms = ['hook', 'plain', 'previous'];
    const positions = new Map(arms.map((arm) => [arm, new Set<number>()]));
    for (let rep = 0; rep < arms.length; rep += 1) {
      armOrder(arms, rep).forEach((arm, index) => positions.get(arm)?.add(index));
    }
    for (const seen of positions.values()) expect(seen.size).toBe(arms.length);
  });

  it('alternates two arms', () => {
    expect(armOrder(['hook', 'plain'], 0)).toEqual(['hook', 'plain']);
    expect(armOrder(['hook', 'plain'], 1)).toEqual(['plain', 'hook']);
  });
});
