import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

import * as complex from '../../../../src/domain/complex';
import type { Complex } from '../../../../src/domain/types';
import * as verifier from '../../../../src/domain/verifier';
import { auditPeriodTwoVerifier } from './period-two-verifier';

interface Rational {
  readonly numerator: bigint;
  readonly denominator: bigint;
}

// Independent base-two-text decoder, followed by general rational arithmetic.
// Neither the pilot's DataView decoder nor its fixed-scale polynomial is used.
function rational(value: number): Rational {
  const [whole = '0', fractional = ''] = Math.abs(value).toString(2).split('.');
  return {
    numerator: BigInt(`0b${whole}${fractional}`) * (value < 0 ? -1n : 1n),
    denominator: 1n << BigInt(fractional.length),
  };
}

const add = (a: Rational, b: Rational): Rational => ({
  numerator: a.numerator * b.denominator + b.numerator * a.denominator,
  denominator: a.denominator * b.denominator,
});
const negate = (a: Rational): Rational => ({ ...a, numerator: -a.numerator });
const multiply = (a: Rational, b: Rational): Rational => ({
  numerator: a.numerator * b.numerator,
  denominator: a.denominator * b.denominator,
});
const square = (a: Rational): Rational => multiply(a, a);
const magnitudeSquared = (re: Rational, im: Rational): Rational => add(square(re), square(im));
const absolute = (a: Rational): Rational => ({
  ...a,
  numerator: a.numerator < 0n ? -a.numerator : a.numerator,
});

function expectEqual(a: Rational, b: Rational): void {
  expect(a.numerator * b.denominator).toBe(b.numerator * a.denominator);
}

function oracleFrames(c: Complex): readonly Rational[] {
  const cr = rational(c.re);
  const ci = rational(c.im);
  let re = rational(0);
  let im = rational(0);
  const frames: Rational[] = [];
  for (let n = 0; n < 2; n++) {
    const nextRe = add(add(square(re), negate(square(im))), cr);
    im = add(multiply(rational(2), multiply(re, im)), ci);
    re = nextRe;
    frames.push(magnitudeSquared(re, im));
  }
  return frames;
}

function adjacent(value: number, direction: -1 | 1): number {
  const bits = new DataView(new ArrayBuffer(8));
  bits.setFloat64(0, value, false);
  const word = bits.getBigUint64(0, false);
  bits.setBigUint64(0, word + BigInt(value > 0 ? direction : -direction), false);
  return bits.getFloat64(0, false);
}

const RADIUS = 2 ** -32;
const parameters: Complex[] = [];
for (let re = -8; re <= 8; re++) {
  for (let im = -8; im <= 8; im++) {
    parameters.push({ re: -1 + (re * RADIUS) / 8, im: (im * RADIUS) / 8 });
  }
}
parameters.push(
  { re: -1 + RADIUS, im: Number.MIN_VALUE },
  { re: -1 - RADIUS, im: -Number.MIN_VALUE },
  { re: adjacent(-1 + RADIUS, -1), im: adjacent(RADIUS, -1) },
  { re: adjacent(-1 - RADIUS, 1), im: adjacent(-RADIUS, 1) },
  { re: -1 + 0.1234567 * RADIUS, im: -0.9876543 * RADIUS },
  { re: -1, im: Number.MIN_VALUE },
  { re: -1, im: -(2 ** -1022) },
  { re: -1, im: -0 },
);

interface SourceTrace {
  readonly fields: readonly number[] | null;
  readonly closureSquared: number;
  readonly divisorSquared: number;
  readonly closureSteps: readonly { value: Complex; multiplier: Complex }[];
  readonly divisorSteps: readonly { value: Complex; multiplier: Complex }[];
}

function insertAfter(source: string, pattern: string | RegExp, addition: string): string {
  let count = 0;
  const instrumented = source.replace(pattern, (match) => {
    count++;
    return `${match}\n${addition}`;
  });
  expect(count).toBe(1);
  return instrumented;
}

