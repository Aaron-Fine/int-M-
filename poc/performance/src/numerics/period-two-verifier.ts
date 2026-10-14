import { complexMultiply, complexSquareAdd } from '../../../../src/domain/complex';
import type { Complex } from '../../../../src/domain/types';
import {
  TAU_CLOSURE_SCALED,
  VERIFIER_THRESHOLDS,
  verifyCycle,
} from '../../../../src/domain/verifier';
import type { VerifierVerdict } from '../../../../src/domain/verifier';
import { binary64Units } from './minus-one-jet';

/** Exact rational witnesses; denominators are positive powers of two. */
interface RationalWitness {
  readonly numerator: bigint;
  readonly denominator: bigint;
}

interface FrameWitness {
  readonly exactResidualSquared: RationalWitness;
  readonly computedResidualSquared: number;
  readonly residualSquaredError: RationalWitness;
  readonly stepDefects: readonly RationalWitness[];
  readonly steps: readonly { readonly value: Complex; readonly multiplier: Complex }[];
}

export type PeriodTwoVerifierAudit =
  | {
      readonly status: 'audited';
      readonly parameter: Complex;
      readonly verdict: Extract<VerifierVerdict, { verdict: 'accepted' }>;
      readonly certificate: {
        readonly divisor: FrameWitness;
        readonly closure: FrameWitness;
        readonly acceptSquared: RationalWitness;
        readonly excludeSquared: RationalWitness;
        readonly attractUpper: RationalWitness;
      };
    }
  | {
      readonly status: 'refused';
      readonly reason:
        | 'nonfinite-parameter'
        | 'outside-tile'
        | 'policy-margin'
        | 'arithmetic-budget'
        | 'verifier-mismatch';
    };

const UNIT = 1n << 1074n;
const UNIT_SQUARED = UNIT * UNIT;
const UNIT_FOURTH = UNIT_SQUARED * UNIT_SQUARED;
const TILE_RADIUS = UNIT >> 32n;
const STEP_LIMIT = UNIT_SQUARED >> 50n;
const abs = (x: bigint): bigint => (x < 0n ? -x : x);

interface IntegerComplex {
  readonly re: bigint;
  readonly im: bigint;
}

function decode(value: Complex): IntegerComplex | null {
  const re = binary64Units(value.re);
  const im = binary64Units(value.im);
  return re === null || im === null ? null : { re, im };
}

interface Walk {
  readonly multiplier: Complex;
  readonly residualSquared: number;
  readonly stepDefects: readonly RationalWitness[];
  readonly steps: FrameWitness['steps'];
}

// Same separate-product order as verifier.ts and the orbit.ts inline block.
// Three steps total: the two-step candidate and its one-step proper divisor.
function walk(parameter: Complex, c: IntegerComplex, period: 1 | 2): Walk | null {
  let z: Complex = { re: 0, im: 0 };
  let units: IntegerComplex = { re: 0n, im: 0n };
  let multiplier: Complex = { re: 1, im: 0 };
  const stepDefects: RationalWitness[] = [];
  const steps: { value: Complex; multiplier: Complex }[] = [];
  for (let index = 0; index < period; index++) {
    multiplier = complexMultiply(multiplier, { re: 2 * z.re, im: 2 * z.im });
    const derivative = decode(multiplier);
    // For the critical seed this product must be exactly zero at every step.
    if (derivative?.re !== 0n || derivative.im !== 0n) return null;
    const next = complexSquareAdd(z, parameter);
    const nextUnits = decode(next);
    if (nextUnits === null) return null;
    const re = nextUnits.re * UNIT - (units.re * units.re - units.im * units.im + c.re * UNIT);
    const im = nextUnits.im * UNIT - (2n * units.re * units.im + c.im * UNIT);
    const defect = abs(re) + abs(im);
    if (defect > STEP_LIMIT) return null;
    stepDefects.push({ numerator: defect, denominator: UNIT_SQUARED });
    steps.push({ value: next, multiplier });
    z = next;
    units = nextUnits;
  }
  const residualRe = z.re - 0;
  const residualIm = z.im - 0;
  const residualSquared = residualRe * residualRe + residualIm * residualIm;
  return { multiplier, residualSquared, stepDefects, steps };
}

/**
 * Research-only certificate for the decoded parameter rectangle
 * |Re(c)+1|, |Im(c)| <= 2^-32, critical seed zero, proposed period two.
 *
 * BigInt checks supply PeriodTwoVerifierPilot.lean's finite-frame premises,
 * then the actual production verifier must agree. JS decoding/checking and
 * source correspondence are trusted/tested. This proves a tolerance verdict,
 * not exact critical periodicity or the multiplier of the nearby true cycle.
 */
