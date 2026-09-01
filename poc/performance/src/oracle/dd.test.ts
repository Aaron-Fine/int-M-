import { describe, expect, it } from 'vitest';

import { ddAdd, ddAddD, ddDiv, ddMul, ddMulD, ddSub, ddToNumber, twoProd, twoSum } from './dd.ts';

const SAMPLES: readonly (readonly [number, number])[] = [
  [1, 1e-17],
  [0.1, 0.2],
  [1e16, 1],
  [Math.PI, -Math.PI],
  [2 ** 53, 1],
  [3.14159, 2.71828],
  [-0.1225611668766535, 0.7448617666197435],
  [2, -2],
  [1e-300, 1e-300],
];

describe('double-double primitives', () => {
  it('reconstructs sums exactly when the rounded sum loses the tail', () => {
    // fl(2^53 + 1) = 2^53; the exact error is the representable integer 1.
    expect(twoSum(2 ** 53, 1)).toEqual({ hi: 2 ** 53, lo: 1 });
    // 1 + 2^-53 is an exact tie between 1 and 1 + 2^-52; ties-to-even keeps 1.
    expect(twoSum(1, 2 ** -53)).toEqual({ hi: 1, lo: 2 ** -53 });
    expect(twoSum(1, 2 ** -52)).toEqual({ hi: 1 + 2 ** -52, lo: 0 });
  });

  it('reconstructs products exactly via Dekker splitting', () => {
    expect(twoProd(3, 7)).toEqual({ hi: 21, lo: 0 });
    // (2^27 + 1)^2 = 2^54 + 2^28 + 1, where the +1 is beyond a double's reach.
    expect(twoProd(2 ** 27 + 1, 2 ** 27 + 1)).toEqual({ hi: 2 ** 54 + 2 ** 28, lo: 1 });
  });

  it('keeps the error term within half an ulp of the rounded result', () => {
    for (const [a, b] of SAMPLES) {
      const sum = twoSum(a, b);
      expect(sum.hi).toBe(a + b);
      expect(Math.abs(sum.lo)).toBeLessThanOrEqual(Number.EPSILON * Math.abs(sum.hi));

      const product = twoProd(a, b);
      expect(product.hi).toBe(a * b);
      expect(Math.abs(product.lo)).toBeLessThanOrEqual(Number.EPSILON * Math.abs(product.hi));
    }
  });

  it('carries tails that a plain double addition drops entirely', () => {
    // 2^53 + 1 is not representable; the dd pair keeps the integer 1.
    expect(ddToNumber(ddAdd({ hi: 2 ** 53, lo: 0 }, { hi: 1, lo: 0 }))).toBe(2 ** 53);
    expect(ddAdd({ hi: 2 ** 53, lo: 0 }, { hi: 1, lo: 0 }).lo).toBe(1);

    const grown = ddAddD({ hi: 1, lo: 1e-20 }, 1e-20);
    expect(grown.hi).toBe(1);
    expect(grown.lo).toBeCloseTo(2e-20, 30);
  });

  it('survives catastrophic cancellation that zeroes doubles', () => {
    const difference = ddSub({ hi: 1, lo: 1e-20 }, { hi: 1, lo: 0 });
    expect(difference.hi).toBe(1e-20);
    expect(difference.lo).toBe(0);
  });

  it('multiplies with the full dd product error term', () => {
    // (2^27 + 1)^2 exactly: the dd square recovers the +1 tail.
    const squared = ddMul({ hi: 2 ** 27 + 1, lo: 0 }, { hi: 2 ** 27 + 1, lo: 0 });
    expect(squared.hi).toBe(2 ** 54 + 2 ** 28);
    expect(squared.lo).toBe(1);

    // 2 * (2^53 + 1) = 2^54 + 2, and the +2 tail survives the exponent shift.
    const doubled = ddMulD({ hi: 2 ** 53, lo: 1 }, 2);
    expect(doubled.hi).toBe(2 ** 54);
    expect(doubled.lo).toBe(2);
  });

  it('divides accurately enough that quotient times divisor returns the dividend', () => {
    for (const [a, b] of [
      [1, 3],
      [1, 7],
      [5, 3],
      [-0.1225611668766535, 0.7448617666197435],
    ] as const) {
      const quotient = ddDiv({ hi: a, lo: 0 }, { hi: b, lo: 0 });
      const roundTrip = ddToNumber(ddMulD(quotient, b));
      expect(Math.abs(roundTrip - a)).toBeLessThan(Math.abs(a) * 1e-30 + 1e-300);
    }
  });
});
