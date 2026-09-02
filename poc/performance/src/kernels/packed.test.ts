import { describe, expect, it } from 'vitest';

import {
  PACK_PERIOD_BITS,
  PACK_PERIOD_MAX,
  PACK_STATUS_CODES,
  packStatusPeriod,
  unpackPeriod,
  unpackStatus,
} from './packed.ts';

describe('packed status+period encoding', () => {
  it('round-trips every status with its period', () => {
    for (const status of ['attracting', 'escaped', 'unresolved'] as const) {
      const period = status === 'attracting' ? 7 : 0;
      const word = packStatusPeriod(status, period);
      expect(unpackStatus(word)).toBe(status);
      expect(unpackPeriod(word)).toBe(period);
    }
  });

  it('keeps the maximum representable period round-trippable', () => {
    expect(PACK_PERIOD_MAX).toBe((1 << PACK_PERIOD_BITS) - 1);
    const word = packStatusPeriod('attracting', PACK_PERIOD_MAX);
    expect(unpackStatus(word)).toBe('attracting');
    expect(unpackPeriod(word)).toBe(PACK_PERIOD_MAX);
  });

  it('keeps the status in the high bits and never produces a zero word', () => {
    const word = packStatusPeriod('attracting', 5);
    expect(word >>> PACK_PERIOD_BITS).toBe(PACK_STATUS_CODES.attracting);
    expect(word & PACK_PERIOD_MAX).toBe(5);
    for (const status of ['attracting', 'escaped', 'unresolved'] as const) {
      expect(packStatusPeriod(status, 0)).not.toBe(0);
    }
  });

  it('rejects periods that do not fit and non-attracting periods', () => {
    expect(() => packStatusPeriod('attracting', PACK_PERIOD_MAX + 1)).toThrow();
    expect(() => packStatusPeriod('attracting', -1)).toThrow();
    expect(() => packStatusPeriod('escaped', 3)).toThrow();
    expect(() => packStatusPeriod('unresolved', 3)).toThrow();
  });
});
