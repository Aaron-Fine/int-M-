import { TAU_CLOSURE_SCALED, VERIFIER_THRESHOLDS } from '../../../../src/domain/verifier';
import type { Complex } from '../../../../src/domain/types';
import { binary64Units } from './minus-one-jet';
import {
  auditPixel,
  generateReferenceOrbit,
  isSupportedTile,
  normUpper,
  pixelOffset,
  type PixelAudit,
  type PixelState,
  type TileSpec,
  type UpperBound,
} from './perturbation-tile';

/**
 * Phase 3 work packet 3 research pilot: the V0 verifier decision
 * (VerifierModel.lean `reference`) evaluated on the exact frames of the true
 * target orbit, certified from the packet 1 audited enclosures. See
 * docs/verification/PERTURBATION-VERIFIER-PILOT.md.
 *
 * Exact frames for cycle start zeta = z_m and proposed period p:
 *   residual_j = |z_{m+j} - z_m|,  lambda_j = prod_{i<j} 2 z_{m+i},
 * thresholds (exact products of the decoded binary64 policy constants):
 *   accept = TAU_CLOSURE_SCALED * s,  exclude = tauExclude * s,
 *   attractUpper = 1 - attractMargin (one binary64 subtraction, as in
 *   verifier.ts),  s = max(1, |Re zeta|, |Im zeta|).
 * Every comparison V0 reaches must hold for every value the enclosures
 * admit; otherwise the result is `uncertified`, never a guess. The JS
 * checker is trusted and tested, not formally verified. No renderer imports
 * this module.
 */

/** Exact dyadic n * 2^e (n may be negative). */
interface Dyadic {
  readonly n: bigint;
  readonly e: number;
}

const UNIT_BITS = 1074;
const fromUnits = (units: bigint): Dyadic => ({ n: units, e: -UNIT_BITS });
const fromBound = (bound: UpperBound): Dyadic => ({ n: bound.m, e: bound.e });
const ZERO: Dyadic = { n: 0n, e: 0 };
const ONE: Dyadic = { n: 1n, e: 0 };

function decodedConstant(value: number): Dyadic {
  const units = binary64Units(value);
  if (units === null) throw new Error('nonfinite policy constant');
  return fromUnits(units);
}

const at = (value: Dyadic, e: number): bigint => value.n << BigInt(value.e - e);

function add(left: Dyadic, right: Dyadic): Dyadic {
  const e = Math.min(left.e, right.e);
  return { n: at(left, e) + at(right, e), e };
}

const negate = (value: Dyadic): Dyadic => ({ n: -value.n, e: value.e });
const subtract = (left: Dyadic, right: Dyadic): Dyadic => add(left, negate(right));
const multiply = (left: Dyadic, right: Dyadic): Dyadic => ({
  n: left.n * right.n,
  e: left.e + right.e,
});
const absolute = (value: Dyadic): Dyadic => (value.n < 0n ? negate(value) : value);

function compare(left: Dyadic, right: Dyadic): number {
  const e = Math.min(left.e, right.e);
  const l = at(left, e);
  const r = at(right, e);
  return l === r ? 0 : l > r ? 1 : -1;
}

/** Nearby binary64 value (proposal arithmetic only; never used to certify). */
function approximate(value: Dyadic): number {
  const magnitude = value.n < 0n ? -value.n : value.n;
  const shift = Math.max(0, magnitude.toString(16).length * 4 - 60);
  const result = Number(magnitude >> BigInt(shift)) * 2 ** (value.e + shift);
  return value.n < 0n ? -result : result;
}

const maximum = (...values: readonly Dyadic[]): Dyadic =>
  values.reduce((best, value) => (compare(value, best) > 0 ? value : best));

/** A complex value known to lie within `radius` of the exact `center`. */
interface Disk {
  readonly re: Dyadic;
  readonly im: Dyadic;
  readonly radius: Dyadic;
}

const diskOf = (state: PixelState): Disk => ({
  re: fromUnits(state.centerRe),
  im: fromUnits(state.centerIm),
  radius: fromBound(state.radius),
});

const magnitudeSquared = (re: Dyadic, im: Dyadic): Dyadic =>
  add(multiply(re, re), multiply(im, im));

type Certified = boolean | null;

/**
 * Certify (|w| <= theta) or (|w| < theta) for every w within `radius` of
 * `center` and every theta in [thetaLo, thetaHi]. Exact squared comparisons.
 */
function certifyBelow(
  re: Dyadic,
  im: Dyadic,
  radius: Dyadic,
  thetaLo: Dyadic,
  thetaHi: Dyadic,
  strict: boolean,
): Certified {
  const squared = magnitudeSquared(re, im);
  const inner = subtract(thetaLo, radius);
  if (compare(inner, ZERO) >= 0) {
    // True when |center| + radius (<= or <) thetaLo.
    const sign = compare(squared, multiply(inner, inner));
    if (strict ? sign < 0 && compare(inner, ZERO) > 0 : sign <= 0) return true;
  }
  // False when |center| - radius (> or >=) thetaHi.
  const outer = add(thetaHi, radius);
  const sign = compare(squared, multiply(outer, outer));
  if (strict ? sign >= 0 : sign > 0) return false;
  return null;
}