// eslint-disable-next-line complexity -- explicit bounded certificate guards
export function auditPeriodTwoVerifier(parameter: Complex): PeriodTwoVerifierAudit {
  const captured = { re: parameter.re, im: parameter.im };
  const c = decode(captured);
  if (c === null) return { status: 'refused', reason: 'nonfinite-parameter' };
  if (abs(c.re + UNIT) > TILE_RADIUS || abs(c.im) > TILE_RADIUS) {
    return { status: 'refused', reason: 'outside-tile' };
  }

  // These are the actual policy expressions, at the critical seed's scale=1.
  const accept = TAU_CLOSURE_SCALED * TAU_CLOSURE_SCALED * 1 * 1;
  const exclude = VERIFIER_THRESHOLDS.tauExclude * VERIFIER_THRESHOLDS.tauExclude * 1 * 1;
  const attract = 1 - VERIFIER_THRESHOLDS.attractMargin;
  const a = binary64Units(accept);
  const e = binary64Units(exclude);
  const m = binary64Units(attract);
  if (
    a === null ||
    e === null ||
    m === null ||
    a * 100000000000000000n < UNIT ||
    e * 100000000000n > UNIT ||
    a >= e ||
    m <= 0n
  ) {
    return { status: 'refused', reason: 'policy-margin' };
  }

  const closure = walk(captured, c, 2);
  const divisor = walk(captured, c, 1);
  if (closure === null || divisor === null)
    return { status: 'refused', reason: 'arithmetic-budget' };
  const closeUnits = binary64Units(closure.residualSquared);
  const divUnits = binary64Units(divisor.residualSquared);
  if (closeUnits === null || divUnits === null)
    return { status: 'refused', reason: 'arithmetic-budget' };

  // Direct exact critical iteration, including an imaginary part lost to
  // underflow by machine operations. No rounded c+1 or corner sampling.
  const exactDiv = c.re * c.re + c.im * c.im;
  const exactRe = c.re * c.re - c.im * c.im + c.re * UNIT;
  const exactIm = 2n * c.re * c.im + c.im * UNIT;
  const exactClose = exactRe * exactRe + exactIm * exactIm;
  const divError = abs(divUnits * UNIT - exactDiv);
  const closeError = abs(closeUnits * UNIT * UNIT_SQUARED - exactClose);
  if (
    exactDiv * 2n < UNIT_SQUARED ||
    exactClose * 1000000000000000000n > UNIT_FOURTH ||
    divError * 1000000000000n > UNIT_SQUARED ||
    closeError * 1000000000000000000n > UNIT_FOURTH ||
    closeUnits < 0n ||
    closeUnits > a ||
    divUnits < e ||
    Math.hypot(closure.multiplier.re, closure.multiplier.im) !== 0
  ) {
    return { status: 'refused', reason: 'arithmetic-budget' };
  }

  const verdict = verifyCycle(captured.re, captured.im, 0, 0, 2);
  if (
    verdict.verdict !== 'accepted' ||
    verdict.period !== 2 ||
    verdict.multiplierRe !== 0 ||
    verdict.multiplierIm !== 0 ||
    verdict.multiplierMagnitude !== 0 ||
    verdict.multiplierAngle !== 0 ||
    verdict.kappa !== Number.POSITIVE_INFINITY
  ) {
    return { status: 'refused', reason: 'verifier-mismatch' };
  }
  return {
    status: 'audited',
    parameter: captured,
    verdict,
    certificate: {
      divisor: {
        exactResidualSquared: { numerator: exactDiv, denominator: UNIT_SQUARED },
        computedResidualSquared: divisor.residualSquared,
        residualSquaredError: { numerator: divError, denominator: UNIT_SQUARED },
        stepDefects: divisor.stepDefects,
        steps: divisor.steps,
      },
      closure: {
        exactResidualSquared: { numerator: exactClose, denominator: UNIT_FOURTH },
        computedResidualSquared: closure.residualSquared,
        residualSquaredError: { numerator: closeError, denominator: UNIT_FOURTH },
        stepDefects: closure.stepDefects,
        steps: closure.steps,
      },
      acceptSquared: { numerator: a, denominator: UNIT },
      excludeSquared: { numerator: e, denominator: UNIT },
      attractUpper: { numerator: m, denominator: UNIT },
    },
  };
}
