import { describe, expect, it } from 'vitest';

import {
  CATALOG,
  catalogIdFor,
  COMPONENT_CATALOG,
  findCatalogComponent,
  rayModulus,
  type CatalogComponent,
} from '../../../src/catalog/components';
import { V1_CATALOG } from './v1-catalog';

/** Hyperbolic components of exact period p (OEIS A000740), p = 1..12; 4,016 in all. */
const COMPONENT_COUNTS = [1, 1, 3, 6, 15, 27, 63, 120, 252, 495, 1023, 2010];

const properDivisors = (n: number): number[] =>
  Array.from({ length: n - 1 }, (_, index) => index + 1).filter((d) => n % d === 0);

/** |f_c^n(0)| in binary64. */
const orbitAbs = (component: CatalogComponent, n: number): number => {
  let re = 0;
  let im = 0;
  for (let step = 0; step < n; step += 1) {
    [re, im] = [re * re - im * im + component.center.re, 2 * re * im + component.center.im];
  }
  return Math.hypot(re, im);
};

/** Kneading sequence of numerator / (2^p - 1): '1' inside (θ/2, (θ+1)/2), '0' outside, '*' on it. */
const kneading = (numerator: number, period: number): string => {
  const modulus = rayModulus(period);
  let angle = numerator;
  let symbols = '';
  for (let step = 0; step < period; step += 1) {
    const doubled = 2 * angle;
    if (doubled === numerator || doubled === numerator + modulus) symbols += '*';
    else symbols += doubled > numerator && doubled < numerator + modulus ? '1' : '0';
    angle = doubled % modulus;
  }
  return symbols;
};

/** Schleicher's ρ: the first m > n where the kneading sequence differs from its n-shift. */
const rhoOf =
  (symbols: string) =>
  (start: number): number => {
    const symbol = (index: number): string => symbols[(index - 1) % symbols.length] ?? '';
    let candidate = start + 1;
    while (candidate < symbols.length && symbol(candidate) === symbol(candidate - start)) {
      candidate += 1;
    }
    return candidate;
  };

const internalAddressOf = (numerator: number, period: number): number[] => {
  const address = [1];
  if (period === 1) return address;
  const rho = rhoOf(kneading(numerator, period));
  while (address.at(-1)! < period) address.push(rho(address.at(-1)!));
  return address;
};

/** Schleicher's denominator of the angle at `from` on the way to `to`. */
const angledDenominatorOf = (numerator: number, period: number, from: number, to: number) => {
  const rho = rhoOf(kneading(numerator, period));
  const remainder = to % from || from;
  const orbit = new Set([remainder]);
  for (let current = remainder; current < period;) {
    current = rho(current);
    orbit.add(current);
  }
  return (to - remainder) / from + (orbit.has(from) ? 1 : 2);
};

/** Schleicher: p_k counts j in 0..q_k-2 with 2^(j·S_k)·θ mod 1 in (0, θ], θ the lower ray. */
const angledNumeratorOf = (
  numerator: number,
  period: number,
  from: number,
  denominator: number,
): number => {
  const modulus = rayModulus(period);
  let count = 0;
  for (let j = 0, angle = numerator; j < denominator - 1; j += 1) {
    if (angle !== 0 && angle <= numerator) count += 1;
    angle = (angle * 2 ** from) % modulus;
  }
  return count;
};

const hasExactRayPeriod = (numerator: number, period: number): boolean =>
  properDivisors(period).every(
    (divisor) => (numerator * rayModulus(divisor)) % rayModulus(period) !== 0,
  );

const raysOf = (component: CatalogComponent): readonly [number, number] => {
  const rays = component.characteristicRays;
  return rays === undefined ? [0, 1] : [rays[0].numerator, rays[1].numerator];
};

