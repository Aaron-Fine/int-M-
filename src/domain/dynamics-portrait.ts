import { colorForEscaped, colorForUnresolved } from './semantic';
import type { Complex, OrbitResult } from './types';

/**
 * Dynamical-plane companion of an inspected parameter (UI review, Proposal A):
 * the filled Julia set of z^2 + c, shaded the way the Stability view shades
 * the parameter plane (lighter interior points settle onto the attracting
 * cycle faster), with the critical orbit and the cycle drawn over it.
 *
 * Display only. Classification stays with the verifier: the cycle drawn here
 * is located only when the inspection already reported an attracting cycle,
 * using that reported period, and is omitted when no attracting cycle of that
 * exact period is found near the critical orbit's limit. Runs in the render worker (plan §5.2).
 */
export interface DynamicsPortrait {
  /** Side of the square raster in pixels. */
  readonly size: number;
  /** The raster covers [-span/2, span/2] in both real and imaginary parts of z. */
  readonly span: number;
  readonly rgba: Uint8ClampedArray<ArrayBuffer>;
  /** Critical orbit z_0 = 0, z_1 = c, ... as interleaved (re, im) pairs, while |z| stays near the raster. */
  readonly orbit: Float64Array<ArrayBuffer>;
  /** Points of the attracting cycle as interleaved (re, im) pairs; empty when none is drawn. */
  readonly cycle: Float64Array<ArrayBuffer>;
}

export const DYNAMICS_PORTRAIT_SIZE = 224;
export const DYNAMICS_PORTRAIT_SPAN = 3.6;
const RASTER_ITERATIONS = 256;
const ORBIT_POINTS = 64;
const CYCLE_SEARCH_ITERATIONS = 20_000;
/** Newton steps that refine the cycle; quadratic convergence needs a handful. */
const NEWTON_STEPS = 32;
/** Raster points within this distance of the first cycle point count as settled. */
const SETTLE_RADIUS = 1e-3;

/** f_c^n(z) and its derivative (f_c^n)'(z) = Π 2 z_k. */
const iterateWithDerivative = (c: Complex, n: number, re: number, im: number) => {
  let zRe = re;
  let zIm = im;
  let dRe = 1;
  let dIm = 0;
  for (let step = 0; step < n; step += 1) {
    const nextDRe = 2 * (zRe * dRe - zIm * dIm);
    dIm = 2 * (zRe * dIm + zIm * dRe);
    dRe = nextDRe;
    const next = zRe * zRe - zIm * zIm + c.re;
    zIm = 2 * zRe * zIm + c.im;
    zRe = next;
  }
  return { re: zRe, im: zIm, dRe, dIm };
};

/**
 * The attracting cycle reached from the critical point. The orbit is iterated
 * past the transient, then Newton on f^p(z) = z refines its last point: that
 * polishes a cycle the orbit has reached and finds one it approaches too
 * slowly to close, as next to a parabolic root, where |λ| is near 1. Empty
 * unless the result closes to 1e-9 (relative), is attracting (|λ| < 1, so it
 * is the one attracting cycle of z^2 + c) and has exact period `period`.
 */
export function locateCycle(c: Complex, period: number): Float64Array<ArrayBuffer> {
  if (!Number.isInteger(period) || period < 1) return new Float64Array(0);
  let re = 0;
  let im = 0;
  for (let step = 0; step < CYCLE_SEARCH_ITERATIONS; step += 1) {
    const next = re * re - im * im + c.re;
    im = 2 * re * im + c.im;
    re = next;
    if (!Number.isFinite(re) || re * re + im * im > 16) return new Float64Array(0);
  }
  for (let step = 0; step < NEWTON_STEPS; step += 1) {
    const image = iterateWithDerivative(c, period, re, im);
    // z ← z − (f^p(z) − z) / ((f^p)'(z) − 1)
    const gRe = image.re - re;
    const gIm = image.im - im;
    const hRe = image.dRe - 1;
    const hIm = image.dIm;
    const norm = hRe * hRe + hIm * hIm;
    if (!(norm > 0)) break;
    const deltaRe = (gRe * hRe + gIm * hIm) / norm;
    const deltaIm = (gIm * hRe - gRe * hIm) / norm;
    re -= deltaRe;
    im -= deltaIm;
    if (!Number.isFinite(re) || !Number.isFinite(im)) return new Float64Array(0);
    if (Math.hypot(deltaRe, deltaIm) <= 1e-15 * Math.max(1, Math.hypot(re, im))) break;
  }
  const scale = Math.max(1, Math.hypot(re, im));
  const closes = (n: number): boolean => {
    const image = iterateWithDerivative(c, n, re, im);
    return Math.hypot(image.re - re, image.im - im) <= 1e-9 * scale;
  };
  const image = iterateWithDerivative(c, period, re, im);
  if (!closes(period) || !(Math.hypot(image.dRe, image.dIm) < 1)) return new Float64Array(0);
  for (let divisor = 1; divisor < period; divisor += 1) {
    if (period % divisor === 0 && closes(divisor)) return new Float64Array(0);
  }
  const cycle = new Float64Array(2 * period);
  for (let k = 0; k < period; k += 1) {
    cycle[2 * k] = re;
    cycle[2 * k + 1] = im;
    const next = re * re - im * im + c.re;
    im = 2 * re * im + c.im;
    re = next;
  }
  return cycle;
}

