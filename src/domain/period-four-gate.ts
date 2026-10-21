import type { PeriodThreeBox } from './period-three-gate';

/**
 * Speed gate for the analytic period-4 fast path (ADR 0013): padded bounding
 * boxes of the six period-4 hyperbolic components, as data.
 *
 * Provenance: poc/performance/h-p3p4/boxes.ts traced each component's
 * boundary (lambda = e^{i theta}, 4096 angles, Newton-continued from the
 * Gleason centre) and padded each box by 2% of its larger side
 * (boxes.json). Conjugate pairs are folded through |Im c|, so the six
 * components need four boxes; each folded box is the union of the pair's
 * boxes.
 *
 * The gate decides only whether the cubic solve is tried. It must contain
 * every parameter the solve accepts; then it changes speed, never answers.
 * tests/unit/domain/period-four-gate.test.ts checks that on dense grids and
 * along every box edge (measured, not proved). Every accepted parameter lies
 * in a period-4 hyperbolic component (section 12.2), so the gate
 * only has to contain the six components.
 */

/** The same box shape as the period-3 gate's. */
export type PeriodFourBox = PeriodThreeBox;

/** The 1/4 and 3/4 satellites of the main cardioid (centre 0.2823 ± 0.5301i). */
export const CARDIOID_SATELLITE_BOX: PeriodFourBox = Object.freeze({
  reMin: 0.23529958578850574,
  reMax: 0.32682245620675104,
  absImMin: 0.48530870690834227,
  absImMax: 0.5768264028817619,
});

/** The primitive pair off the axis (centre -0.1565 ± 1.0322i). */
export const COMPLEX_PRIMITIVE_BOX: PeriodFourBox = Object.freeze({
  reMin: -0.16288539392175883,
  reMax: -0.15226407057808444,
  absImMin: 1.0270921619889395,
  absImMax: 1.0381904413114849,
});

/** The 1/2 satellite of the 1/2-bulb, on the real axis (centre -1.3107). */
export const BULB_SATELLITE_BOX: PeriodFourBox = Object.freeze({
  reMin: -1.3704609181790832,
  reMax: -1.247638021212175,
  absImMin: 0,
  absImMax: 0.06136520988414045,
});

/** The primitive component on the real axis (centre -1.9408). */
export const REAL_PRIMITIVE_BOX: PeriodFourBox = Object.freeze({
  reMin: -1.9415634026360422,
  reMax: -1.940401662163363,
  absImMin: 0,
  absImMax: 0.0006668835570036569,
});

export const PERIOD_FOUR_BOXES: readonly PeriodFourBox[] = Object.freeze([
  CARDIOID_SATELLITE_BOX,
  COMPLEX_PRIMITIVE_BOX,
  BULB_SATELLITE_BOX,
  REAL_PRIMITIVE_BOX,
]);

/**
 * True when c lies in a period-4 box. NaN and infinite input give false
 * (every comparison with NaN is false; infinities fail the bounds).
 *
 * Straight-line on purpose. Neither kernel calls it directly: both call
 * classifyGatedAnalyticInto (src/domain/analytic-period-three.ts), which
 * tests inPeriodThreeGate and this gate (ADR 0010 amendment of 2026-10-20).
 */
export const inPeriodFourGate = (cRe: number, cIm: number): boolean => {
  const absIm = cIm < 0 ? -cIm : cIm;
  return (
    (cRe >= BULB_SATELLITE_BOX.reMin &&
      cRe <= BULB_SATELLITE_BOX.reMax &&
      absIm <= BULB_SATELLITE_BOX.absImMax) ||
    (cRe >= REAL_PRIMITIVE_BOX.reMin &&
      cRe <= REAL_PRIMITIVE_BOX.reMax &&
      absIm <= REAL_PRIMITIVE_BOX.absImMax) ||
    (cRe >= CARDIOID_SATELLITE_BOX.reMin &&
      cRe <= CARDIOID_SATELLITE_BOX.reMax &&
      absIm >= CARDIOID_SATELLITE_BOX.absImMin &&
      absIm <= CARDIOID_SATELLITE_BOX.absImMax) ||
    (cRe >= COMPLEX_PRIMITIVE_BOX.reMin &&
      cRe <= COMPLEX_PRIMITIVE_BOX.reMax &&
      absIm >= COMPLEX_PRIMITIVE_BOX.absImMin &&
      absIm <= COMPLEX_PRIMITIVE_BOX.absImMax)
  );
};
