import type { Complex } from '../../../../src/domain/types';
import { binary64Units } from './minus-one-jet';

/**
 * Phase 3 work packet 1 research backend: a binary64 delta orbit against a
 * binary64-stored reference, audited per call. See
 * docs/verification/PERTURBATION-BACKEND-PILOT.md.
 *
 * The kernel (`deltaStep`) is plain binary64 in a fixed operation order. The
 * audit decodes every operand and result exactly (BigInt, units 2^-1074) and
 * instantiates `reconstruction_error_le_budget` (ErrorBudget.lean) with the
 * exact reference orbit as `ref`, an exact offset, and outward-rounded
 * budgets. The JS decoder/checker is trusted and tested, not formally
 * verified. Escape semantics only; no period, multiplier or interior claim.
 * No renderer imports this module.
 */

/** Upper bound m * 2^e (m >= 0). Every operation below rounds upward. */
export interface UpperBound {
  readonly m: bigint;
  readonly e: number;
}

const MANTISSA_BITS = 64;
const ZERO_BOUND: UpperBound = { m: 0n, e: 0 };
const UNIT_BITS = 1074;

const HEX_DIGIT_BITS = [0, 1, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4];

/** Bit length of a nonnegative integer. */
function bitLength(value: bigint): number {
  if (value === 0n) return 0;
  const hex = value.toString(16);
  return (hex.length - 1) * 4 + (HEX_DIGIT_BITS[Number.parseInt(hex[0] ?? '0', 16)] ?? 0);
}

function roundUp(m: bigint, e: number): UpperBound {
  if (m === 0n) return ZERO_BOUND;
  const excess = bitLength(m) - MANTISSA_BITS;
  if (excess <= 0) return { m, e };
  const shifted = m >> BigInt(excess);
  const exact = shifted << BigInt(excess) === m;
  return { m: exact ? shifted : shifted + 1n, e: e + excess };
}

export function boundAdd(left: UpperBound, right: UpperBound): UpperBound {
  if (left.m === 0n) return right;
  if (right.m === 0n) return left;
  const e = Math.min(left.e, right.e);
  return roundUp((left.m << BigInt(left.e - e)) + (right.m << BigInt(right.e - e)), e);
}

export function boundMultiply(left: UpperBound, right: UpperBound): UpperBound {
  return roundUp(left.m * right.m, left.e + right.e);
}

const boundScale = (bound: UpperBound, powerOfTwo: number): UpperBound =>
  bound.m === 0n ? bound : { m: bound.m, e: bound.e + powerOfTwo };

/** Upper bound on sqrt(re^2 + im^2) * 2^unitExponent for exact integers. */
export function normUpper(re: bigint, im: bigint, unitExponent: number): UpperBound {
  const squared = re * re + im * im;
  if (squared === 0n) return ZERO_BOUND;
  // Estimate from the top ~106 bits, then confirm exactly: m^2 * 2^shift >= squared.
  let shift = Math.max(0, bitLength(squared) - 106);
  if (shift % 2 === 1) shift += 1;
  const top = Number(squared >> BigInt(shift));
  let m = BigInt(Math.ceil(Math.sqrt(top))) + 2n;
  while ((m * m) << BigInt(shift) < squared) m += 1n;
  return roundUp(m, unitExponent + shift / 2);
}

/** Exact sign of (bound - value * 2^valueExponent). */
function compareBound(bound: UpperBound, value: bigint, valueExponent: number): number {
  const e = Math.min(bound.e, valueExponent);
  const left = bound.m << BigInt(bound.e - e);
  const right = value << BigInt(valueExponent - e);
  return left === right ? 0 : left > right ? 1 : -1;
}

/** (2 + s)^2 as an exact integer at exponent 2 * min(s.e, 0). */
function squaredAroundTwo(s: UpperBound, sign: 1 | -1): { value: bigint; exponent: number } {
  const e = Math.min(s.e, 0);
  const base = (2n << BigInt(-e)) + BigInt(sign) * (s.m << BigInt(s.e - e));
  return { value: base * base, exponent: 2 * e };
}

// ---------------------------------------------------------------------------
// Reference orbit: BigInt ball arithmetic, stored as binary64 with exact error.

/** Grid bits for the reference generator; >= 1074 so binary64 inputs are exact. */
export const REFERENCE_GRID_BITS = 1152;

export interface ReferenceOrbit {
  /** Stored binary64 reference R_k, k = 0..length-1 (interleaved re, im). */
  readonly stored: Float64Array;
  /** s_k >= |R_k - Z_k| for the exact critical orbit Z_k of the reference. */
  readonly storageError: readonly UpperBound[];
  readonly length: number;
}

