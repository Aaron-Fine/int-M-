import {
  BULB_SATELLITE_BOX,
  CARDIOID_SATELLITE_BOX,
  COMPLEX_PRIMITIVE_BOX,
  REAL_PRIMITIVE_BOX,
} from './period-four-gate';
import { AIRPLANE_BOX, RABBIT_BOX } from './period-three-gate';

/**
 * The period-3 and period-4 gates on one row of constant Im c, as windows on
 * Re c (ADR 0010, ADR 0013). On a row, inPeriodThreeGate(c) is exactly
 * windows[P3_MIN] <= Re c <= windows[P3_MAX], and inPeriodFourGate(c) is
 * exactly Re c in [windows[P4_MIN], windows[P4_MAX]] or in
 * [windows[P4_AXIS_MIN], windows[P4_AXIS_MAX]]:
 *
 * - the period-3 boxes' |Im c| bands are disjoint and every box lies inside
 *   the period-3 hull, so at most one period-3 box applies to a row;
 * - the off-axis period-4 boxes' bands are disjoint from each other and from
 *   the axis band, and on the axis band the 1/2 satellite of the 1/2-bulb and
 *   the real primitive component both apply (two windows).
 *
 * A window that does not apply is empty (+Infinity, -Infinity): false for
 * every Re c, NaN included. A NaN Im c gives empty windows. Math.abs(-0) is
 * +0, which compares as -0 does. tests/unit/domain/gated-analytic.test.ts
 * checks the equivalence at every box edge and on grids.
 */
export const P3_MIN = 0;
export const P3_MAX = 1;
export const P4_MIN = 2;
export const P4_MAX = 3;
export const P4_AXIS_MIN = 4;
export const P4_AXIS_MAX = 5;
export const GATE_WINDOW_COUNT = 6;

export const fillGateWindows = (cIm: number, windows: Float64Array): void => {
  const absIm = Math.abs(cIm);
  let p3ReMin = Number.POSITIVE_INFINITY;
  let p3ReMax = Number.NEGATIVE_INFINITY;
  if (absIm >= RABBIT_BOX.absImMin && absIm <= RABBIT_BOX.absImMax) {
    p3ReMin = RABBIT_BOX.reMin;
    p3ReMax = RABBIT_BOX.reMax;
  } else if (absIm >= AIRPLANE_BOX.absImMin && absIm <= AIRPLANE_BOX.absImMax) {
    p3ReMin = AIRPLANE_BOX.reMin;
    p3ReMax = AIRPLANE_BOX.reMax;
  }
  let p4ReMin = Number.POSITIVE_INFINITY;
  let p4ReMax = Number.NEGATIVE_INFINITY;
  let p4AxisReMin = Number.POSITIVE_INFINITY;
  let p4AxisReMax = Number.NEGATIVE_INFINITY;
  if (absIm >= CARDIOID_SATELLITE_BOX.absImMin && absIm <= CARDIOID_SATELLITE_BOX.absImMax) {
    p4ReMin = CARDIOID_SATELLITE_BOX.reMin;
    p4ReMax = CARDIOID_SATELLITE_BOX.reMax;
  } else if (absIm >= COMPLEX_PRIMITIVE_BOX.absImMin && absIm <= COMPLEX_PRIMITIVE_BOX.absImMax) {
    p4ReMin = COMPLEX_PRIMITIVE_BOX.reMin;
    p4ReMax = COMPLEX_PRIMITIVE_BOX.reMax;
  } else if (absIm <= BULB_SATELLITE_BOX.absImMax) {
    p4ReMin = BULB_SATELLITE_BOX.reMin;
    p4ReMax = BULB_SATELLITE_BOX.reMax;
    if (absIm <= REAL_PRIMITIVE_BOX.absImMax) {
      p4AxisReMin = REAL_PRIMITIVE_BOX.reMin;
      p4AxisReMax = REAL_PRIMITIVE_BOX.reMax;
    }
  }
  windows[P3_MIN] = p3ReMin;
  windows[P3_MAX] = p3ReMax;
  windows[P4_MIN] = p4ReMin;
  windows[P4_MAX] = p4ReMax;
  windows[P4_AXIS_MIN] = p4AxisReMin;
  windows[P4_AXIS_MAX] = p4AxisReMax;
};
