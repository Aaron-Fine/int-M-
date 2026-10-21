import { describe, expect, it } from 'vitest';

import {
  classifyGatedAnalyticInto,
  classifyPeriodFourInto,
  classifyPeriodThreeInto,
  inPeriodFourGate,
  inPeriodThreeGate,
  PERIOD_FOUR_BOXES,
  PERIOD_THREE_BOXES,
  type OrbitSample,
} from '../../../src/domain';
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
    for (const cRe of res) {
      for (const cIm of ims) {
        expectSameAsDispatch(cRe, cIm);
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