function toBinary64(units: bigint, gridBits: number): number {
  // Any binary64 value is sound (s_k is computed from the decoded result);
  // this is only near-nearest. Truncate to ~60 bits, then one binary64 rounding.
  const magnitude = units < 0n ? -units : units;
  const shift = Math.max(0, bitLength(magnitude) - 60);
  let approx = Number(magnitude >> BigInt(shift));
  let exponent = shift - gridBits;
  // Scale in steps so 2^exponent itself never underflows.
  for (; exponent < -1000; exponent += 1000) approx *= 2 ** -1000;
  approx *= 2 ** exponent;
  return units < 0n ? -approx : approx;
}

/**
 * Exact critical orbit of `reference` enclosed in balls on a 2^-gridBits grid.
 * Stops after `iterations` steps, once the enclosure leaves |z| <= 4, or once
 * the ball radius exceeds 2^-64 (grid precision exhausted, e.g. on a repelling
 * cycle). Later pixel steps then report `reference-exhausted`.
 */
export function generateReferenceOrbit(
  reference: Complex,
  iterations: number,
  gridBits = REFERENCE_GRID_BITS,
): ReferenceOrbit | null {
  const cReUnits = binary64Units(reference.re);
  const cImUnits = binary64Units(reference.im);
  if (cReUnits === null || cImUnits === null || gridBits < UNIT_BITS) return null;
  const toGrid = BigInt(gridBits - UNIT_BITS);
  const grid = BigInt(gridBits);
  const cRe = cReUnits << toGrid;
  const cIm = cImUnits << toGrid;
  const four = 4n << grid;
  const radiusLimit = 1n << BigInt(gridBits - 64);

  const stored = new Float64Array(2 * (iterations + 1));
  const storageError: UpperBound[] = [ZERO_BOUND];
  let xRe = 0n;
  let xIm = 0n;
  let radius = 0n; // |X_k - Z_k| <= radius * 2^-gridBits
  let length = 1;
  for (let k = 1; k <= iterations; k += 1) {
    const magnitude = normUpper(xRe, xIm, -gridBits);
    // |X^2 - Z^2| <= r (2|X| + r); floor rounding adds < 1 unit per component.
    const twiceMagnitudeUnits = (magnitude.m << BigInt(magnitude.e + gridBits)) * 2n + 2n;
    const spread = radius * (twiceMagnitudeUnits + radius);
    const nextRe = (xRe * xRe - xIm * xIm + (cRe << grid)) >> grid;
    const nextIm = (2n * xRe * xIm + (cIm << grid)) >> grid;
    radius = -(-spread >> grid) + 2n;
    if (radius > radiusLimit) break;
    xRe = nextRe;
    xIm = nextIm;

    const storedRe = toBinary64(xRe, gridBits);
    const storedIm = toBinary64(xIm, gridBits);
    const storedReUnits = binary64Units(storedRe);
    const storedImUnits = binary64Units(storedIm);
    if (storedReUnits === null || storedImUnits === null) break;
    const error = boundAdd(
      normUpper((storedReUnits << toGrid) - xRe, (storedImUnits << toGrid) - xIm, -gridBits),
      roundUp(radius, -gridBits),
    );
    stored[2 * k] = storedRe;
    stored[2 * k + 1] = storedIm;
    storageError.push(error);
    length = k + 1;
    if (compareBound(normUpper(xRe, xIm, 0), four, 0) > 0) break;
  }
  return { stored: stored.subarray(0, 2 * length), storageError, length };
}

// ---------------------------------------------------------------------------
// Binary64 delta kernel: the operation order under specification.

/**
 * One delta step d' = (2R + d) d + offset, evaluated in this exact order:
 *   tRe = 2*rRe + dRe;  tIm = 2*rIm + dIm;
 *   d'Re = ((tRe*dRe) - (tIm*dIm)) + oRe;
 *   d'Im = ((tRe*dIm) + (tIm*dRe)) + oIm.
 */
export function deltaStep(
  rRe: number,
  rIm: number,
  dRe: number,
  dIm: number,
  oRe: number,
  oIm: number,
  out: Float64Array,
): void {
  const tRe = 2 * rRe + dRe;
  const tIm = 2 * rIm + dIm;
  out[0] = tRe * dRe - tIm * dIm + oRe;
  out[1] = tRe * dIm + tIm * dRe + oIm;
}

export type DeltaStep = typeof deltaStep;

// ---------------------------------------------------------------------------
// Per-pixel audit.

