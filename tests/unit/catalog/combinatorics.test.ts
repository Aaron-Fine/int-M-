import { describe, expect, it } from 'vitest';

import {
  angledInternalAddressOf,
  generatedLabel,
  hasExactRayPeriod,
  internalAddressOf,
  kneadingSequence,
} from '../../../src/catalog/combinatorics';
import { COMPONENT_CATALOG } from '../../../src/catalog/components';

const step = (fromPeriod: number, toPeriod: number, numerator: number, denominator: number) => ({
  fromPeriod,
  toPeriod,
  rotation: { numerator, denominator },
});

describe('catalog combinatorics (ADR 0014)', () => {
  it('excludes angles whose period under doubling is a proper divisor', () => {
    expect(hasExactRayPeriod(1, 4)).toBe(true);
    expect(hasExactRayPeriod(5, 4)).toBe(false); // 5/15 = 1/3 has period 2
    expect(hasExactRayPeriod(3, 4)).toBe(true); // 3/15 = 1/5 has period 4
    expect(hasExactRayPeriod(1365, 12)).toBe(false); // 1365/4095 = 1/3
    expect(hasExactRayPeriod(1, 12)).toBe(true);
  });

  it('computes kneading sequences', () => {
    expect(kneadingSequence(1, 2)).toBe('1*');
    expect(kneadingSequence(1, 3)).toBe('11*');
    expect(kneadingSequence(3, 3)).toBe('10*');
    expect(kneadingSequence(1, 5)).toBe('1111*');
    expect(kneadingSequence(3, 5)).toBe('1110*');
  });

  it('derives the addresses the generator wrote for every curated entry', () => {
    for (const component of COMPONENT_CATALOG) {
      const lower = component.characteristicRays?.[0].numerator ?? 0;
      expect(internalAddressOf(lower, component.period), component.id).toEqual(
        component.internalAddress,
      );
      if (component.period > 1) {
        expect(angledInternalAddressOf(lower, component.period), component.id).toEqual(
          component.angledInternalAddress,
        );
      }
    }
  });

  it('gives the angled addresses of known higher-period components', () => {
    // As tools/catalog_combinatorics.py computes them from Lavaurs' pairs and tuned sub-wakes.
    expect(angledInternalAddressOf(1, 5)).toEqual([step(1, 5, 1, 5)]);
    expect(angledInternalAddressOf(22, 6)).toEqual([step(1, 2, 1, 2), step(2, 6, 1, 3)]);
    expect(angledInternalAddressOf(26, 6)).toEqual([
      step(1, 2, 1, 2),
      step(2, 4, 1, 2),
      step(4, 6, 1, 2),
    ]);
  });

  it('labels a component by its period and both rays', () => {
    expect(generatedLabel(4, 6, 9)).toBe('Period 4, rays 6/15 and 9/15');
    expect(generatedLabel(12, 2047, 2048)).toBe('Period 12, rays 2047/4095 and 2048/4095');
  });
});
