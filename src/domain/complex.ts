import type { Complex } from './types';

/**
 * JavaScript has no native complex-number type, so this module operates on the
 * worker-friendly `{ re, im }` representation used at domain boundaries.
 *
 * TODO: Keep this module deliberately minimal: remove helpers without call
 * sites, rename `complexSqrt` to `principalComplexSqrt`, and add tests for its
 * branch semantics. Introduce a general complex-number library only if the
 * non-rendering mathematics grows beyond a small, reviewable operation set.
 * Per-pixel hot paths should continue to use scalar real/imaginary values to
 * avoid allocating an object on every iteration.
 */

export const complexMagnitudeSquared = (value: Complex): number =>
  value.re * value.re + value.im * value.im;

export const complexDistanceSquared = (left: Complex, right: Complex): number => {
  const re = left.re - right.re;
  const im = left.im - right.im;
  return re * re + im * im;
};

export const complexMultiply = (left: Complex, right: Complex): Complex => ({
  re: left.re * right.re - left.im * right.im,
  im: left.re * right.im + left.im * right.re,
});

export const complexSquareAdd = (value: Complex, addend: Complex): Complex => ({
  re: value.re * value.re - value.im * value.im + addend.re,
  im: 2 * value.re * value.im + addend.im,
});

/** Principal square root. */
export const complexSqrt = (value: Complex): Complex => {
  const magnitude = Math.hypot(value.re, value.im);
  const re = Math.sqrt(Math.max(0, (magnitude + value.re) / 2));
  const imMagnitude = Math.sqrt(Math.max(0, (magnitude - value.re) / 2));
  return {
    re,
    im: value.im < 0 ? -imMagnitude : imMagnitude,
  };
};
