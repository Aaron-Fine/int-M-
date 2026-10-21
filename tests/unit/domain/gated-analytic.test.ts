import { describe, expect, it } from 'vitest';

import {
  classifyGatedAnalyticInto,
  classifyPeriodFourInto,
  classifyPeriodThreeInto,
  inPeriodFourGate,
  inPeriodThreeGate,
  PERIOD_FOUR_BOXES,
  PERIOD_THREE_BOXES,
  PERIOD_THREE_HULL,
  type OrbitSample,
} from '../../../src/domain';
import {
  fillGateWindows,
  GATE_WINDOW_COUNT,
  P3_MAX,
  P3_MIN,
  P4_AXIS_MAX,
  P4_AXIS_MIN,
  P4_MAX,
  P4_MIN,
} from '../../../src/domain/analytic-gate-windows';
import {
  BULB_SATELLITE_BOX,
  CARDIOID_SATELLITE_BOX,
  COMPLEX_PRIMITIVE_BOX,
  REAL_PRIMITIVE_BOX,
} from '../../../src/domain/period-four-gate';
import { AIRPLANE_BOX, RABBIT_BOX } from '../../../src/domain/period-three-gate';
import { sentinelSample, stepUlps } from './analytic-test-helpers';

/**
 * classifyGatedAnalyticInto is the kernels' single analytic period-3/period-4
 * call (ADR 0010 amendment of 2026-10-20). It must give exactly the answer
 * and the record of the gated dispatch the kernels used before: the period-3
 * closed form inside the period-3 gate, else the period-4 solve inside the
 * period-4 gate, else a refusal that leaves the record untouched.
 */
const dispatch = (cRe: number, cIm: number, out: OrbitSample): boolean =>
  inPeriodThreeGate(cRe, cIm)
    ? classifyPeriodThreeInto(cRe, cIm, out)
    : inPeriodFourGate(cRe, cIm) && classifyPeriodFourInto(cRe, cIm, out);

const expectSameAsDispatch = (cRe: number, cIm: number): boolean => {
  const expected = sentinelSample();
  const actual = sentinelSample();
  const accepted = dispatch(cRe, cIm, expected);
  expect(classifyGatedAnalyticInto(cRe, cIm, actual)).toBe(accepted);
  // Equal records, field by field and bit for bit (Object.is tells -0 from 0).
  for (const key of Object.keys(expected) as (keyof OrbitSample)[]) {
    expect(Object.is(actual[key], expected[key])).toBe(true);
  }
  return accepted;
};