// Execute the actual source at the pilot's seed, without the renderer's
// analytic fast path or candidate-proposal loop. Observe intermediate frames
// as well as acceptance so wide margins cannot hide arithmetic drift.
function sourceVerifier(kind: 'inline' | 'reference'): (c: Complex) => SourceTrace {
  const file = kind === 'inline' ? 'orbit.ts' : 'verifier.ts';
  const source = readFileSync(new URL(`../../../../src/domain/${file}`, import.meta.url), 'utf8');
  let block: string;
  if (kind === 'reference') {
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.ES2023, true);
    const declarations = ast.statements
      .filter(ts.isVariableStatement)
      .flatMap((s) => s.declarationList.declarations);
    const initializer = declarations.find(
      (d) => d.name.getText(ast) === 'verifyCycleInto',
    )?.initializer;
    if (
      initializer === undefined ||
      !ts.isArrowFunction(initializer) ||
      !ts.isBlock(initializer.body)
    ) {
      throw new Error('Missing production verifier body');
    }
    block = initializer.body.getText(ast).slice(1, -1);
  } else {
    const startMarker = 'const scale = Math.max(1, Math.abs(zRe), Math.abs(zIm));';
    const endMarker = '\n      return;';
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    expect(source.indexOf(startMarker, start + 1)).toBe(-1);
    block = source.slice(start, end + endMarker.length);
  }
  const state = kind === 'inline' ? 'cycle' : 'z';
  const derivative = 'derivative';
  const candidateAssignment = kind === 'inline' ? 'cycleRe = nextCycleRe;' : 'zRe = nextRe;';
  block = insertAfter(
    block,
    candidateAssignment,
    `trace.closureSteps.push({ value: { re: ${state}Re, im: ${state}Im }, multiplier: { re: ${derivative}Re, im: ${derivative}Im } });`,
  );
  block = insertAfter(
    block,
    'walkRe = nextWalkRe;',
    'trace.divisorSteps.push({ value: { re: walkRe, im: walkIm }, multiplier: { re: walkDerivativeRe, im: walkDerivativeIm } });',
  );
  const squareName = kind === 'inline' ? 'closureSquared' : 'residualSquared';
  block = insertAfter(
    block,
    new RegExp(`const ${squareName} =[^;]+;`),
    `trace.closureSquared = ${squareName};`,
  );
  block = insertAfter(
    block,
    /const divisorResidualSquared =[^;]+;/,
    'trace.divisorSquared = divisorResidualSquared;',
  );
  const program = `
    return function(c) {
      const cRe = c.re, cIm = c.im, zRe = 0, zIm = 0;
      const period = 2, iteration = 17;
      const proposedPeriod = 2, cycleStartRe = 0, cycleStartIm = 0, iterations = 17, evidence = 23;
      const ORBIT_EVIDENCE_CODE = { convergedCycle: 23 };
      const trace = { closureSquared: NaN, divisorSquared: NaN, closureSteps: [], divisorSteps: [] };
      const out = { value: null };
      const finishAttractingCycle = (_out, ...fields) => { out.value = fields; };
      function run() { for (let once = 0; once < 1; once++) { ${block} } }
      const code = run();
      const fields = ${kind === 'inline' ? 'out.value' : 'code === VERIFIER_VERDICT.accepted ? [out.period, out.multiplierRe, out.multiplierIm, out.iterations, out.evidence, out.multiplierMagnitude] : null'};
      return { ...trace, fields };
    };
  `;
  const js = ts.transpileModule(program, { compilerOptions: { target: ts.ScriptTarget.ES2023 } });
  // Only committed repository source is executed; this tests the actual inline
  // block without adding a production seam or duplicating its implementation.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call
  return new Function(
    'TAU_CLOSURE_SCALED',
    'VERIFIER_THRESHOLDS',
    'VERIFIER_VERDICT',
    js.outputText,
  )(verifier.TAU_CLOSURE_SCALED, verifier.VERIFIER_THRESHOLDS, verifier.VERIFIER_VERDICT) as (
    c: Complex,
  ) => SourceTrace;
}

