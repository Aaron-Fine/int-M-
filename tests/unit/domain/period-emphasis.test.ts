import { describe, expect, it } from 'vitest';

import {
  buildPeriodKey,
  colorForPeriod,
  EMPTY_PERIOD_KEY,
  OTHER_PERIODS_COLOR,
  PERIOD_EMPHASIS_LIMIT,
  PERIOD_EMPHASIS_PALETTE,
} from '../../../src/domain';
import { PACK_PERIOD_MAX } from '../../../src/render/packed-semantic';

const histogram = (entries: readonly (readonly [number, number])[]): Map<number, number> =>
  new Map(entries);

describe('period emphasis key', () => {
  it('emphasizes at most five periods, chosen by area and coloured in ascending period order', () => {
    const key = buildPeriodKey(
      histogram([
        [1, 9000],
        [2, 300],
        [3, 50],
        [4, 4000],
        [5, 7],
        [8, 120],
        [16, 60],
      ]),
    );

    expect(PERIOD_EMPHASIS_LIMIT).toBe(5);
    expect(key.emphasized.map((entry) => entry.period)).toEqual([1, 2, 4, 8, 16]);
    expect(key.emphasized.map((entry) => entry.color)).toEqual(PERIOD_EMPHASIS_PALETTE);
    expect(key.emphasized.map((entry) => entry.pixelCount)).toEqual([9000, 300, 4000, 120, 60]);
    expect(key.others).toEqual([
      { period: 3, pixelCount: 50 },
      { period: 5, pixelCount: 7 },
    ]);
    expect(key.otherPeriodCount).toBe(2);
    expect(key.otherPixelCount).toBe(57);
    expect(key.attractingPixelCount).toBe(13537);
    expect(colorForPeriod(3, key)).toEqual(OTHER_PERIODS_COLOR);
    expect(colorForPeriod(16, key)).toEqual(PERIOD_EMPHASIS_PALETTE[4]);
  });

  it('gives the same colours to the same emphasized set whatever its area order', () => {
    const first = buildPeriodKey(
      histogram([
        [1, 10],
        [2, 20],
        [3, 30],
        [4, 40],
        [5, 50],
      ]),
    );
    const second = buildPeriodKey(
      histogram([
        [5, 10],
        [4, 20],
        [3, 30],
        [2, 40],
        [1, 50],
      ]),
    );

    expect(first.emphasized.map((entry) => [entry.period, entry.color])).toEqual(
      second.emphasized.map((entry) => [entry.period, entry.color]),
    );
  });

  it('breaks area ties toward the lower period, independent of insertion order', () => {
    const tied: (readonly [number, number])[] = [7, 6, 5, 4, 3, 2].map((period) => [period, 100]);
    const forward = buildPeriodKey(histogram(tied));
    const reverse = buildPeriodKey(histogram([...tied].reverse()));

    expect(forward.emphasized.map((entry) => entry.period)).toEqual([2, 3, 4, 5, 6]);
    expect(reverse).toEqual(forward);
    expect(forward.otherPeriodCount).toBe(1);
    expect(colorForPeriod(7, forward)).toEqual(OTHER_PERIODS_COLOR);
  });

  it('describes a frame with no attracting-cycle pixels as an empty key', () => {
    expect(buildPeriodKey(new Map())).toEqual(EMPTY_PERIOD_KEY);
    expect(buildPeriodKey(histogram([[3, 0]]))).toEqual(EMPTY_PERIOD_KEY);
    expect(colorForPeriod(1, EMPTY_PERIOD_KEY)).toEqual(OTHER_PERIODS_COLOR);
  });

  it('gives a frame with exactly one period the first palette colour and no other periods', () => {
    const key = buildPeriodKey(histogram([[3, 42]]));

    expect(key).toEqual({
      emphasized: [{ period: 3, color: PERIOD_EMPHASIS_PALETTE[0], pixelCount: 42 }],
      others: [],
      otherPeriodCount: 0,
      otherPixelCount: 0,
      attractingPixelCount: 42,
    });
  });

  it('ranks PACK_PERIOD_MAX like any other period', () => {
    const key = buildPeriodKey(
      histogram([
        [1, 5],
        [PACK_PERIOD_MAX, 9],
      ]),
    );

    expect(key.emphasized.map((entry) => entry.period)).toEqual([1, PACK_PERIOD_MAX]);
    expect(colorForPeriod(PACK_PERIOD_MAX, key)).toEqual(PERIOD_EMPHASIS_PALETTE[1]);
  });

  it('ranks a period past PACK_PERIOD_MAX deterministically, without throwing', () => {
    const entries: readonly (readonly [number, number])[] = [
      [PACK_PERIOD_MAX + 1, 9],
      [1, 5],
    ];
    const forward = buildPeriodKey(histogram(entries));
    const reverse = buildPeriodKey(histogram([...entries].reverse()));

    expect(forward.emphasized.map((entry) => entry.period)).toEqual([1, PACK_PERIOD_MAX + 1]);
    expect(colorForPeriod(PACK_PERIOD_MAX + 1, forward)).toEqual(PERIOD_EMPHASIS_PALETTE[1]);
    expect(reverse).toEqual(forward);
  });

  it('ignores keys that are not integers of at least 1, even with the largest area', () => {
    const key = buildPeriodKey(
      histogram([
        [0, 100000],
        [-2, 90000],
        [1.5, 80000],
        [Number.NaN, 70000],
        [Number.POSITIVE_INFINITY, 60000],
        [1, 5],
        [2, 9],
      ]),
    );

    expect(key.emphasized.map((entry) => entry.period)).toEqual([1, 2]);
    expect(key.emphasized.map((entry) => entry.color)).toEqual(PERIOD_EMPHASIS_PALETTE.slice(0, 2));
    expect(key.otherPeriodCount).toBe(0);
    expect(key.attractingPixelCount).toBe(14);
    expect(colorForPeriod(0, key)).toEqual(OTHER_PERIODS_COLOR);
  });
});