export const PERTURBATION_POLICY = Object.freeze({
  accept: decodedConstant(TAU_CLOSURE_SCALED),
  exclude: decodedConstant(VERIFIER_THRESHOLDS.tauExclude),
  attractUpper: decodedConstant(1 - VERIFIER_THRESHOLDS.attractMargin),
  candidate: VERIFIER_THRESHOLDS.tauCandidate,
});

export type CertifiedVerdict =
  | { readonly verdict: 'accepted'; readonly period: number }
  | {
      readonly verdict: 'no-closure' | 'closure-ambiguous' | 'divisor-ambiguous' | 'not-attracting';
    }
  | { readonly verdict: 'uncertified'; readonly at: 'closure' | 'divisor' | 'multiplier' };

/** Compact code shared with tools/perturbation_oracle.py. */
export function verdictCode(verdict: CertifiedVerdict): string {
  switch (verdict.verdict) {
    case 'accepted':
      return `A${verdict.period}`;
    case 'no-closure':
      return 'N';
    case 'closure-ambiguous':
      return 'C';
    case 'divisor-ambiguous':
      return 'D';
    case 'not-attracting':
      return 'X';
    case 'uncertified':
      return 'U';
  }
}

/** Positive proper divisors of n in ascending order (VerifierModel.properDivisors). */
export function properDivisors(n: number): number[] {
  const divisors: number[] = [];
  for (let d = 1; d < n; d += 1) if (n % d === 0) divisors.push(d);
  return divisors;
}

/** Window of disks enclosing z_m .. z_{m+P}; disks[0] is the cycle start. */
export class CycleWindow {
  readonly #disks: readonly Disk[];
  readonly #scaleLo: Dyadic;
  readonly #scaleHi: Dyadic;

  public constructor(states: readonly PixelState[]) {
    this.#disks = states.map(diskOf);
    const start = this.#disks[0];
    if (start === undefined) throw new Error('empty cycle window');
    const re = absolute(start.re);
    const im = absolute(start.im);
    this.#scaleLo = maximum(ONE, subtract(re, start.radius), subtract(im, start.radius));
    this.#scaleHi = maximum(ONE, add(re, start.radius), add(im, start.radius));
  }

  public get maxPeriod(): number {
    return this.#disks.length - 1;
  }

  #disk(index: number): Disk {
    const disk = this.#disks[index];
    if (disk === undefined) throw new Error(`no disk ${index}`);
    return disk;
  }

  /** residual_j (<= or <) threshold * scale, certified or null. */
  #residualBelow(j: number, threshold: Dyadic, strict: boolean): Certified {
    const start = this.#disk(0);
    const end = this.#disk(j);
    return certifyBelow(
      subtract(end.re, start.re),
      subtract(end.im, start.im),
      add(end.radius, start.radius),
      multiply(threshold, this.#scaleLo),
      multiply(threshold, this.#scaleHi),
      strict,
    );
  }

  /** |lambda_d| < attractUpper, certified or null. */
  #attracting(period: number): Certified {
    // Exact centre product, and the exact bound
    //   |prod 2z - prod 2a| <= prod (A_i + 2 eps_i) - prod A_i,  A_i >= |2 a_i|.
    let re: Dyadic = ONE;
    let im: Dyadic = ZERO;
    let withError: Dyadic = ONE;
    let withoutError: Dyadic = ONE;
    for (let i = 0; i < period; i += 1) {
      const disk = this.#disk(i);
      const twoRe = multiply(disk.re, { n: 2n, e: 0 });
      const twoIm = multiply(disk.im, { n: 2n, e: 0 });
      const nextRe = subtract(multiply(re, twoRe), multiply(im, twoIm));
      im = add(multiply(re, twoIm), multiply(im, twoRe));
      re = nextRe;
      const magnitude = fromBound(normUpper(twoRe.n, twoIm.n, twoRe.e));
      withoutError = multiply(withoutError, magnitude);
      withError = multiply(withError, add(magnitude, multiply(disk.radius, { n: 2n, e: 0 })));
    }
    const error = subtract(withError, withoutError);
    const upper = PERTURBATION_POLICY.attractUpper;
    return certifyBelow(re, im, error, upper, upper, true);
  }

  /** V0 `reference` decision for proposed period p (1 <= p <= maxPeriod). */
  public decide(p: number): CertifiedVerdict {
    const { accept, exclude } = PERTURBATION_POLICY;
    // residual_p > exclude  <=>  not (residual_p <= exclude).
    const withinExclude = this.#residualBelow(p, exclude, false);
    if (withinExclude === null) return { verdict: 'uncertified', at: 'closure' };
    if (!withinExclude) return { verdict: 'no-closure' };
    const withinAccept = this.#residualBelow(p, accept, false);
    if (withinAccept === null) return { verdict: 'uncertified', at: 'closure' };
    if (!withinAccept) return { verdict: 'closure-ambiguous' };

    let period = p;
    for (const d of properDivisors(p)) {
      const close = this.#residualBelow(d, exclude, true);
      if (close === null) return { verdict: 'uncertified', at: 'divisor' };
      if (!close) continue;
      const accepted = this.#residualBelow(d, accept, false);
      if (accepted === null) return { verdict: 'uncertified', at: 'divisor' };
      if (!accepted) return { verdict: 'divisor-ambiguous' };
      period = d;
      break;
    }
    const attracting = this.#attracting(period);
    if (attracting === null) return { verdict: 'uncertified', at: 'multiplier' };
    return attracting ? { verdict: 'accepted', period } : { verdict: 'not-attracting' };
  }

  /**
   * Candidate source (proposal only, never acceptance): the smallest p whose
   * binary64 closure |a_{m+p} - a_m|^2 < (tauCandidate * scale)^2, or null.
   */
  public propose(): number | null {
    const start = this.#disk(0);
    const startRe = approximate(start.re);
    const startIm = approximate(start.im);
    const scale = Math.max(1, Math.abs(startRe), Math.abs(startIm));
    const limit = PERTURBATION_POLICY.candidate * PERTURBATION_POLICY.candidate * scale * scale;
    for (let p = 1; p <= this.maxPeriod; p += 1) {
      const end = this.#disk(p);
      const re = approximate(subtract(end.re, start.re));
      const im = approximate(subtract(end.im, start.im));
      if (re * re + im * im < limit) return p;
    }
    return null;
  }
}

