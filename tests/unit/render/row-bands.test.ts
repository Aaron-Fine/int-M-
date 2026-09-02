import { describe, expect, it } from 'vitest';

import {
  orderRowBandsForDispatch,
  orderRowBandsCenterOut,
  splitRowBands,
} from '../../../src/render/row-bands';
import type { SemanticBand } from '../../../src/render';

describe('splitRowBands', () => {
  it('splitRowBands(10, 3) remainder-front covers [0, height)', () => {
    expect(splitRowBands(10, 3)).toEqual([
      { y0: 0, y1: 4 },
      { y0: 4, y1: 7 },
      { y0: 7, y1: 10 },
    ]);
  });

  it('splitRowBands(4, 4) yields unit bands', () => {
    expect(splitRowBands(4, 4)).toEqual([
      { y0: 0, y1: 1 },
      { y0: 1, y1: 2 },
      { y0: 2, y1: 3 },
      { y0: 3, y1: 4 },
    ]);
  });

  it('splitRowBands(3, 8) clamps bandCount to height', () => {
    expect(splitRowBands(3, 8)).toEqual([
      { y0: 0, y1: 1 },
      { y0: 1, y1: 2 },
      { y0: 2, y1: 3 },
    ]);
  });

  it('rejects height or bandCount < 1', () => {
    expect(() => splitRowBands(0, 3)).toThrow(RangeError);
    expect(() => splitRowBands(10, 0)).toThrow(RangeError);
    expect(() => splitRowBands(-1, 2)).toThrow(RangeError);
    expect(() => splitRowBands(5, -1)).toThrow(RangeError);
  });
});

describe('band coverage', () => {
  /**
   * Zero-copy invariant: the per-band views must partition the frame rows
   * exactly — sorted, no gaps, no overlap — or a pixel would be missing (or
   * double-owned) in the assembled stable frame.
   */
  const assertBandsCoverFrame = (bands: readonly SemanticBand[], height: number): void => {
    let expectedY0 = 0;
    for (const band of bands) {
      expect(band.y0).toBe(expectedY0);
      expect(band.y1).toBeGreaterThan(band.y0);
      expect(band.y1).toBeLessThanOrEqual(height);
      expectedY0 = band.y1;
    }
    expect(expectedY0).toBe(height);
  };

  it('assembled band views cover the frame exactly for odd heights and remainders', () => {
    for (const height of [1, 2, 5, 9, 11, 641]) {
      for (const bandCount of [1, 3, 8, 16]) {
        const bands = splitRowBands(height, bandCount).map((band) => ({
          y0: band.y0,
          y1: band.y1,
          packedStatusPeriod: new Uint32Array((band.y1 - band.y0) * 8),
          smoothIterationOrMultiplierMagnitude: new Float64Array((band.y1 - band.y0) * 8),
          multiplierAngle: new Float64Array((band.y1 - band.y0) * 8),
        }));
        assertBandsCoverFrame(bands, height);
      }
    }
  });

  it('dispatch-order permutations preserve exact coverage', () => {
    const height = 641;
    const bands = splitRowBands(height, 16);
    for (const order of [
      orderRowBandsCenterOut(bands, height),
      orderRowBandsForDispatch(bands, height, 4),
    ]) {
      expect([...order].sort((a, b) => a - b)).toEqual(bands.map((_, index) => index));
    }
  });
});
