import { complexMultiply } from '../../../../src/domain/complex';
import type { Complex } from '../../../../src/domain/types';

/**
 * Bounded P4 research evaluator: c=-1, seed=0, order=3, n<=16.
 *
 * Actual operands/results are decoded exactly and checked against the existing
 * Lean Horner residual contract. The JS decoder/checker is trusted and tested;
 * `audited` does not mean a formally verified TypeScript execution. See
 * docs/verification/NUMERICAL-KERNEL-PILOT.md. No renderer imports this module.
 */
export type MinusOneJetResult =
  | {
      readonly status: 'audited';
      readonly value: Complex;
      readonly errorBound: { readonly numerator: bigint; readonly denominator: bigint };
    }
  | {
      readonly status: 'refused';
      readonly reason:
        'invalid-iteration' | 'nonfinite-offset' | 'outside-disk' | 'arithmetic-budget';
    };

// Exact integer rows, checked by minusOneJetKernelCoefficient_eq in Lean.
// Keep the finite literal in sync with MinusOneJetKernel.lean (parity test).
const COEFFICIENTS: readonly (readonly [number, number, number, number])[] = [
  [0, 0, 0, 0],
  [-1, 1, 0, 0],
  [0, -1, 1, 0],
  [-1, 1, 1, -2],
  [0, -1, -1, 6],
  [-1, 1, 1, 2],
  [0, -1, -1, -2],
  [-1, 1, 1, 2],
  [0, -1, -1, -2],
  [-1, 1, 1, 2],
  [0, -1, -1, -2],
  [-1, 1, 1, 2],
  [0, -1, -1, -2],
  [-1, 1, 1, 2],
  [0, -1, -1, -2],
  [-1, 1, 1, 2],
  [0, -1, -1, -2],
];

const bits = new DataView(new ArrayBuffer(8));
const FRACTION_MASK = (1n << 52n) - 1n;
const UNIT_BITS = 1074n;
const MULTIPLY_LIMIT = 1n << (2n * UNIT_BITS - 40n);
const ADD_LIMIT = 1n << (UNIT_BITS - 40n);
const DISK_SQUARED_LIMIT = 1n << (2n * UNIT_BITS - 16n);

/** Exact x * 2^1074 for finite binary64 x, including subnormals and both zeros. */
export function binary64Units(value: number): bigint | null {
  bits.setFloat64(0, value, false);
  const word = bits.getBigUint64(0, false);
  const exponent = (word >> 52n) & 2047n;
  if (exponent === 2047n) return null;
  const fraction = word & FRACTION_MASK;
  const magnitude = exponent === 0n ? fraction : ((1n << 52n) | fraction) << (exponent - 1n);
  return word >> 63n === 0n ? magnitude : -magnitude;
}

interface IntegerComplex {
  readonly re: bigint;
  readonly im: bigint;
}

function decoded(value: Complex): IntegerComplex | null {
  const re = binary64Units(value.re);
  const im = binary64Units(value.im);
  return re === null || im === null ? null : { re, im };
}

const abs = (value: bigint): bigint => (value < 0n ? -value : value);

function multiplyFits(
  left: IntegerComplex,
  right: IntegerComplex,
  result: IntegerComplex,
): boolean {
  const re = (result.re << UNIT_BITS) - (left.re * right.re - left.im * right.im);
  const im = (result.im << UNIT_BITS) - (left.re * right.im + left.im * right.re);
  // Sum of component absolute residuals bounds the complex Euclidean norm.
  return abs(re) + abs(im) <= MULTIPLY_LIMIT;
}

function addFits(coefficient: number, product: IntegerComplex, result: IntegerComplex): boolean {
  const re = result.re - (BigInt(coefficient) << UNIT_BITS) - product.re;
  const im = result.im - product.im;
  return abs(re) + abs(im) <= ADD_LIMIT;
}

/**
 * Audit one orbit approximation at the mathematical parameter -1 + offset.
 * The bound is exact 1/1000000; a separately rounded parameter sum or intended
 * input conversion is not included. Unsupported input/check failure refuses.
 */
export function evaluateMinusOneJet(offset: Complex, iteration: number): MinusOneJetResult {
  if (!Number.isInteger(iteration) || iteration < 0 || iteration > 16) {
    return { status: 'refused', reason: 'invalid-iteration' };
  }
  // Use one captured input for disk membership, all operations, and the target.
  const delta = { re: offset.re, im: offset.im };
  const deltaUnits = decoded(delta);
  if (deltaUnits === null) return { status: 'refused', reason: 'nonfinite-offset' };
  if (deltaUnits.re * deltaUnits.re + deltaUnits.im * deltaUnits.im > DISK_SQUARED_LIMIT) {
    return { status: 'refused', reason: 'outside-disk' };
  }
  const row = COEFFICIENTS[iteration];
  if (row === undefined) return { status: 'refused', reason: 'invalid-iteration' };
  let value: Complex = { re: row[3], im: 0 };
  let units: IntegerComplex = { re: BigInt(row[3]) << UNIT_BITS, im: 0n };
  for (let k = 2; k >= 0; k--) {
    const coefficient = row[k];
    if (coefficient === undefined) return { status: 'refused', reason: 'arithmetic-budget' };
    const product = complexMultiply(delta, value);
    const productUnits = decoded(product);
    if (productUnits === null || !multiplyFits(deltaUnits, units, productUnits)) {
      return { status: 'refused', reason: 'arithmetic-budget' };
    }
    const next = { re: coefficient + product.re, im: 0 + product.im };
    const nextUnits = decoded(next);
    if (nextUnits === null || !addFits(coefficient, productUnits, nextUnits)) {
      return { status: 'refused', reason: 'arithmetic-budget' };
    }
    value = next;
    units = nextUnits;
  }
  return { status: 'audited', value, errorBound: { numerator: 1n, denominator: 1000000n } };
}
