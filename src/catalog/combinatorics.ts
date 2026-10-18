import { rayModulus, type AngledAddressStep } from './schema';

/**
 * Exact combinatorics of a component from its period p and lower
 * characteristic ray a / (2^p − 1) (ADR 0011, ADR 0014): the kneading
 * sequence, the internal address, and the angled internal address by
 * Schleicher's closed-form rules, which need no table of other components.
 * The loader of the period ≤12 core derives these fields instead of storing
 * them; tests/unit/catalog/ checks them against the Python generator's.
 */

/** For each period p up to 12, the moduli 2^d − 1 of its proper divisors d. */
const DIVISOR_MODULI: readonly (readonly number[])[] = Array.from({ length: 13 }, (_, period) =>
  Array.from({ length: Math.max(0, period - 1) }, (_, index) => index + 1)
    .filter((divisor) => period % divisor === 0)
    .map(rayModulus),
);

/** True when numerator / (2^period − 1) has exact period `period` under doubling. */
export const hasExactRayPeriod = (numerator: number, period: number): boolean => {
  const modulus = rayModulus(period);
  const divisors =
    DIVISOR_MODULI[period] ??
    Array.from({ length: period - 1 }, (_, index) => index + 1)
      .filter((divisor) => period % divisor === 0)
      .map(rayModulus);
  return divisors.every((divisorModulus) => (numerator * divisorModulus) % modulus !== 0);
};

/** ν_1 … ν_p of θ = numerator / (2^p − 1): '1' inside (θ/2, (θ+1)/2), '0' outside, '*' on it. */
export const kneadingSequence = (numerator: number, period: number): string => {
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

/** The internal address 1 → S_1 → … → p of the lower ray numerator / (2^p − 1). */
export const internalAddressOf = (numerator: number, period: number): number[] => {
  const address = [1];
  if (period === 1) return address;
  const rho = rhoOf(kneadingSequence(numerator, period));
  for (let last = 1; last < period; last = rho(last)) address.push(rho(last));
  return address;
};

/** Schleicher's denominator of the angle at `from` on the way to `to`. */
const angledDenominatorOf = (numerator: number, period: number, from: number, to: number) => {
  const rho = rhoOf(kneadingSequence(numerator, period));
  const remainder = to % from || from;
  const orbit = new Set([remainder]);
  for (let current = remainder; current < period;) {
    current = rho(current);
    orbit.add(current);
  }
  return (to - remainder) / from + (orbit.has(from) ? 1 : 2);
};

/** Schleicher: p_k counts j in 0..q_k−2 with 2^(j·S_k)·θ mod 1 in (0, θ], θ the lower ray. */
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

/** The angled internal address of the component whose lower ray is numerator / (2^p − 1). */
export const angledInternalAddressOf = (numerator: number, period: number): AngledAddressStep[] => {
  const address = internalAddressOf(numerator, period);
  return address.slice(1).map((to, index) => {
    const from = address[index] ?? 1;
    const denominator = angledDenominatorOf(numerator, period, from, to);
    return {
      fromPeriod: from,
      toPeriod: to,
      rotation: {
        numerator: angledNumeratorOf(numerator, period, from, denominator),
        denominator,
      },
    };
  });
};

/** The generated label (owner decision 2026-10-17, ADR 0014): "Period 4, rays 6/15 and 9/15". */
export const generatedLabel = (period: number, lower: number, upper: number): string => {
  const modulus = rayModulus(period);
  return `Period ${period}, rays ${lower}/${modulus} and ${upper}/${modulus}`;
};