describe('component catalog', () => {
  it('lists every component of each period up to its maximum, once', () => {
    const counts = Array.from(
      { length: CATALOG.maxPeriod },
      (_, index) => COMPONENT_CATALOG.filter((component) => component.period === index + 1).length,
    );
    expect(counts).toEqual(COMPONENT_COUNTS.slice(0, CATALOG.maxPeriod));
  });

  it('keeps the v1 order, which is the keyboard focus order of the markers', () => {
    expect(COMPONENT_CATALOG.map((component) => component.id)).toEqual(
      V1_CATALOG.map((entry) => entry.id),
    );
  });

  it('has unique ids and aliases', () => {
    const names = COMPONENT_CATALOG.flatMap((component) => [component.id, ...component.aliases]);
    expect(new Set(names).size).toBe(names.length);
  });

  it('derives every id from the period and the characteristic rays', () => {
    for (const component of COMPONENT_CATALOG) {
      const [lower, upper] = raysOf(component);
      expect(component.id).toBe(catalogIdFor(component.period, lower, upper));
    }
  });

  it('stores centres of exact period, not of a divisor period', () => {
    for (const component of COMPONENT_CATALOG) {
      expect(orbitAbs(component, component.period), component.id).toBeLessThan(1e-12);
      for (const divisor of properDivisors(component.period)) {
        expect(orbitAbs(component, divisor), `${component.id} at ${divisor}`).toBeGreaterThan(1e-3);
      }
    }
  });

  it('declares residuals within the published bounds', () => {
    for (const { id, center, period, residual } of COMPONENT_CATALOG) {
      const scale = Math.max(1, Math.hypot(center.re, center.im));
      expect(residual.centerError, id).toBeLessThanOrEqual(Number.EPSILON * scale);
      expect(residual.orbitAbs, id).toBeLessThan(1e-14);
      if (period > 1) expect(residual.properDivisorOrbitMinAbs, id).toBeGreaterThan(1e-3);
    }
  });

  it('pairs two rays of exact period p over 2^p - 1', () => {
    for (const component of COMPONENT_CATALOG.filter((entry) => entry.period > 1)) {
      const [lower, upper] = raysOf(component);
      expect(lower, component.id).toBeLessThan(upper);
      expect(hasExactRayPeriod(lower, component.period), component.id).toBe(true);
      expect(hasExactRayPeriod(upper, component.period), component.id).toBe(true);
      // Both characteristic rays of a component share its kneading sequence.
      expect(kneading(upper, component.period)).toBe(kneading(lower, component.period));
    }
  });

  it('states the internal address the lower ray determines', () => {
    for (const component of COMPONENT_CATALOG) {
      expect(component.internalAddress, component.id).toEqual(
        internalAddressOf(raysOf(component)[0], component.period),
      );
    }
  });

  it('states angled addresses recomputed from the lower ray', () => {
    for (const component of COMPONENT_CATALOG.filter((entry) => entry.period > 1)) {
      const [lower] = raysOf(component);
      const address = internalAddressOf(lower, component.period);
      const steps = component.angledInternalAddress;
      expect(steps, component.id).toBeDefined();
      expect(steps, component.id).toHaveLength(address.length - 1);
      steps!.forEach((step, index) => {
        const from = address[index]!;
        const to = address[index + 1]!;
        expect(step.fromPeriod, component.id).toBe(from);
        expect(step.toPeriod, component.id).toBe(to);
        const denominator = angledDenominatorOf(lower, component.period, from, to);
        expect(step.rotation, `${component.id} ${from}->${to}`).toEqual({
          numerator: angledNumeratorOf(lower, component.period, from, denominator),
          denominator,
        });
      });
    }
  });

  it('puts the rays and the centre in the same half-plane', () => {
    for (const { id, period, center, characteristicRays } of COMPONENT_CATALOG) {
      if (characteristicRays === undefined) continue;
      const half = rayModulus(period);
      const lower = characteristicRays[0].numerator;
      const upper = characteristicRays[1].numerator;
      if (center.im > 0) expect(2 * upper, id).toBeLessThan(half);
      else if (center.im < 0) expect(2 * lower, id).toBeGreaterThan(half);
      else expect(lower + upper, id).toBe(half);
    }
  });

  it('is closed under complex conjugation, mirroring rays and angles', () => {
    for (const component of COMPONENT_CATALOG) {
      const modulus = rayModulus(component.period);
      const [lower, upper] = raysOf(component);
      const mirror = COMPONENT_CATALOG.find(
        (other) =>
          other.period === component.period &&
          other.center.re === component.center.re &&
          other.center.im === -component.center.im,
      );
      expect(mirror, component.id).toBeDefined();
      if (component.period === 1 || mirror === undefined) continue;
      expect(raysOf(mirror)).toEqual([modulus - upper, modulus - lower]);
      expect(mirror.angledInternalAddress?.map((step) => step.rotation)).toEqual(
        component.angledInternalAddress?.map(({ rotation }) => ({
          numerator: rotation.denominator - rotation.numerator,
          denominator: rotation.denominator,
        })),
      );
    }
  });

  it('keeps every v1 id as an alias of the same component, label and centre', () => {
    for (const entry of V1_CATALOG) {
      const component = findCatalogComponent(entry.v1Id);
      expect(component?.id, entry.v1Id).toBe(entry.id);
      expect(component?.aliases, entry.v1Id).toContain(entry.v1Id);
      expect(component?.label, entry.v1Id).toBe(entry.label);
      const moved = Math.hypot(
        (component?.center.re ?? Infinity) - entry.center.re,
        (component?.center.im ?? Infinity) - entry.center.im,
      );
      expect(moved, entry.v1Id).toBeLessThanOrEqual(2.1e-15);
    }
  });

  it('agrees with every combinatorial field the v1 catalog had reviewed', () => {
    const reviewed = (id: string) => findCatalogComponent(id);
    expect(reviewed('mi-p1-main')?.internalAddress).toEqual([1]);
    expect(reviewed('mi-p2-basilica')?.angledInternalAddress).toEqual([
      { fromPeriod: 1, toPeriod: 2, rotation: { numerator: 1, denominator: 2 } },
    ]);
    expect(raysOf(reviewed('mi-p3-airplane')!)).toEqual([3, 4]);
    expect(reviewed('mi-p3-airplane')?.internalAddress).toEqual([1, 2, 3]);
    expect(reviewed('mi-p3-airplane')?.angledInternalAddress).toEqual([
      { fromPeriod: 1, toPeriod: 2, rotation: { numerator: 1, denominator: 2 } },
      { fromPeriod: 2, toPeriod: 3, rotation: { numerator: 1, denominator: 2 } },
    ]);
    expect(reviewed('mi-p3-corabbit')?.angledInternalAddress).toEqual([
      { fromPeriod: 1, toPeriod: 3, rotation: { numerator: 2, denominator: 3 } },
    ]);
    expect(raysOf(reviewed('mi-p3-corabbit')!)).toEqual([5, 6]);
    expect(reviewed('mi-p3-rabbit')?.angledInternalAddress).toEqual([
      { fromPeriod: 1, toPeriod: 3, rotation: { numerator: 1, denominator: 3 } },
    ]);
    expect(raysOf(reviewed('mi-p3-rabbit')!)).toEqual([1, 2]);
    expect(reviewed('mi-p4-02')?.internalAddress).toEqual([1, 2, 4]);
  });

  it('gives the six period-4 entries their addresses', () => {
    const addresses = Object.fromEntries(
      COMPONENT_CATALOG.filter((entry) => entry.period === 4).map((entry) => [
        entry.id,
        entry.angledInternalAddress
          ?.map((s) => `${s.fromPeriod}-${s.rotation.numerator}/${s.rotation.denominator}->`)
          .join('')
          .concat('4'),
      ]),
    );
    expect(addresses).toEqual({
      'mi-p4-7-8': '1-1/2->2-1/2->3-1/2->4',
      'mi-p4-6-9': '1-1/2->2-1/2->4',
      'mi-p4-11-12': '1-2/3->3-1/2->4',
      'mi-p4-3-4': '1-1/3->3-1/2->4',
      'mi-p4-13-14': '1-3/4->4',
      'mi-p4-1-2': '1-1/4->4',
    });
  });
});