/** The critical orbit while it stays within twice the raster's half-span. */
export function criticalOrbit(c: Complex, points = ORBIT_POINTS): Float64Array<ArrayBuffer> {
  const limit = DYNAMICS_PORTRAIT_SPAN;
  const orbit: number[] = [0, 0];
  let re = 0;
  let im = 0;
  for (let step = 1; step < points; step += 1) {
    const next = re * re - im * im + c.re;
    im = 2 * re * im + c.im;
    re = next;
    orbit.push(re, im);
    if (!(re * re + im * im <= limit * limit)) break;
  }
  return Float64Array.from(orbit);
}

export function computeDynamicsPortrait(
  c: Complex,
  inspection: OrbitResult,
  size = DYNAMICS_PORTRAIT_SIZE,
): DynamicsPortrait {
  const span = DYNAMICS_PORTRAIT_SPAN;
  const cycle =
    inspection.status === 'attracting-cycle'
      ? locateCycle(c, inspection.period)
      : new Float64Array(0);
  const hasCycle = cycle.length > 0;
  const anchorRe = cycle[0] ?? 0;
  const anchorIm = cycle[1] ?? 0;
  const settleSquared = SETTLE_RADIUS * SETTLE_RADIUS;
  const escapeSquared = Math.max(4, c.re * c.re + c.im * c.im);
  const unresolved = colorForUnresolved();
  const rgba = new Uint8ClampedArray(size * size * 4);
  const step = span / size;

  for (let y = 0; y < size; y += 1) {
    const startIm = span / 2 - (y + 0.5) * step;
    for (let x = 0; x < size; x += 1) {
      let re = -span / 2 + (x + 0.5) * step;
      let im = startIm;
      let outcome = -1; // -1 bounded without settling, else the escape or settle iteration
      let escaped = false;
      let magnitudeSquared = re * re + im * im;
      for (let iteration = 1; iteration <= RASTER_ITERATIONS; iteration += 1) {
        const next = re * re - im * im + c.re;
        im = 2 * re * im + c.im;
        re = next;
        magnitudeSquared = re * re + im * im;
        if (magnitudeSquared > escapeSquared) {
          outcome = iteration;
          escaped = true;
          break;
        }
        if (hasCycle) {
          const dRe = re - anchorRe;
          const dIm = im - anchorIm;
          if (dRe * dRe + dIm * dIm < settleSquared) {
            outcome = iteration;
            break;
          }
        }
      }
      const offset = 4 * (y * size + x);
      if (escaped) {
        const smooth = outcome + 1 - Math.log2(Math.log2(Math.sqrt(magnitudeSquared)));
        const [r, g, b] = colorForEscaped(Number.isFinite(smooth) ? smooth : outcome, 'multiplier');
        rgba[offset] = r;
        rgba[offset + 1] = g;
        rgba[offset + 2] = b;
      } else if (outcome > 0) {
        // Settled: lighter is faster, as in the Stability view.
        const value = 235 - 165 * Math.sqrt(Math.min(1, outcome / RASTER_ITERATIONS));
        rgba[offset] = value;
        rgba[offset + 1] = value;
        rgba[offset + 2] = value;
      } else {
        rgba[offset] = unresolved[0];
        rgba[offset + 1] = unresolved[1];
        rgba[offset + 2] = unresolved[2];
      }
      rgba[offset + 3] = 255;
    }
  }

  return { size, span, rgba, orbit: criticalOrbit(c), cycle };
}
