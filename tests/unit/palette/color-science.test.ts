import { describe, expect, it } from 'vitest';

import {
  ciede2000Lab,
  composite,
  contrastRatio,
  deltaE,
  relativeLuminance,
  simulate,
  toLab,
  VISIONS,
} from './color-science';

describe('CIEDE2000', () => {
  // Sharma, Wu and Dalal (2005), supplementary test data, pairs 1, 7, 17, 19, 25, 26, 34.
  const pairs: readonly (readonly [
    readonly [number, number, number],
    readonly [number, number, number],
    number,
  ])[] = [
    [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
    [[50, 0, 0], [50, -1, 2], 2.3669],
    [[50, 2.5, 0], [73, 25, -18], 27.1492],
    [[50, 2.49, -0.001], [50, -2.49, 0.0011], 7.2195],
    [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
    [[63.0109, -31.0961, -5.8663], [62.8187, -29.7946, -4.0864], 1.263],
    [[2.0776, 0.0795, -1.135], [0.9033, -0.0636, -0.5514], 0.9082],
  ];

  it('reproduces the published test pairs to four decimals', () => {
    for (const [first, second, expected] of pairs) {
      expect(ciede2000Lab(first, second)).toBeCloseTo(expected, 4);
      expect(ciede2000Lab(second, first)).toBeCloseTo(expected, 4);
    }
  });

  it('maps sRGB white, black and mid gray to their CIELAB lightness', () => {
    expect(toLab([255, 255, 255])[0]).toBeCloseTo(100, 3);
    expect(toLab([0, 0, 0])[0]).toBeCloseTo(0, 6);
    expect(toLab([128, 128, 128])[0]).toBeCloseTo(53.585, 2);
  });
});

describe('Machado 2009 colour-vision simulation (severity 1.0)', () => {
  it('leaves neutral grays and normal vision unchanged', () => {
    for (const vision of VISIONS) {
      for (const level of [0, 84, 108, 187, 255]) {
        expect(simulate([level, level, level], vision)).toEqual([level, level, level]);
      }
    }
    expect(simulate([213, 94, 0], 'normal')).toEqual([213, 94, 0]);
  });

  it('collapses red-green contrast under protan and deutan, blue-yellow under tritan', () => {
    expect(simulate([255, 0, 0], 'protan')).toEqual([109, 95, 0]);
    expect(simulate([255, 0, 0], 'deutan')).toEqual([163, 144, 0]);
    expect(simulate([0, 0, 255], 'tritan')).toEqual([0, 107, 150]);
    expect(deltaE([255, 0, 0], [0, 128, 0], 'deutan')).toBeLessThan(
      deltaE([255, 0, 0], [0, 128, 0], 'normal'),
    );
  });
});

describe('WCAG contrast', () => {
  it('computes the extreme ratio and compositing', () => {
    expect(relativeLuminance([255, 255, 255])).toBeCloseTo(1, 6);
    expect(contrastRatio([255, 255, 255], [0, 0, 0])).toBeCloseTo(21, 6);
    expect(composite([0, 0, 0], 0.5, [255, 255, 255])).toEqual([127.5, 127.5, 127.5]);
  });
});
