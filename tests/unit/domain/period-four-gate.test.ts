import { describe, expect, it } from 'vitest';

import {
  classifyPeriodFourInto,
  createOrbitSample,
  inPeriodFourGate,
  PERIOD_FOUR_BOXES,
  PERIOD_THREE_BOXES,
} from '../../../src/domain';

/**
 * The gate decides only whether the cubic solve is tried, so it must contain
 * every parameter the solve accepts (ADR 0013). Measured on dense grids and
 * along every box edge; not a proof.
 */
const inAnyBox = (re: number, im: number): boolean =>
  PERIOD_FOUR_BOXES.some(
    (box) =>
      re >= box.reMin &&
      re <= box.reMax &&
      Math.abs(im) >= box.absImMin &&
      Math.abs(im) <= box.absImMax,
  );

describe('period-4 gate', () => {
  it('agrees with a plain loop over PERIOD_FOUR_BOXES on a grid', () => {
    for (let i = 0; i < 400; i += 1) {
      const re = -2 + (2.4 * (i + 0.5)) / 400;
      for (let j = 0; j < 400; j += 1) {
        const im = -1.1 + (2.2 * (j + 0.5)) / 400;
        expect(inPeriodFourGate(re, im)).toBe(inAnyBox(re, im));
      }
    }
  });

  it('is disjoint from the period-3 boxes', () => {
    for (const four of PERIOD_FOUR_BOXES) {
      for (const three of PERIOD_THREE_BOXES) {
        const reOverlap = four.reMin <= three.reMax && three.reMin <= four.reMax;
        const imOverlap = four.absImMin <= three.absImMax && three.absImMin <= four.absImMax;
        expect(reOverlap && imOverlap).toBe(false);
      }
    }
  });

  it('contains the six period-4 centres and is conjugation-symmetric', () => {
    for (const [re, im] of [
      [-1.9407998065294847, 0],
      [-1.3107026413368328, 0],
      [0.2822713907669139, 0.5300606175785253],
      [0.2822713907669139, -0.5300606175785253],
      [-0.15652016683375505, 1.0322471089228318],
      [-0.15652016683375505, -1.0322471089228318],
    ] as const) {
      expect(inPeriodFourGate(re, im)).toBe(true);
    }
    expect(inPeriodFourGate(-1.3, 0.05)).toBe(inPeriodFourGate(-1.3, -0.05));
  });

  it('rejects NaN and infinite parameters and the far exterior', () => {
    expect(inPeriodFourGate(Number.NaN, 0)).toBe(false);
    expect(inPeriodFourGate(-1.3, Number.NaN)).toBe(false);
    expect(inPeriodFourGate(Number.NEGATIVE_INFINITY, 0)).toBe(false);
    expect(inPeriodFourGate(-1.3, Number.POSITIVE_INFINITY)).toBe(false);
    expect(inPeriodFourGate(2.5, 1)).toBe(false);
  });

  it('contains every parameter the solve accepts on a dense grid', () => {
    const sample = createOrbitSample();
    let accepted = 0;
    const steps = 1200;
    for (let i = 0; i < steps; i += 1) {
      const re = -2.1 + (2.7 * (i + 0.5)) / steps;
      for (let j = 0; j < steps; j += 1) {
        const im = -1.3 + (2.6 * (j + 0.5)) / steps;
        if (classifyPeriodFourInto(re, im, sample)) {
          accepted += 1;
          if (!inPeriodFourGate(re, im)) {
            throw new Error(`accepted outside the gate at ${re} + ${im}i`);
          }
        }
      }
    }
    // The six period-4 components on this 1200 x 1200 grid.
    expect(accepted).toBe(4782);
  });

  it('contains every accepted parameter on a fine grid around each box', () => {
    const sample = createOrbitSample();
    const steps = 300;
    for (const box of PERIOD_FOUR_BOXES) {
      // The box, widened by half its size on every side, in both half-planes.
      const reWidth = box.reMax - box.reMin;
      const imWidth = box.absImMax - box.absImMin;
      const reLow = box.reMin - 0.5 * reWidth;
      const imLow = Math.max(0, box.absImMin - 0.5 * imWidth);
      const imHigh = box.absImMax + 0.5 * imWidth;
      let accepted = 0;
      for (let i = 0; i < steps; i += 1) {
        const re = reLow + (2 * reWidth * (i + 0.5)) / steps;
        for (let j = 0; j < steps; j += 1) {
          const absIm = imLow + ((imHigh - imLow) * (j + 0.5)) / steps;
          for (const im of [absIm, -absIm]) {
            if (!classifyPeriodFourInto(re, im, sample)) continue;
            accepted += 1;
            if (!inPeriodFourGate(re, im)) {
              throw new Error(`accepted outside the gate at ${re} + ${im}i`);
            }
          }
        }
      }
      expect(accepted).toBeGreaterThan(0);
    }
  });

  it('refuses the solve just outside every box edge', () => {
    const sample = createOrbitSample();
    const samples = 4000;
    for (const box of PERIOD_FOUR_BOXES) {
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
          expect(classifyPeriodFourInto(cRe, cIm, sample)).toBe(false);
          expect(classifyPeriodFourInto(cRe, -cIm, sample)).toBe(false);
        }
      }
    }
  });
});