/** Re c and Im c values at and one ulp around every box edge, plus specials. */
const edgePoints = (): { res: number[]; ims: number[] } => {
  const res = [-2.2, -1.6, -0.9, 0, -0, 0.3, 4.5, Number.NaN];
  const ims = [0, -0, 0.3, 0.9, 1.2, Number.NaN];
  for (const infinity of [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    res.push(infinity);
    ims.push(infinity);
  }
  for (const box of [...PERIOD_THREE_BOXES, ...PERIOD_FOUR_BOXES]) {
    for (const value of [box.reMin, box.reMax]) {
      res.push(stepUlps(value, -1), value, stepUlps(value, 1));
    }
    res.push(0.5 * (box.reMin + box.reMax));
    for (const value of [box.absImMin, box.absImMax]) {
      for (const v of value === 0
        ? [0, 5e-324]
        : [stepUlps(value, -1), value, stepUlps(value, 1)]) {
        ims.push(v, -v);
      }
    }
    ims.push(0.5 * (box.absImMin + box.absImMax));
  }
  return { res, ims };
};

/** True when the closed |Im c| bands of two boxes share no value. */
const bandsDisjoint = (a: { absImMin: number; absImMax: number }, b: typeof a): boolean =>
  a.absImMax < b.absImMin || b.absImMax < a.absImMin;

/**
 * fillGateWindows picks at most one box per gate from a chain of |Im c| band
 * tests, which is exact only under these preconditions (module comment of
 * src/domain/analytic-gate-windows.ts).
 */
describe('gate window preconditions', () => {
  it('has disjoint period-3 bands, every box inside the period-3 hull', () => {
    expect(bandsDisjoint(RABBIT_BOX, AIRPLANE_BOX)).toBe(true);
    for (const box of PERIOD_THREE_BOXES) {
      expect(box.reMin).toBeGreaterThanOrEqual(PERIOD_THREE_HULL.reMin);
      expect(box.reMax).toBeLessThanOrEqual(PERIOD_THREE_HULL.reMax);
      expect(box.absImMin).toBeGreaterThanOrEqual(PERIOD_THREE_HULL.absImMin);
      expect(box.absImMax).toBeLessThanOrEqual(PERIOD_THREE_HULL.absImMax);
    }
  });

  it('has off-axis period-4 bands disjoint from each other and from the axis band', () => {
    expect(bandsDisjoint(CARDIOID_SATELLITE_BOX, COMPLEX_PRIMITIVE_BOX)).toBe(true);
    expect(bandsDisjoint(CARDIOID_SATELLITE_BOX, BULB_SATELLITE_BOX)).toBe(true);
    expect(bandsDisjoint(COMPLEX_PRIMITIVE_BOX, BULB_SATELLITE_BOX)).toBe(true);
  });

  it('has the real primitive band inside the 1/2 satellite band, both reaching the axis', () => {
    expect(BULB_SATELLITE_BOX.absImMin).toBe(0);
    expect(REAL_PRIMITIVE_BOX.absImMin).toBe(0);
    expect(REAL_PRIMITIVE_BOX.absImMax).toBeLessThanOrEqual(BULB_SATELLITE_BOX.absImMax);
  });
});

describe('classifyGatedAnalyticInto', () => {
  it('matches the gated dispatch on a grid over every box, accepting in both paths', () => {
    let accepted3 = 0;
    let accepted4 = 0;
    for (const box of [...PERIOD_THREE_BOXES, ...PERIOD_FOUR_BOXES]) {
      const imMin = box.absImMin;
      const imMax = box.absImMax;
      for (let i = 0; i <= 40; i += 1) {
        const re = box.reMin + ((box.reMax - box.reMin) * i) / 40;
        for (let j = 0; j <= 40; j += 1) {
          const im = imMin + ((imMax - imMin) * j) / 40;
          for (const cIm of [im, -im]) {
            if (expectSameAsDispatch(re, cIm)) {
              if (inPeriodThreeGate(re, cIm)) accepted3 += 1;
              else accepted4 += 1;
            }
          }
        }
      }
    }
    expect(accepted3).toBeGreaterThan(1000);
    expect(accepted4).toBeGreaterThan(1000);
  });

  it('matches the gated dispatch at every box edge, signed zeros, NaN and infinities', () => {
    const { res, ims } = edgePoints();
    // Im c outer and inner: the gate windows are cached on Im c, so both
    // repeated and alternating Im c must give the dispatch's answer.
    for (const cRe of res) {
      for (const cIm of ims) expectSameAsDispatch(cRe, cIm);
    }
    for (const cIm of ims) {
      for (const cRe of res) expectSameAsDispatch(cRe, cIm);
    }
  });

  it('reads each gate as Re c windows of its row, exactly (fillGateWindows)', () => {
    const { res, ims } = edgePoints();
    for (let i = 0; i < 200; i += 1) res.push(-2.1 + (2.4 * (i + 0.5)) / 200);
    for (let j = 0; j < 200; j += 1) ims.push(-1.1 + (2.2 * (j + 0.5)) / 200);
    const windows = new Float64Array(GATE_WINDOW_COUNT);
    for (const cIm of ims) {
      fillGateWindows(cIm, windows);
      const inside = (cRe: number, min: number, max: number): boolean =>
        cRe >= (windows[min] ?? Number.NaN) && cRe <= (windows[max] ?? Number.NaN);
      for (const cRe of res) {
        expect(inside(cRe, P3_MIN, P3_MAX)).toBe(inPeriodThreeGate(cRe, cIm));
        expect(inside(cRe, P4_MIN, P4_MAX) || inside(cRe, P4_AXIS_MIN, P4_AXIS_MAX)).toBe(
          inPeriodFourGate(cRe, cIm),
        );
      }
    }
  });

  it('matches the gated dispatch on a coarse grid over the plane', () => {
    for (let i = 0; i < 160; i += 1) {
      const re = -2.2 + (2.8 * (i + 0.5)) / 160;
      for (let j = 0; j < 160; j += 1) {
        expectSameAsDispatch(re, -1.3 + (2.6 * (j + 0.5)) / 160);
      }
    }
  });
});
