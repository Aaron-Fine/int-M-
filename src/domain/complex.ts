import type { Complex } from './types';

/**
 * JavaScript has no native complex-number type, so this module operates on the
 * worker-friendly `{ re, im }` representation used at domain boundaries.
 *
 * TODO: Keep this module deliberately minimal: remove helpers without call
 * sites. Introduce a general complex-number library only if the
 * non-rendering mathematics grows beyond a small, reviewable operation set.
 * Per-pixel hot paths use scalar real/imaginary values to avoid allocating
 * an object on every iteration (see classifyInto in ./orbit.ts).
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