export interface TileSpec {
  readonly reference: Complex;
  /** Pixel spacing 2^-stepExponent. */
  readonly stepExponent: number;
  readonly width: number;
  readonly height: number;
  readonly maxIterations: number;
}

export interface PixelState {
  /** Exact R_k + d_k in units 2^-1074. */
  readonly centerRe: bigint;
  readonly centerIm: bigint;
  /** |z_k - (R_k + d_k)| <= radius for the exact target orbit z_k. */
  readonly radius: UpperBound;
  /** Exact d_k in units 2^-1074 and b_k >= |d_k - delta_k|, delta_k = z_k - Z_k. */
  readonly deltaRe: bigint;
  readonly deltaIm: bigint;
  readonly deltaBudget: UpperBound;
}

export type PixelAudit =
  | { readonly status: 'escaped'; readonly iteration: number; readonly state: PixelState }
  | { readonly status: 'bounded'; readonly iteration: number; readonly state: PixelState }
  | {
      readonly status: 'unresolved';
      readonly iteration: number;
      readonly reason: 'escape-ambiguous' | 'reference-exhausted' | 'nonfinite';
      readonly state: PixelState | null;
    };

export type TileAudit =
  | { readonly status: 'audited'; readonly pixels: readonly PixelAudit[] }
  | { readonly status: 'refused'; readonly reason: 'unsupported-tile' | 'reference-failed' };

const MIN_STEP_EXPONENT = 24;
const MAX_STEP_EXPONENT = 1000;
const MAX_TILE_SIDE = 64;
const MAX_ITERATIONS = 4096;

/** The exact offset of pixel (x, y): re = (x - w/2) h, im = (h/2 - y) h. */
export function pixelOffset(spec: TileSpec, x: number, y: number): Complex {
  const step = 2 ** -spec.stepExponent;
  return { re: (x - spec.width / 2) * step, im: (spec.height / 2 - y) * step };
}

function supported(spec: TileSpec): boolean {
  const { stepExponent, width, height, maxIterations } = spec;
  return (
    Number.isInteger(stepExponent) &&
    stepExponent >= MIN_STEP_EXPONENT &&
    stepExponent <= MAX_STEP_EXPONENT &&
    [width, height].every(
      (side) => Number.isInteger(side) && side >= 2 && side <= MAX_TILE_SIDE && side % 2 === 0,
    ) &&
    Number.isInteger(maxIterations) &&
    maxIterations >= 1 &&
    maxIterations <= MAX_ITERATIONS &&
    Number.isFinite(spec.reference.re) &&
    Number.isFinite(spec.reference.im) &&
    spec.reference.re * spec.reference.re + spec.reference.im * spec.reference.im <= 4
  );
}

function decodePair(re: number, im: number): IntegerPair | null {
  const reUnits = binary64Units(re);
  const imUnits = binary64Units(im);
  return reUnits === null || imUnits === null ? null : { re: reUnits, im: imUnits };
}

function classify(
  centerRe: bigint,
  centerIm: bigint,
  radius: UpperBound,
): 'escaped' | 'inside' | 'ambiguous' {
  const squared = centerRe * centerRe + centerIm * centerIm; // units 2^-2148
  const outer = squaredAroundTwo(radius, 1);
  if (compareBound({ m: squared, e: -2 * UNIT_BITS }, outer.value, outer.exponent) > 0) {
    return 'escaped';
  }
  if (compareBound(radius, 2n, 0) > 0) return 'ambiguous';
  const inner = squaredAroundTwo(radius, -1);
  return compareBound({ m: squared, e: -2 * UNIT_BITS }, inner.value, inner.exponent) <= 0
    ? 'inside'
    : 'ambiguous';
}

interface IntegerPair {
  readonly re: bigint;
  readonly im: bigint;
}

interface ReferenceEntry {
  readonly re: number;
  readonly im: number;
  readonly units: IntegerPair;
  /** s_k >= |R_k - Z_k|. */
  readonly storage: UpperBound;
}

function referenceAt(reference: ReferenceOrbit, k: number): ReferenceEntry | null {
  const re = reference.stored[2 * k] ?? Number.NaN;
  const im = reference.stored[2 * k + 1] ?? Number.NaN;
  const units = decodePair(re, im);
  const storage = reference.storageError[k];
  return units === null || storage === undefined ? null : { re, im, units, storage };
}

/**
 * b_{k+1} = 2 M_k b_k + b_k^2 + F_k (errorBudget, ErrorBudget.lean), rounded up,
 * with the exact reference orbit Z as `ref`, rho_R = rho_C = 0, and
 *   F_k = |eta_k| + 2 s_k |d_k|,  eta_k = d_{k+1} - (2 R_k d_k + d_k^2 + offset),
 *   M_k = |R_k + d_k| + s_k + b_k >= |z_k|.
 */
