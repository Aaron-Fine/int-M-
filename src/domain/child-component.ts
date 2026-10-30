import { locateCycle } from './dynamics-portrait';
import type { Complex } from './types';

/**
 * The p/q child of a hyperbolic component (UI review Proposal B, the
 * component lens): the satellite of period q·n attached where the parent's
 * multiplier is λ = e^{2πi p/q}. Orbit maths, so it runs in the render worker
 * (plan §5.2).
 *
 * 1. Root. From the inspected c and its attracting cycle point z, λ is
 *    continued along the segment from the inspected multiplier to
 *    e^{2πi p/q}, solving f_c^n(z) = z, (f_c^n)'(z) = λ for (z, c) by Newton
 *    at each step. The segment stays inside the unit disk, so every step is
 *    a point of the same component, and at the end the root's Jacobian is
 *    regular because λ ≠ 1.
 * 2. Centre. Newton on f_c^{qn}(0) = 0, seeded just inside the child: from
 *    the root along dc/dλ · λ (outward in λ), by half the child's expected
 *    size, 2 s sin(π p/q) / q² for a parent of size s (Heiland-Allen).
 * 3. Checks. The centre has exact period qn and lies within the child's
 *    expected size of the root; otherwise the child is refused.
 */

export interface ChildComponent {
  /** Where the child attaches: the parent's multiplier is e^{2πi p/q} there. */
  readonly root: Complex;
  /** The child's centre (nucleus): f_c^{qn}(0) = 0. */
  readonly center: Complex;
  readonly period: number;
  /** hyperbolicSizeEstimate at the centre: about the child's diameter. */
  readonly size: number;
}

export type ChildLocation =
  | { readonly found: true; readonly child: ChildComponent }
  | { readonly found: false; readonly reason: string };

/** Continuation steps from the inspected multiplier to the root's. */
const CONTINUATION_STEPS = 64;
const NEWTON_STEPS = 32;

interface Pair {
  re: number;
  im: number;
}

const add = (a: Pair, b: Pair): Pair => ({ re: a.re + b.re, im: a.im + b.im });
const sub = (a: Pair, b: Pair): Pair => ({ re: a.re - b.re, im: a.im - b.im });
const mul = (a: Pair, b: Pair): Pair => ({
  re: a.re * b.re - a.im * b.im,
  im: a.re * b.im + a.im * b.re,
});
const div = (a: Pair, b: Pair): Pair => {
  const norm = b.re * b.re + b.im * b.im;
  return { re: (a.re * b.re + a.im * b.im) / norm, im: (a.im * b.re - a.re * b.im) / norm };
};
const scale = (a: Pair, factor: number): Pair => ({ re: a.re * factor, im: a.im * factor });
const abs = (a: Pair): number => Math.hypot(a.re, a.im);
const finite = (a: Pair): boolean => Number.isFinite(a.re) && Number.isFinite(a.im);

/**
 * Size estimate of the hyperbolic component of period p with centre c
 * (Heiland-Allen, "Mandelbrot set component size estimates"): about a bulb's
 * diameter, 1 for the main cardioid. Evaluated at (Re c, |Im c|), so a
 * component and its conjugate get identical sizes; 0 if the orbit overflows.
 */
export const hyperbolicSizeEstimate = (center: Complex, period: number): number => {
  const c = { re: center.re, im: Math.abs(center.im) };
  let z: Pair = { re: 0, im: 0 };
  let l: Pair = { re: 1, im: 0 };
  let b: Pair = { re: 1, im: 0 };
  for (let step = 1; step < period; step += 1) {
    z = add(mul(z, z), c);
    l = scale(mul(z, l), 2);
    b = add(b, div({ re: 1, im: 0 }, l));
  }
  const size = 1 / abs(mul(b, mul(l, l)));
  return Number.isFinite(size) ? size : 0;
};

/**
 * f_c^n(z) − z and (f_c^n)'(z) − λ, with their Jacobian in (z, c):
 * [[a − 1, b], [a_z, a_c]] for a = (f^n)', b = ∂f^n/∂c.
 */
const cycleSystem = (z0: Pair, c: Pair, n: number, lambda: Pair) => {
  let z = z0;
  let a: Pair = { re: 1, im: 0 };
  let b: Pair = { re: 0, im: 0 };
  let az: Pair = { re: 0, im: 0 };
  let ac: Pair = { re: 0, im: 0 };
  for (let step = 0; step < n; step += 1) {
    const twoZ = scale(z, 2);
    const nextAz = scale(add(mul(a, a), mul(z, az)), 2);
    const nextAc = scale(add(mul(b, a), mul(z, ac)), 2);
    a = mul(twoZ, a);
    b = add(mul(twoZ, b), { re: 1, im: 0 });
    az = nextAz;
    ac = nextAc;
    z = add(mul(z, z), c);
  }
  return {
    g1: sub(z, z0),
    g2: sub(a, lambda),
    j11: sub(a, { re: 1, im: 0 }),
    j12: b,
    j21: az,
    j22: ac,
  };
};

