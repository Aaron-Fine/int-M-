import type { Complex } from './types';

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
