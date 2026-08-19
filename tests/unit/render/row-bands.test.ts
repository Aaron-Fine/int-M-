import { describe, expect, it } from 'vitest';

import { copyBandIntoFrame, splitRowBands } from '../../../src/render/row-bands';
import type { SemanticFrame } from '../../../src/render';

const emptyFrame = (width: number, height: number): SemanticFrame => {
  const pixelCount = width * height;
  return {
    stage: 'stable',
    size: { width, height },
    sampleStride: 1,
    status: new Uint8Array(pixelCount),
    period: new Uint32Array(pixelCount),
    smoothIterationOrMultiplierMagnitude: new Float64Array(pixelCount),
    multiplierAngle: new Float64Array(pixelCount),
    progress: 1,
  };
};

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

describe('copyBandIntoFrame', () => {
  it('copyBandIntoFrame_oddHeightLastRow', () => {
    const width = 3;
    const height = 5;
    const frame = emptyFrame(width, height);
    const y0 = 4;
    const y1 = 5;
    const length = (y1 - y0) * width;

    const status = new Uint8Array(length);
    const period = new Uint32Array(length);
    const smoothIterationOrMultiplierMagnitude = new Float64Array(length);
    const multiplierAngle = new Float64Array(length);
    for (let i = 0; i < length; i += 1) {
      status[i] = 2;
      period[i] = 7 + i;
      smoothIterationOrMultiplierMagnitude[i] = 1.5 + i;
      multiplierAngle[i] = 0.25 * i;
    }

    copyBandIntoFrame(frame, {
      y0,
      y1,
      status,
      period,
      smoothIterationOrMultiplierMagnitude,
      multiplierAngle,
    });

    const offset = y0 * width;
    expect(frame.status.subarray(offset, offset + length)).toEqual(status);
    expect(frame.period.subarray(offset, offset + length)).toEqual(period);
    expect(frame.smoothIterationOrMultiplierMagnitude.subarray(offset, offset + length)).toEqual(
      smoothIterationOrMultiplierMagnitude,
    );
    expect(frame.multiplierAngle.subarray(offset, offset + length)).toEqual(multiplierAngle);

    // Earlier rows remain untouched zeros
    expect(frame.status.subarray(0, offset)).toEqual(new Uint8Array(offset));
  });
});
