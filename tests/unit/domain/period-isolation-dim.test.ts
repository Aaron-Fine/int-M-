import { describe, expect, it } from 'vitest';

import {
  dimChannel,
  dimColor,
  ISOLATION_DIM_FACTOR,
  OTHER_PERIODS_COLOR,
  PERIOD_EMPHASIS_PALETTE,
} from '../../../src/domain';

describe('isolation dimming', () => {
  it('scales each channel by the isolation factor and rounds', () => {
    expect(ISOLATION_DIM_FACTOR).toBe(0.12);
    expect(dimChannel(0)).toBe(0);
    expect(dimChannel(255)).toBe(31);
    expect(dimChannel(100)).toBe(12);
    expect(dimChannel(4)).toBe(0);
    expect(dimChannel(5)).toBe(1);
  });

  it('dims every channel but alpha and never brightens', () => {
    expect(dimColor([240, 228, 66, 255])).toEqual([29, 27, 8, 255]);
    expect(dimColor(OTHER_PERIODS_COLOR)).toEqual([22, 22, 22, 255]);
    for (const color of [...PERIOD_EMPHASIS_PALETTE, OTHER_PERIODS_COLOR]) {
      const dimmed = dimColor(color);
      for (let channel = 0; channel < 3; channel += 1) {
        expect(dimmed[channel]).toBeLessThanOrEqual(color[channel] ?? 0);
      }
      expect(dimmed[3]).toBe(color[3]);
    }
  });
});