/** Newton on the cycle system at multiplier λ from (z, c); undefined if it does not converge. */
const solveCycle = (
  start: { z: Pair; c: Pair },
  n: number,
  lambda: Pair,
): { z: Pair; c: Pair; dcdLambda: Pair } | undefined => {
  let { z, c } = start;
  for (let step = 0; step < NEWTON_STEPS; step += 1) {
    const s = cycleSystem(z, c, n, lambda);
    const det = sub(mul(s.j11, s.j22), mul(s.j12, s.j21));
    if (!(abs(det) > 0)) return undefined;
    // Cramer: J · (Δz, Δc) = (g1, g2).
    const dz = div(sub(mul(s.g1, s.j22), mul(s.j12, s.g2)), det);
    const dc = div(sub(mul(s.j11, s.g2), mul(s.g1, s.j21)), det);
    z = sub(z, dz);
    c = sub(c, dc);
    if (!finite(z) || !finite(c)) return undefined;
    if (abs(dz) + abs(dc) <= 1e-14 * Math.max(1, abs(z), abs(c))) {
      const end = cycleSystem(z, c, n, lambda);
      const endDet = sub(mul(end.j11, end.j22), mul(end.j12, end.j21));
      // dc/dλ from J · (dz, dc) = (0, 1).
      return { z, c, dcdLambda: div(end.j11, endDet) };
    }
  }
  return undefined;
};

/** Newton on f_c^p(0) = 0 from `seed`; undefined if it does not converge. */
const solveNucleus = (seed: Pair, period: number): Pair | undefined => {
  let c = seed;
  for (let step = 0; step < 4 * NEWTON_STEPS; step += 1) {
    let z: Pair = { re: 0, im: 0 };
    let dc: Pair = { re: 0, im: 0 };
    for (let k = 0; k < period; k += 1) {
      dc = add(scale(mul(z, dc), 2), { re: 1, im: 0 });
      z = add(mul(z, z), c);
    }
    const delta = div(z, dc);
    c = sub(c, delta);
    if (!finite(c)) return undefined;
    if (abs(delta) <= 1e-15 * Math.max(1, abs(c))) return c;
  }
  return undefined;
};

/** |f_c^d(0)| for d = 1 … period, so the caller can test exact period. */
const criticalMagnitudes = (c: Pair, period: number): number[] => {
  const magnitudes: number[] = [];
  let z: Pair = { re: 0, im: 0 };
  for (let k = 1; k <= period; k += 1) {
    z = add(mul(z, z), c);
    magnitudes.push(abs(z));
  }
  return magnitudes;
};

/**
 * The p/q child of the period-`period` component holding `c`, which must be
 * an attracting parameter of that period. Refuses, with a reason, rather than
 * guess.
 */
export function locateChildComponent(
  c: Complex,
  period: number,
  rotation: { readonly numerator: number; readonly denominator: number },
): ChildLocation {
  const { numerator: p, denominator: q } = rotation;
  if (!Number.isInteger(p) || !Number.isInteger(q) || q < 2 || p < 1 || p >= q) {
    return { found: false, reason: 'the angle must be p/q with 0 < p < q' };
  }
  const cycle = locateCycle(c, period);
  if (cycle.length === 0) {
    return { found: false, reason: `no attracting cycle of period ${period} was found here` };
  }
  let z: Pair = { re: cycle[0] ?? 0, im: cycle[1] ?? 0 };
  let current: Pair = { re: c.re, im: c.im };
  const start = cycleSystem(z, current, period, { re: 0, im: 0 });
  const lambda0 = add(start.j11, { re: 1, im: 0 });
  const target = { re: Math.cos((2 * Math.PI * p) / q), im: Math.sin((2 * Math.PI * p) / q) };

  let root: { z: Pair; c: Pair; dcdLambda: Pair } | undefined;
  for (let step = 1; step <= CONTINUATION_STEPS; step += 1) {
    const t = step / CONTINUATION_STEPS;
    const lambda = add(scale(lambda0, 1 - t), scale(target, t));
    root = solveCycle({ z, c: current }, period, lambda);
    if (root === undefined) {
      return { found: false, reason: "Newton's method did not converge to the root" };
    }
    ({ z, c: current } = root);
  }
  if (root === undefined) return { found: false, reason: 'no root' };

  const parentCenter = solveNucleus({ re: c.re, im: c.im }, period);
  const parentSize = parentCenter === undefined ? 0 : hyperbolicSizeEstimate(parentCenter, period);
  if (!(parentSize > 0)) {
    return { found: false, reason: "Newton's method did not converge to this component's centre" };
  }
  const childPeriod = q * period;
  const expected = (2 * parentSize * Math.sin((Math.PI * p) / q)) / (q * q);
  const inward = mul(root.dcdLambda, target);
  const seed = add(root.c, scale(inward, expected / 2 / abs(inward)));
  const center = solveNucleus(seed, childPeriod);
  if (center === undefined) {
    return { found: false, reason: "Newton's method did not converge to the child's centre" };
  }
  const magnitudes = criticalMagnitudes(center, childPeriod);
  const exact = magnitudes.every(
    (magnitude, index) =>
      (index + 1) % childPeriod === 0 || childPeriod % (index + 1) !== 0 || magnitude > 1e-9,
  );
  if (!exact) return { found: false, reason: `the centre found has a period below ${childPeriod}` };
  if (abs(sub(center, root.c)) > expected) {
    return { found: false, reason: 'the centre found is not next to the root' };
  }
  return {
    found: true,
    child: {
      root: { re: root.c.re, im: root.c.im },
      center: { re: center.re, im: center.im },
      period: childPeriod,
      size: hyperbolicSizeEstimate(center, childPeriod),
    },
  };
}