describe('bounded period-two verifier correctness pilot', () => {
  it('audits the closed tile and matches an independent rational critical-orbit oracle', () => {
    for (const c of parameters) {
      const result = auditPeriodTwoVerifier(c);
      expect(result.status, JSON.stringify(c)).toBe('audited');
      if (result.status !== 'audited') throw new Error('Unexpected refusal');
      expect(result.verdict).toEqual(verifier.verifyCycle(c.re, c.im, 0, 0, 2));
      const oracle = oracleFrames(c);
      for (const [index, frame] of [
        result.certificate.divisor,
        result.certificate.closure,
      ].entries()) {
        const exact = oracle[index];
        if (exact === undefined) throw new Error('Missing oracle frame');
        expectEqual(frame.exactResidualSquared, exact);
        expectEqual(
          frame.residualSquaredError,
          absolute(add(rational(frame.computedResidualSquared), negate(exact))),
        );
        const bound = index === 0 ? 1000000000000n : 1000000000000000000n;
        expect(
          frame.residualSquaredError.numerator * bound <= frame.residualSquaredError.denominator,
        ).toBe(true);
        expect(frame.stepDefects).toHaveLength(index === 0 ? 1 : 2);
        for (const defect of frame.stepDefects) {
          expect(defect.numerator * (1n << 50n) <= defect.denominator).toBe(true);
        }
      }
      expectEqual(result.certificate.acceptSquared, rational(verifier.TAU_CLOSURE_SCALED ** 2));
      expectEqual(
        result.certificate.excludeSquared,
        rational(verifier.VERIFIER_THRESHOLDS.tauExclude ** 2),
      );
      expectEqual(
        result.certificate.attractUpper,
        rational(1 - verifier.VERIFIER_THRESHOLDS.attractMargin),
      );
    }
  });

  it('compares actual reference/inline intermediate frames and accepted output/provenance', () => {
    const inline = sourceVerifier('inline');
    const reference = sourceVerifier('reference');
    for (const c of parameters) {
      const out: verifier.VerifierCycleTarget = {
        status: 0,
        iterations: 0,
        evidence: 0,
        period: 0,
        multiplierRe: 0,
        multiplierIm: 0,
        multiplierMagnitude: 0,
        multiplierAngle: 0,
        stabilityExponent: 0,
      };
      expect(verifier.verifyCycleInto(c.re, c.im, 0, 0, 2, 17, 23, out)).toBe(
        verifier.VERIFIER_VERDICT.accepted,
      );
      expect(out).toMatchObject({ status: 2, period: 2, iterations: 17, evidence: 23 });
      const fields = [
        out.period,
        out.multiplierRe,
        out.multiplierIm,
        out.iterations,
        out.evidence,
        out.multiplierMagnitude,
      ];
      const audited = auditPeriodTwoVerifier(c);
      if (audited.status !== 'audited') throw new Error('Unexpected refusal');
      for (const observed of [inline(c), reference(c)]) {
        expect(observed.fields).toEqual(fields);
        expect(observed.closureSquared).toBe(audited.certificate.closure.computedResidualSquared);
        expect(observed.divisorSquared).toBe(audited.certificate.divisor.computedResidualSquared);
        expect(observed.closureSteps).toEqual(audited.certificate.closure.steps);
        expect(observed.divisorSteps).toEqual(audited.certificate.divisor.steps);
      }
      expect(out.multiplierAngle).toBe(0);
      expect(out.stabilityExponent).toBe(Infinity);
    }
  });

  it('refuses an acceptance policy whose decoded margin is not certified', () => {
    vi.spyOn(verifier, 'TAU_CLOSURE_SCALED', 'get').mockReturnValue(1e-12);
    expect(auditPeriodTwoVerifier({ re: -1, im: 0 })).toEqual({
      status: 'refused',
      reason: 'policy-margin',
    });
  });

  it('refuses nonfinite parameters and the immediately adjacent values outside each tile edge', () => {
    for (const value of [NaN, Infinity, -Infinity]) {
      for (const c of [
        { re: value, im: 0 },
        { re: -1, im: value },
      ]) {
        expect(auditPeriodTwoVerifier(c)).toEqual({
          status: 'refused',
          reason: 'nonfinite-parameter',
        });
      }
    }
    for (const c of [
      { re: adjacent(-1 + RADIUS, 1), im: 0 },
      { re: adjacent(-1 - RADIUS, -1), im: 0 },
      { re: -1, im: adjacent(RADIUS, 1) },
      { re: -1, im: adjacent(-RADIUS, -1) },
      { re: 0, im: 0 },
      { re: Number.MAX_VALUE, im: 0 },
    ]) {
      expect(auditPeriodTwoVerifier(c)).toEqual({ status: 'refused', reason: 'outside-tile' });
    }
  });

  it('retains exact nonzero residuals even when machine squaring underflows to zero', () => {
    const result = auditPeriodTwoVerifier({ re: -1, im: Number.MIN_VALUE });
    if (result.status !== 'audited') throw new Error('Unexpected refusal');
    expect(result.certificate.closure.computedResidualSquared).toBe(0);
    expect(result.certificate.closure.exactResidualSquared.numerator).toBeGreaterThan(0n);
    expect(result.certificate.closure.residualSquaredError.numerator).toBeGreaterThan(0n);
    expect(result.verdict).toMatchObject({
      period: 2,
      multiplierMagnitude: 0,
      multiplierAngle: 0,
      kappa: Infinity,
    });
  });

  it('captures each parameter component once before all checks and verifier calls', () => {
    let reReads = 0;
    let imReads = 0;
    const c = {
      get re(): number {
        return ++reReads === 1 ? -1 : 0;
      },
      get im(): number {
        return ++imReads === 1 ? -0 : 1;
      },
    };
    const result = auditPeriodTwoVerifier(c);
    expect(result.status).toBe('audited');
    expect(reReads).toBe(1);
    expect(imReads).toBe(1);
    if (result.status === 'audited') expect(Object.is(result.parameter.im, -0)).toBe(true);
  });

  it('refuses corrupted step, multiplier and hypot calculations', () => {
    const squareAdd = vi.spyOn(complex, 'complexSquareAdd');
    squareAdd.mockReturnValue({ re: Infinity, im: 0 });
    expect(auditPeriodTwoVerifier({ re: -1, im: 0 })).toEqual({
      status: 'refused',
      reason: 'arithmetic-budget',
    });
    squareAdd.mockReturnValue({ re: -1 + 2 ** -40, im: 0 });
    expect(auditPeriodTwoVerifier({ re: -1, im: 0 })).toEqual({
      status: 'refused',
      reason: 'arithmetic-budget',
    });
    squareAdd.mockRestore();
    const multiplySpy = vi
      .spyOn(complex, 'complexMultiply')
      .mockReturnValue({ re: Number.MIN_VALUE, im: 0 });
    expect(auditPeriodTwoVerifier({ re: -1, im: 0 })).toEqual({
      status: 'refused',
      reason: 'arithmetic-budget',
    });
    multiplySpy.mockRestore();
    vi.spyOn(Math, 'hypot').mockReturnValue(NaN);
    expect(auditPeriodTwoVerifier({ re: -1, im: 0 })).toEqual({
      status: 'refused',
      reason: 'arithmetic-budget',
    });
  });

  it('refuses a production verdict or payload that disagrees with the certified frames', () => {
    const spy = vi.spyOn(verifier, 'verifyCycle');
    spy.mockReturnValue({
      verdict: 'unresolved',
      reason: 'closure-ambiguous',
      verifierRevision: verifier.VERIFIER_REVISION,
    });
    expect(auditPeriodTwoVerifier({ re: -1, im: 0 })).toEqual({
      status: 'refused',
      reason: 'verifier-mismatch',
    });
    spy.mockReturnValue({
      verdict: 'accepted',
      period: 2,
      multiplierRe: 0,
      multiplierIm: 0,
      multiplierMagnitude: 0,
      multiplierAngle: 0,
      kappa: 0,
      verifierRevision: verifier.VERIFIER_REVISION,
    });
    expect(auditPeriodTwoVerifier({ re: -1, im: 0 })).toEqual({
      status: 'refused',
      reason: 'verifier-mismatch',
    });
  });
});
