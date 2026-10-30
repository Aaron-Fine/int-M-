import { describe, expect, it } from 'vitest';

import { classifyOrbit } from '../../../src/domain';
import {
  computeDynamicsPortrait,
  criticalOrbit,
  DYNAMICS_PORTRAIT_SPAN,
  locateCycle,
} from '../../../src/domain/dynamics-portrait';

const RABBIT = { re: -0.1225, im: 0.7449 };

const pixel = (rgba: Uint8ClampedArray, size: number, x: number, y: number): number[] =>
  Array.from(rgba.slice(4 * (y * size + x), 4 * (y * size + x) + 4));

describe('dynamics portrait (inspector companion)', () => {
  it('locates the rabbit cycle as three points that close under three steps', () => {
    const cycle = locateCycle(RABBIT, 3);
    expect(cycle).toHaveLength(6);
    let re = cycle[0] ?? Number.NaN;
    let im = cycle[1] ?? Number.NaN;
    for (let step = 0; step < 3; step += 1) {
      const next = re * re - im * im + RABBIT.re;
      im = 2 * re * im + RABBIT.im;
      re = next;
    }
    expect(Math.hypot(re - (cycle[0] ?? 0), im - (cycle[1] ?? 0))).toBeLessThan(1e-9);
    // The three points are distinct: period 3, not a fixed point drawn three times.
    expect(
      Math.hypot((cycle[2] ?? 0) - (cycle[0] ?? 0), (cycle[3] ?? 0) - (cycle[1] ?? 0)),
    ).toBeGreaterThan(0.1);
  });

  /** |f^p(z0) − z0| and the cycle multiplier (f^p)'(z0) for a located cycle. */
  const closure = (c: { re: number; im: number }, cycle: Float64Array, period: number) => {
    let re = cycle[0] ?? Number.NaN;
    let im = cycle[1] ?? Number.NaN;
    let dRe = 1;
    let dIm = 0;
    for (let step = 0; step < period; step += 1) {
      const nextDRe = 2 * (re * dRe - im * dIm);
      dIm = 2 * (re * dIm + im * dRe);
      dRe = nextDRe;
      const next = re * re - im * im + c.re;
      im = 2 * re * im + c.im;
      re = next;
    }
    return {
      gap: Math.hypot(re - (cycle[0] ?? 0), im - (cycle[1] ?? 0)),
      multiplier: Math.hypot(dRe, dIm),
    };
  };

  it.each([
    // |λ| = 0.9996: the critical orbit is still about 2% off the cycle after 20,000 steps.
    ['period 2 next to its root with the main cardioid', { re: -0.7501, im: 0 }, 2],
    // λ = 1 − 2·10⁻⁴: next to the main cardioid's cusp.
    ['period 1 next to the cusp', { re: 0.24999999, im: 0 }, 1],
    // Inside the 1/3-bulb, 10⁻⁴ from its root e^{2πi/3}/2 − e^{4πi/3}/4.
    ['period 3 next to the 1/3 root', { re: -0.125 + 1e-4, im: 0.649519052838329 + 1e-4 }, 3],
  ] as const)('refines a slowly attracting cycle by Newton: %s', (_, c, period) => {
    expect(classifyOrbit(c)).toMatchObject({ status: 'attracting-cycle', period });
    const cycle = locateCycle(c, period);
    expect(cycle).toHaveLength(2 * period);
    const { gap, multiplier } = closure(c, cycle, period);
    expect(gap).toBeLessThan(1e-12);
    expect(multiplier).toBeLessThan(1);
    expect(multiplier).toBeGreaterThan(0.99);
  });

  it('draws no repelling cycle and no cycle of a smaller period', () => {
    // The rabbit's period-2 cycle is repelling and its fixed points have period 1.
    expect(locateCycle(RABBIT, 2)).toHaveLength(0);
    expect(locateCycle(RABBIT, 6)).toHaveLength(0);
    // At the basilica, Newton for period 1 lands on the repelling fixed point (1 − √5)/2.
    expect(locateCycle({ re: -1, im: 0 }, 1)).toHaveLength(0);
    expect(locateCycle({ re: -1, im: 0 }, 2)).toHaveLength(4);
  });

  it('draws no cycle for an escaping parameter or an unusable period', () => {
    expect(locateCycle({ re: 0.5, im: 0.5 }, 1)).toHaveLength(0);
    expect(locateCycle(RABBIT, 0)).toHaveLength(0);
    expect(locateCycle(RABBIT, 2.5)).toHaveLength(0);
    // A wrong period does not close, so nothing is drawn rather than a wrong cycle.
    expect(locateCycle(RABBIT, 2)).toHaveLength(0);
  });

  it('starts the critical orbit at 0 then c, and stops once it leaves the picture', () => {
    const orbit = criticalOrbit({ re: 0.5, im: 0.5 });
    expect(Array.from(orbit.slice(0, 4))).toEqual([0, 0, 0.5, 0.5]);
    const lastRe = orbit[orbit.length - 2] ?? 0;
    const lastIm = orbit[orbit.length - 1] ?? 0;
    expect(Math.hypot(lastRe, lastIm)).toBeGreaterThan(DYNAMICS_PORTRAIT_SPAN);
    expect(orbit.length).toBeLessThan(2 * 64);
  });

  it('uses the inspected period only for attracting results', () => {
    const attracting = computeDynamicsPortrait(RABBIT, classifyOrbit(RABBIT), 32);
    expect(attracting.cycle).toHaveLength(6);
    const escaped = computeDynamicsPortrait(
      { re: 0.5, im: 0.5 },
      classifyOrbit({ re: 0.5, im: 0.5 }),
      32,
    );
    expect(escaped.cycle).toHaveLength(0);
  });

  it('shades a fast-settling interior light and the far exterior as escaped', () => {
    const c = { re: 0, im: 0 }; // z -> z^2: the unit disk settles onto 0 quickly
    const size = 33;
    const portrait = computeDynamicsPortrait(c, classifyOrbit(c), size);
    expect(portrait.rgba).toHaveLength(size * size * 4);
    const [r, g, b, a] = pixel(portrait.rgba, size, 16, 16);
    expect(a).toBe(255);
    expect(r).toBe(g);
    expect(g).toBe(b);
    expect(r).toBeGreaterThan(200);
    const corner = pixel(portrait.rgba, size, 0, 0);
    // Escaped shading is the blue-navy band of the multiplier and period views.
    expect(corner[2]).toBeGreaterThan(corner[0] ?? 255);
  });
});
