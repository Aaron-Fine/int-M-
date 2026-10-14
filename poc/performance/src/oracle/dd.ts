/**
 * Double-double (compensated) real arithmetic for the PoC oracle.
 *
 * A double-double represents a real number as an unevaluated sum hi + lo with
 * |lo| <= ulp(hi)/2, giving roughly 106 bits (~32 decimal digits) of working
 * precision from plain binary64 pairs. The oracle uses it to adjudicate the
 * binary64 kernels; it is deliberately not allocation-free.
 *
 * References: Dekker 1971 (splitting/two-product), Knuth two-sum.
 */

export interface DD {
  readonly hi: number;
  readonly lo: number;
}

/** |lo| <= ulp(hi)/2 for the result of a + b, exact rounding of the sum. */
export const twoSum = (a: number, b: number): DD => {
  const sum = a + b;
  const offset = sum - a;
  return { hi: sum, lo: a - (sum - offset) + (b - offset) };
};

/** Exact when |a| >= |b|; used where the relative sizes are known. */
export const quickTwoSum = (a: number, b: number): DD => {
  const sum = a + b;
  return { hi: sum, lo: b - (sum - a) };
};

/** Dekker splitting constant: 2^27 + 1. */
const SPLITTER = 134217729;

/** Splits x into hi + lo with hi holding the leading 27 mantissa bits. */
const split = (x: number): DD => {
  const t = SPLITTER * x;
  const hi = t - (t - x);
  return { hi, lo: x - hi };
};

/** Dekker two-product: p = a*b rounded, lo = exact error of the rounding. */
export const twoProd = (a: number, b: number): DD => {
  const product = a * b;
  const aSplit = split(a);
  const bSplit = split(b);
  const lo =
    aSplit.hi * bSplit.hi -
    product +
    aSplit.hi * bSplit.lo +
    aSplit.lo * bSplit.hi +
    aSplit.lo * bSplit.lo;
  return { hi: product, lo };
};

export const ddAdd = (a: DD, b: DD): DD => {
  const sum = twoSum(a.hi, b.hi);
  return quickTwoSum(sum.hi, sum.lo + a.lo + b.lo);
};

/** Adding an exact binary64 value keeps the pair renormalized. */
export const ddAddD = (a: DD, b: number): DD => {
  const sum = twoSum(a.hi, b);
  return quickTwoSum(sum.hi, sum.lo + a.lo);
};

export const ddSub = (a: DD, b: DD): DD => ddAdd(a, { hi: -b.hi, lo: -b.lo });

export const ddMul = (a: DD, b: DD): DD => {
  const product = twoProd(a.hi, b.hi);
  const error = product.lo + (a.hi * b.lo + a.lo * b.hi) + a.lo * b.lo;
  return twoSum(product.hi, error);
};

/** Multiplying by an exact binary64 value; twoSum keeps the pair renormalized. */
export const ddMulD = (a: DD, b: number): DD => {
  const product = twoProd(a.hi, b);
  return twoSum(product.hi, product.lo + a.lo * b);
};

/** Division is used only by the oracle Newton polish, so a three-term quotient suffices. */
export const ddDiv = (a: DD, b: DD): DD => {
  const q1 = a.hi / b.hi;
  const rem1 = ddSub(a, ddMulD(b, q1));
  const q2 = rem1.hi / b.hi;
  const rem2 = ddSub(rem1, ddMulD(b, q2));
  const q3 = rem2.hi / b.hi;
  return ddAddD(quickTwoSum(q1, q2), q3);
};

export const ddSqr = (a: DD): DD => ddMul(a, a);

export const ddToNumber = (a: DD): number => a.hi + a.lo;
