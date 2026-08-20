import { describe, expect, it } from 'vitest';

import { shouldYieldToEventLoop, yieldMaskForQuality } from '../../../src/render/yield-policy';

describe('yieldMaskForQuality', () => {
  it('uses mask 7 at default maxIterations and mask 1 above 512', () => {
    expect(yieldMaskForQuality(512)).toBe(7);
    expect(yieldMaskForQuality(256)).toBe(7);
    expect(yieldMaskForQuality(513)).toBe(1);
    expect(yieldMaskForQuality(1024)).toBe(1);
  });
});

describe('shouldYieldToEventLoop', () => {
  it('shouldYieldToEventLoop_matchesCurrentBitwiseCadence_stride1AndStride8', () => {
    const mask = 7;

    // stride 1, mask 7: yield iff (y & 7) === 7
    for (let y = 0; y < 64; y += 1) {
      expect(shouldYieldToEventLoop(y, 1, mask)).toBe((y & 7) === 7);
    }

    // stride 8, mask 7: on height 1024, 16 yields at coarse steps 7,15,…,127 — NOT every coarse row
    const height = 1024;
    const stride = 8;
    const yieldYs: number[] = [];
    for (let y = 0; y < height; y += stride) {
      if (shouldYieldToEventLoop(y, stride, mask)) {
        yieldYs.push(y);
      }
    }

    const expectedCoarseSteps = Array.from({ length: 16 }, (_, i) => 7 + i * 8);
    expect(yieldYs).toHaveLength(16);
    expect(yieldYs.map((y) => y / stride)).toEqual(expectedCoarseSteps);
    // Not every coarse row (there are 128 coarse rows for height 1024 / stride 8)
    expect(yieldYs).toHaveLength(height / stride / 8);
  });
});
