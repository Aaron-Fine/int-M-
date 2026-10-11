import { describe, expect, it } from 'vitest';

import {
  classifyInto,
  createOrbitSample,
  OrbitScratch,
  resolveOrbitOptions,
  type OrbitOptions,
  type OrbitSample,
} from '../../../src/domain';

/**
 * Ring-wrap lag scan (opt-in ringWrap option) must match the default modulo
 * kernel on every OrbitSample field. Small maxPeriod values make the history
 * ring wrap many times per orbit, which is where index errors would show.
 */

const POINTS: readonly (readonly [number, number])[] = [
  [-0.75, 0.1],
  [-0.1, 0.65],
  [0.3, 0.5],
  [-1.31, 0],
  [-0.7463, 0.1102],
  [-1.7, 0.02],
  [-1.99, 0],
  [1.5, 1.5],
];

const sampleWith = (cRe: number, cIm: number, options: Partial<OrbitOptions>): OrbitSample => {
  const resolved = resolveOrbitOptions(options);
  const scratch = new OrbitScratch(resolved.maxPeriod);
  const sample = createOrbitSample();
  classifyInto(cRe, cIm, resolved, scratch, sample);
  return { ...sample };
};

describe('ring-wrap lag scan', () => {
  for (const maxPeriod of [2, 5, 32]) {
    it(`matches the default kernel on every sample field (maxPeriod ${maxPeriod})`, () => {
      for (const [cRe, cIm] of POINTS) {
        const base = { maxIterations: 512, maxPeriod };
        expect(sampleWith(cRe, cIm, { ...base, ringWrap: true })).toEqual(
          sampleWith(cRe, cIm, base),
        );
      }
    });
  }

  it('leaves the default resolved options free of ringWrap', () => {
    const resolved = resolveOrbitOptions({ maxIterations: 512, maxPeriod: 32 });
    expect(resolved.ringWrap).toBeUndefined();
  });

  it('rejects a non-boolean ringWrap', () => {
    expect(() =>
      resolveOrbitOptions({ maxIterations: 512, maxPeriod: 32, ringWrap: 1 as unknown as boolean }),
    ).toThrow(RangeError);
  });
});
