import { describe, expect, it } from 'vitest';

import { componentSizeEstimate } from '../../../../src/catalog/navigation';
import type { AngledAddressStep, CatalogComponent } from '../../../../src/catalog/schema';
import { locateChildComponent } from '../../../../src/domain/child-component';
import { fullCatalog } from './core-bytes';

const CATALOG = fullCatalog();

const key = (component: CatalogComponent, steps = component.angledInternalAddress ?? []) =>
  steps
    .map((step) => `${step.toPeriod}@${step.rotation.numerator}/${step.rotation.denominator}`)
    .join(' ');
const BY_ADDRESS = new Map(CATALOG.map((component) => [key(component), component] as const));

/** A satellite step n →p/q→ qn: the child's period is q times its parent's. */
const isSatellite = (step: AngledAddressStep): boolean =>
  step.toPeriod === step.rotation.denominator * step.fromPeriod;

/** Every catalog satellite: a last step n →p/q→ qn, with its parent. */
const SATELLITES = CATALOG.flatMap((child) => {
  const steps = child.angledInternalAddress ?? [];
  const last = steps.at(-1);
  const parent = BY_ADDRESS.get(key(child, steps.slice(0, -1)));
  return last !== undefined && isSatellite(last) && parent !== undefined
    ? [{ parent, child, rotation: last.rotation }]
    : [];
});

const distance = (a: { re: number; im: number }, b: { re: number; im: number }) =>
  Math.hypot(a.re - b.re, a.im - b.im);

describe('child components of the component lens (UI review Proposal B)', () => {
  it('matches the closed-form roots of the main cardioid and the 1/2-bulb', () => {
    const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
    for (const q of [2, 3, 4, 5, 7]) {
      for (let p = 1; p < q; p += 1) {
        if (gcd(p, q) !== 1) continue;
        const theta = (2 * Math.PI * p) / q;
        const lambda = { re: Math.cos(theta), im: Math.sin(theta) };
        const squared = { re: Math.cos(2 * theta), im: Math.sin(2 * theta) };
        const rotation = { numerator: p, denominator: q };
        // Period 1: c = λ/2 − λ²/4, from a point inside the main cardioid.
        const cardioid = locateChildComponent({ re: 0.1, im: 0.1 }, 1, rotation);
        expect(cardioid, `${p}/${q} of the main cardioid`).toMatchObject({ found: true });
        if (cardioid.found) {
          expect(cardioid.child.period).toBe(q);
          expect(
            distance(cardioid.child.root, {
              re: lambda.re / 2 - squared.re / 4,
              im: lambda.im / 2 - squared.im / 4,
            }),
          ).toBeLessThan(1e-12);
        }
        // Period 2: c = λ/4 − 1, from a point inside the 1/2-bulb.
        const basilica = locateChildComponent({ re: -1.05, im: 0.05 }, 2, rotation);
        expect(basilica, `${p}/${q} of the 1/2-bulb`).toMatchObject({ found: true });
        if (basilica.found) {
          expect(basilica.child.period).toBe(2 * q);
          expect(
            distance(basilica.child.root, { re: lambda.re / 4 - 1, im: lambda.im / 4 }),
          ).toBeLessThan(1e-12);
        }
      }
    }
  });

  it('finds the catalog centre of every satellite in the period ≤12 core from its parent', () => {
    expect(SATELLITES.length).toBeGreaterThan(100);
    const misses = SATELLITES.flatMap(({ parent, child, rotation }) => {
      // Inspect a point inside the parent, a little off its centre.
      const offset = 0.1 * componentSizeEstimate(parent);
      const located = locateChildComponent(
        { re: parent.center.re + offset * 0.3, im: parent.center.im + offset * 0.2 },
        parent.period,
        rotation,
      );
      if (!located.found) return [`${child.id}: ${located.reason}`];
      const error = distance(located.child.center, child.center);
      const tolerance = 1e-9 * Math.max(componentSizeEstimate(child), 1e-6);
      return error <= Math.max(tolerance, 1e-13) && located.child.period === child.period
        ? []
        : [`${child.id}: off by ${error.toExponential(2)}`];
    });
    expect(misses).toEqual([]);
  });

  it('finds the child from anywhere in the parent, out to |λ| = 0.95 on every side', () => {
    const rabbit = { re: -0.12256116687665362, im: 0.7448617666197442 };
    for (let k = 0; k < 24; k += 1) {
      const phi = (2 * Math.PI * k) / 24;
      const mu = { re: 0.95 * Math.cos(phi), im: 0.95 * Math.sin(phi) };
      // The main cardioid at multiplier μ: c = μ/2 − μ²/4.
      const c = {
        re: mu.re / 2 - (mu.re * mu.re - mu.im * mu.im) / 4,
        im: mu.im / 2 - (2 * mu.re * mu.im) / 4,
      };
      const located = locateChildComponent(c, 1, { numerator: 1, denominator: 3 });
      expect(located, `from arg μ = ${phi.toFixed(2)}`).toMatchObject({ found: true });
      if (located.found) expect(distance(located.child.center, rabbit)).toBeLessThan(1e-13);
    }
  });

  it('refuses rather than guesses', () => {
    expect(locateChildComponent({ re: 0.5, im: 0.5 }, 1, { numerator: 1, denominator: 3 })).toEqual(
      {
        found: false,
        reason: 'no attracting cycle of period 1 was found here',
      },
    );
    expect(locateChildComponent({ re: 0, im: 0 }, 1, { numerator: 3, denominator: 3 }).found).toBe(
      false,
    );
    expect(locateChildComponent({ re: 0, im: 0 }, 2, { numerator: 1, denominator: 3 }).found).toBe(
      false,
    );
  });
});