function nextBudget(
  r: ReferenceEntry,
  d: IntegerPair,
  next: IntegerPair,
  offset: IntegerPair,
  budget: UpperBound,
): UpperBound {
  // eta_k exactly, in units 2^-2148.
  const twoRe = 2n * r.units.re;
  const twoIm = 2n * r.units.im;
  const etaRe =
    (next.re << 1074n) -
    (twoRe * d.re - twoIm * d.im + (d.re * d.re - d.im * d.im) + (offset.re << 1074n));
  const etaIm =
    (next.im << 1074n) - (twoRe * d.im + twoIm * d.re + 2n * d.re * d.im + (offset.im << 1074n));
  const eta = roundUp(
    (etaRe < 0n ? -etaRe : etaRe) + (etaIm < 0n ? -etaIm : etaIm),
    -2 * UNIT_BITS,
  );
  const deltaNorm = normUpper(d.re, d.im, -UNIT_BITS);
  const forcing = boundAdd(eta, boundScale(boundMultiply(r.storage, deltaNorm), 1));
  const targetRadius = boundAdd(
    normUpper(r.units.re + d.re, r.units.im + d.im, -UNIT_BITS),
    boundAdd(r.storage, budget),
  );
  return boundAdd(
    boundAdd(boundScale(boundMultiply(targetRadius, budget), 1), boundMultiply(budget, budget)),
    forcing,
  );
}

/**
 * Run the kernel for one pixel and audit every step. `step` defaults to
 * `deltaStep`; tests substitute corrupted kernels.
 */
export function auditPixel(
  reference: ReferenceOrbit,
  offset: Complex,
  maxIterations: number,
  step: DeltaStep = deltaStep,
): PixelAudit {
  const offsetUnits = decodePair(offset.re, offset.im);
  if (offsetUnits === null) {
    return { status: 'unresolved', iteration: 0, reason: 'nonfinite', state: null };
  }
  const scratch = new Float64Array(2);
  let dRe = 0;
  let dIm = 0;
  let d: IntegerPair = { re: 0n, im: 0n };
  let budget = ZERO_BOUND; // b_k >= |Z_k + d_k - z_k|
  let state: PixelState | null = null;

  for (let k = 0; k < maxIterations; k += 1) {
    const iteration = k + 1;
    if (iteration >= reference.length) {
      return { status: 'unresolved', iteration, reason: 'reference-exhausted', state };
    }
    const r = referenceAt(reference, k);
    const rNext = referenceAt(reference, iteration);
    step(r?.re ?? Number.NaN, r?.im ?? Number.NaN, dRe, dIm, offset.re, offset.im, scratch);
    dRe = scratch[0] ?? Number.NaN;
    dIm = scratch[1] ?? Number.NaN;
    const next = decodePair(dRe, dIm);
    if (r === null || rNext === null || next === null) {
      return { status: 'unresolved', iteration, reason: 'nonfinite', state };
    }
    budget = nextBudget(r, d, next, offsetUnits, budget);
    d = next;
    state = {
      centerRe: rNext.units.re + d.re,
      centerIm: rNext.units.im + d.im,
      radius: boundAdd(rNext.storage, budget),
      deltaRe: d.re,
      deltaIm: d.im,
      deltaBudget: budget,
    };
    const verdict = classify(state.centerRe, state.centerIm, state.radius);
    if (verdict === 'escaped') return { status: 'escaped', iteration, state };
    if (verdict === 'ambiguous') {
      return { status: 'unresolved', iteration, reason: 'escape-ambiguous', state };
    }
  }
  if (state === null) return { status: 'unresolved', iteration: 0, reason: 'nonfinite', state };
  return { status: 'bounded', iteration: maxIterations, state };
}

/** Audit every pixel of one tile, row-major from the top-left. */
export function auditPerturbationTile(spec: TileSpec, step: DeltaStep = deltaStep): TileAudit {
  if (!supported(spec)) return { status: 'refused', reason: 'unsupported-tile' };
  const reference = generateReferenceOrbit(
    { re: spec.reference.re, im: spec.reference.im },
    spec.maxIterations,
  );
  if (reference === null) return { status: 'refused', reason: 'reference-failed' };
  const pixels: PixelAudit[] = [];
  for (let y = 0; y < spec.height; y += 1) {
    for (let x = 0; x < spec.width; x += 1) {
      pixels.push(auditPixel(reference, pixelOffset(spec, x, y), spec.maxIterations, step));
    }
  }
  return { status: 'audited', pixels };
}