export interface InteriorTileSpec extends TileSpec {
  /** Largest proposed period; the cycle start is z_m with m = maxIterations - maxPeriod. */
  readonly maxPeriod: number;
}

export type InteriorPixel =
  | { readonly status: 'escaped'; readonly iteration: number }
  | {
      readonly status: 'attracting';
      readonly period: number;
      /** Certified V0 codes for proposed periods 1..maxPeriod (tests). */
      readonly codes: readonly string[];
    }
  | {
      readonly status: 'unresolved';
      readonly reason: string;
      readonly codes: readonly string[] | null;
    };

const MAX_PERIOD = 512;

/** Packet 1 audit to N, then the certified V0 decision on the final window. */
export function classifyInteriorPixel(
  audit: PixelAudit,
  states: readonly PixelState[],
): InteriorPixel {
  if (audit.status === 'escaped') return { status: 'escaped', iteration: audit.iteration };
  if (audit.status === 'unresolved')
    return { status: 'unresolved', reason: audit.reason, codes: null };
  const window = new CycleWindow(states);
  const codes = Array.from({ length: window.maxPeriod }, (_, index) =>
    verdictCode(window.decide(index + 1)),
  );
  const proposal = window.propose();
  if (proposal === null) return { status: 'unresolved', reason: 'no-candidate', codes };
  const verdict = window.decide(proposal);
  if (verdict.verdict === 'accepted')
    return { status: 'attracting', period: verdict.period, codes };
  return { status: 'unresolved', reason: verdictCode(verdict), codes };
}

export type InteriorTile =
  | { readonly status: 'audited'; readonly pixels: readonly InteriorPixel[] }
  | { readonly status: 'refused'; readonly reason: 'unsupported-tile' | 'reference-failed' };

export function classifyPerturbationInteriorTile(spec: InteriorTileSpec): InteriorTile {
  const { maxPeriod, maxIterations } = spec;
  const periodSupported =
    Number.isInteger(maxPeriod) &&
    maxPeriod >= 1 &&
    maxPeriod <= MAX_PERIOD &&
    maxPeriod < maxIterations;
  if (!isSupportedTile(spec) || !periodSupported) {
    return { status: 'refused', reason: 'unsupported-tile' };
  }
  const reference = generateReferenceOrbit(spec.reference, maxIterations);
  if (reference === null) return { status: 'refused', reason: 'reference-failed' };
  const pixels: InteriorPixel[] = [];
  for (let y = 0; y < spec.height; y += 1) {
    for (let x = 0; x < spec.width; x += 1) {
      const offset: Complex = pixelOffset(spec, x, y);
      const trace = { from: maxIterations - maxPeriod, states: [] as PixelState[] };
      const audit = auditPixel(reference, offset, maxIterations, undefined, trace);
      pixels.push(classifyInteriorPixel(audit, trace.states));
    }
  }
  return { status: 'audited', pixels };
}
