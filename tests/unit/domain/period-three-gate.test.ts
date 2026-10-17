import { describe, expect, it } from 'vitest';

import {
  AIRPLANE_BOX,
  classifyPeriodThreeInto,
  createOrbitSample,
  inPeriodThreeGate,
  PERIOD_THREE_BOXES,
  PERIOD_THREE_HULL,
  RABBIT_BOX,
} from '../../../src/domain';

/**
 * The gate decides only whether the closed form is tried, so it must
 * contain every parameter the closed form accepts (ADR 0010). Measured on a
 * dense grid and along every box edge; not a proof.
 */
describe('period-3 gate', () => {
  it('has a hull equal to the bounding box of its boxes', () => {
    expect(PERIOD_THREE_HULL.reMin).toBe(Math.min(...PERIOD_THREE_BOXES.map((b) => b.reMin)));
    expect(PERIOD_THREE_HULL.reMax).toBe(Math.max(...PERIOD_THREE_BOXES.map((b) => b.reMax)));
    expect(PERIOD_THREE_HULL.absImMin).toBe(0);
    expect(PERIOD_THREE_HULL.absImMax).toBe(Math.max(...PERIOD_THREE_BOXES.map((b) => b.absImMax)));
  });

  it('agrees with a plain loop over PERIOD_THREE_BOXES on a grid', () => {
    const inAnyBox = (re: number, im: number): boolean =>
      PERIOD_THREE_BOXES.some(
        (box) =>
          re >= box.reMin &&
          re <= box.reMax &&
          Math.abs(im) >= box.absImMin &&
          Math.abs(im) <= box.absImMax,
      );
    for (let i = 0; i < 400; i += 1) {
      const re = -2 + (2.2 * (i + 0.5)) / 400;
      for (let j = 0; j < 400; j += 1) {
        const im = -1.1 + (2.2 * (j + 0.5)) / 400;
        expect(inPeriodThreeGate(re, im)).toBe(inAnyBox(re, im));
      }
    }
  });

  it('reduces to one Re c window per row (the row kernel form)', () => {
    // TriggeredRowKernel.classifyRow evaluates the gate once per row as a
    // window on Re c (src/render/triggered-rows.ts). That is exact because
    // the boxes' |Im c| bands are disjoint and every box lies inside the hull.
    const boxes = [...PERIOD_THREE_BOXES].sort((a, b) => a.absImMin - b.absImMin);
    for (let k = 1; k < boxes.length; k += 1) {
      expect(boxes[k - 1]?.absImMax ?? Number.NaN).toBeLessThan(boxes[k]?.absImMin ?? Number.NaN);
    }
    for (const box of PERIOD_THREE_BOXES) {
      expect(box.reMin).toBeGreaterThanOrEqual(PERIOD_THREE_HULL.reMin);
      expect(box.reMax).toBeLessThanOrEqual(PERIOD_THREE_HULL.reMax);
      expect(box.absImMax).toBeLessThanOrEqual(PERIOD_THREE_HULL.absImMax);
    }
    // The kernel's window, written as in triggered-rows.ts (keep in sync with
    // it; tests/unit/render/triggered-rows.test.ts compares the kernel itself
    // with the scalar gate at every box edge).
    const inRowWindow = (cRe: number, cIm: number): boolean => {
      const absIm = Math.abs(cIm);
      let reMin = Number.POSITIVE_INFINITY;
      let reMax = Number.NEGATIVE_INFINITY;
      if (absIm >= RABBIT_BOX.absImMin && absIm <= RABBIT_BOX.absImMax) {
        reMin = RABBIT_BOX.reMin;
        reMax = RABBIT_BOX.reMax;
      } else if (absIm >= AIRPLANE_BOX.absImMin && absIm <= AIRPLANE_BOX.absImMax) {
        reMin = AIRPLANE_BOX.reMin;
        reMax = AIRPLANE_BOX.reMax;
      }
      return cRe >= reMin && cRe <= reMax;
    };
    const bits = new DataView(new ArrayBuffer(8));
    const step = (value: number, ulps: number): number => {
      // Neighbouring doubles of a positive or negative finite value.
      bits.setFloat64(0, value);
      bits.setBigInt64(0, bits.getBigInt64(0) + BigInt(value < 0 ? -ulps : ulps));
      return bits.getFloat64(0);
    };
    const res = [-2.2, -1.9, -0.9, 0, 0.3];
    const ims = [0, -0, 0.3, 0.9, 1.2, Number.NaN, Number.POSITIVE_INFINITY];
    for (const box of PERIOD_THREE_BOXES) {
      for (const value of [box.reMin, box.reMax]) {
        if (value !== 0) res.push(step(value, -1), value, step(value, 1));
        res.push(0.5 * (box.reMin + box.reMax));
      }
      for (const value of [box.absImMin, box.absImMax]) {
        for (const v of value === 0 ? [0, -0, 5e-324] : [step(value, -1), value, step(value, 1)]) {
          ims.push(v, -v);
        }
        ims.push(0.5 * (box.absImMin + box.absImMax));
      }
    }
    res.push(Number.NaN, Number.NEGATIVE_INFINITY);
    for (let i = 0; i < 200; i += 1) res.push(-2.1 + (2.4 * (i + 0.5)) / 200);
    for (let j = 0; j < 200; j += 1) ims.push(-1.1 + (2.2 * (j + 0.5)) / 200);
    for (const cRe of res) {
      for (const cIm of ims) {
        expect(inRowWindow(cRe, cIm)).toBe(inPeriodThreeGate(cRe, cIm));
      }
    }
  });

  it('contains the three period-3 centres and is conjugation-symmetric', () => {
    expect(inPeriodThreeGate(-1.7548776662466927, 0)).toBe(true);
    expect(inPeriodThreeGate(-0.12256116687665362, 0.7448617666197442)).toBe(true);
    expect(inPeriodThreeGate(-0.12256116687665362, -0.7448617666197442)).toBe(true);
    expect(inPeriodThreeGate(-0.1205, 0.8268)).toBe(inPeriodThreeGate(-0.1205, -0.8268));
  });

  it('rejects NaN and infinite parameters and the far exterior', () => {
    expect(inPeriodThreeGate(Number.NaN, 0.7)).toBe(false);
    expect(inPeriodThreeGate(-0.1, Number.NaN)).toBe(false);
    expect(inPeriodThreeGate(Number.NEGATIVE_INFINITY, 0)).toBe(false);
    expect(inPeriodThreeGate(-0.1, Number.POSITIVE_INFINITY)).toBe(false);
    expect(inPeriodThreeGate(2.5, 1)).toBe(false);
  });

  it('contains every parameter the closed form accepts on a dense grid', () => {
    const sample = createOrbitSample();
    let accepted = 0;
    const steps = 1200;
    for (let i = 0; i < steps; i += 1) {
      const re = -2.1 + (2.7 * (i + 0.5)) / steps;
      for (let j = 0; j < steps; j += 1) {
        const im = -1.3 + (2.6 * (j + 0.5)) / steps;
        if (classifyPeriodThreeInto(re, im, sample)) {
          accepted += 1;
          if (!inPeriodThreeGate(re, im)) {
            throw new Error(`accepted outside the gate at ${re} + ${im}i`);
          }
        }
      }
    }
    // The three period-3 components on this 1200 x 1200 grid.
    expect(accepted).toBe(11602);
  });

  it('refuses the closed form just outside every box edge', () => {
    const sample = createOrbitSample();
    const samples = 4000;
    for (const box of PERIOD_THREE_BOXES) {
      const reStep = (box.reMax - box.reMin) / samples;
      const imStep = (box.absImMax - box.absImMin) / samples;
      for (let k = 0; k <= samples; k += 1) {
        const re = box.reMin + k * reStep;
        const absIm = box.absImMin + k * imStep;
        const outside: (readonly [number, number])[] = [
          [re, box.absImMax + 1e-9],
          [box.reMin - 1e-9, absIm],
          [box.reMax + 1e-9, absIm],
        ];
        if (box.absImMin > 0) outside.push([re, box.absImMin - 1e-9]);
        for (const [cRe, cIm] of outside) {
          expect(classifyPeriodThreeInto(cRe, cIm, sample)).toBe(false);
          expect(classifyPeriodThreeInto(cRe, -cIm, sample)).toBe(false);
        }
      }
    }
  });
});
