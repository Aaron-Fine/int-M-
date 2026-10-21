/**
 * Speed gate for the analytic period-3 fast path (ADR 0010): padded
 * bounding boxes of the three period-3 hyperbolic components, as data.
 *
 * Provenance: poc/performance/h-p3p4/boxes.ts traced each component's
 * boundary (lambda = e^{i theta}, 4096 angles, Newton-continued from the
 * Gleason centre) and padded each box by 2% of its larger side
 * (boxes.json). Conjugate pairs are folded through |Im c|, so the rabbit and
 * corabbit share one box.
 *
 * The gate decides only whether the closed form is tried. It must contain
 * every parameter the closed form accepts; then it changes speed, never
 * answers. tests/unit/domain/period-three-gate.test.ts checks that on a
 * dense grid and along every box edge (measured, not proved).
 */

export interface PeriodThreeBox {
  readonly reMin: number;
  readonly reMax: number;
  /** Bounds on |Im c|. */
  readonly absImMin: number;
  readonly absImMax: number;
}

/** Douady rabbit (Im c > 0) and corabbit (Im c < 0). */
export const RABBIT_BOX: PeriodThreeBox = Object.freeze({
  reMin: -0.2232411450425719,
  reMax: -0.026495368185881676,
  absImMin: 0.6457354802064695,
  absImMax: 0.8422103415192167,
});

/** Airplane, on the real axis. */
export const AIRPLANE_BOX: PeriodThreeBox = Object.freeze({
  reMin: -1.7690122266456996,
  reMax: -1.747173345346132,
  absImMin: 0,
  absImMax: 0.012559928628381378,
});

export const PERIOD_THREE_BOXES: readonly PeriodThreeBox[] = Object.freeze([
  RABBIT_BOX,
  AIRPLANE_BOX,
]);

/** Hull of PERIOD_THREE_BOXES: the first, cheapest test. */
export const PERIOD_THREE_HULL: PeriodThreeBox = Object.freeze({
  reMin: AIRPLANE_BOX.reMin,
  reMax: RABBIT_BOX.reMax,
  absImMin: 0,
  absImMax: RABBIT_BOX.absImMax,
});

/**
 * True when c lies in a period-3 box. NaN and infinite input give false
 * (every comparison with NaN is false; infinities fail the bounds).
 *
 * Straight-line on purpose. Neither kernel calls it directly: both call
 * classifyGatedAnalyticInto (src/domain/analytic-period-three.ts), which
 * tests this gate and inPeriodFourGate (ADR 0010 amendment of 2026-10-20).
 */
export const inPeriodThreeGate = (cRe: number, cIm: number): boolean => {
  const absIm = cIm < 0 ? -cIm : cIm;
  if (!(cRe <= PERIOD_THREE_HULL.reMax && cRe >= PERIOD_THREE_HULL.reMin)) {
    return false;
  }
  if (!(absIm <= PERIOD_THREE_HULL.absImMax)) {
    return false;
  }
  return (
    (cRe >= RABBIT_BOX.reMin &&
      cRe <= RABBIT_BOX.reMax &&
      absIm >= RABBIT_BOX.absImMin &&
      absIm <= RABBIT_BOX.absImMax) ||
    (cRe >= AIRPLANE_BOX.reMin &&
      cRe <= AIRPLANE_BOX.reMax &&
      absIm >= AIRPLANE_BOX.absImMin &&
      absIm <= AIRPLANE_BOX.absImMax)
  );
};
