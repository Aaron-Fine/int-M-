import { describe, expect, it } from 'vitest';

import {
  PACKED_OUTPUT_REVISION,
  PACK_PERIOD_BITS,
  PACK_PERIOD_MAX,
  PACK_STATUS_CODES,
  packStatusPeriod,
  unpackPeriod,
  unpackStatus,
} from '../../../src/render/packed-semantic';

describe('packed status+period (poc-packed-1.0.0)', () => {
  it('round-trips every production status code', () => {
    // 0 unresolved, 1 escaped, 2 attracting (production semantics).
    for (const status of [0, 1, 2] as const) {
      const word = packStatusPeriod(status, status === 2 ? 5 : 0);
      expect(unpackStatus(word)).toBe(status);
      expect(unpackPeriod(word)).toBe(status === 2 ? 5 : 0);
    }
  });

  it('round-trips periods across the full 24-bit range', () => {
    for (const period of [0, 1, 2, 12, 255, 65536, PACK_PERIOD_MAX]) {
      expect(unpackPeriod(packStatusPeriod(2, period))).toBe(period);
      expect(unpackStatus(packStatusPeriod(2, period))).toBe(2);
    }
  });

  it('places the status in the high bits with 0 reserved', () => {
    expect(packStatusPeriod(1, 0) >>> PACK_PERIOD_BITS).toBe(PACK_STATUS_CODES.escaped);
    expect(packStatusPeriod(2, 7) >>> PACK_PERIOD_BITS).toBe(PACK_STATUS_CODES.attracting);
    expect(packStatusPeriod(0, 0) >>> PACK_PERIOD_BITS).toBe(PACK_STATUS_CODES.unresolved);
    // A zero word is never valid, so uninitialized storage is detectable.
    for (const status of [0, 1, 2] as const) {
      expect(packStatusPeriod(status, 0)).not.toBe(0);
    }
  });

  it('rejects periods that do not fit 24 bits and non-attracting periods', () => {
    expect(() => packStatusPeriod(2, PACK_PERIOD_MAX + 1)).toThrow();
    expect(() => packStatusPeriod(2, -1)).toThrow();
    expect(() => packStatusPeriod(1, 3)).toThrow();
    expect(() => packStatusPeriod(0, 3)).toThrow();
  });

  it('keeps the frozen revision constant', () => {
    expect(PACKED_OUTPUT_REVISION).toBe('poc-packed-1.0.0');
  });

  it('round-trips a full band of words through a Uint32Array view', () => {
    const length = 1024;
    const words = new Uint32Array(length);
    for (let index = 0; index < length; index += 1) {
      const status = (index % 3) as 0 | 1 | 2;
      const period = status === 2 ? index % 33 : 0;
      words[index] = packStatusPeriod(status, period);
    }
    for (let index = 0; index < length; index += 1) {
      const status = (index % 3) as 0 | 1 | 2;
      expect(unpackStatus(words[index]!)).toBe(status);
      expect(unpackPeriod(words[index]!)).toBe(status === 2 ? index % 33 : 0);
    }
  });
});
