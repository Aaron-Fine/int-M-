import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

import * as complex from '../../../../src/domain/complex';
import type { Complex } from '../../../../src/domain/types';
import { binary64Units, evaluateMinusOneJet } from './minus-one-jet';

const actualMultiply = complex.complexMultiply;
const abs = (x: bigint): bigint => (x < 0n ? -x : x);

// Independent oracle decoder: base-two text, not DataView or the kernel helper.
function exactNumber(value: number): { numerator: bigint; scale: bigint } {
  const negative = value < 0;
  const [whole = '0', fractional = ''] = Math.abs(value).toString(2).split('.');
  const numerator = BigInt(`0b${whole}${fractional}`);
  return { numerator: negative ? -numerator : numerator, scale: BigInt(fractional.length) };
}

interface ExactComplex {
  readonly re: bigint;
  readonly im: bigint;
  readonly scale: bigint;
}

function exactComplex(value: Complex): ExactComplex {
  const re = exactNumber(value.re);
  const im = exactNumber(value.im);
  const scale = re.scale > im.scale ? re.scale : im.scale;
  return {
    re: re.numerator << (scale - re.scale),
    im: im.numerator << (scale - im.scale),
    scale,
  };
}

// Direct exact critical iteration, independent of jets, caps and Horner.
function orbitStep(value: ExactComplex, parameter: ExactComplex): ExactComplex {
  const scale = 2n * value.scale > parameter.scale ? 2n * value.scale : parameter.scale;
  return {
    re:
      ((value.re * value.re - value.im * value.im) << (scale - 2n * value.scale)) +
      (parameter.re << (scale - parameter.scale)),
    im:
      ((2n * value.re * value.im) << (scale - 2n * value.scale)) +
      (parameter.im << (scale - parameter.scale)),
    scale,
  };
}

function errorFits(value: Complex, target: ExactComplex): boolean {
  const computed = exactComplex(value);
  const scale = computed.scale > target.scale ? computed.scale : target.scale;
  const re = (computed.re << (scale - computed.scale)) - (target.re << (scale - target.scale));
  const im = (computed.im << (scale - computed.scale)) - (target.im << (scale - target.scale));
  return (re * re + im * im) * 1000000000000n <= 1n << (2n * scale);
}

describe('bounded minus-one numerical kernel', () => {
  it('decodes normal/subnormal exponent boundaries, signs and zeros exactly', () => {
    const view = new DataView(new ArrayBuffer(8));
    for (const exponent of [0n, 1n, 2n, 511n, 1022n, 1023n, 1535n, 2045n, 2046n]) {
      for (const fraction of [0n, 1n, (1n << 51n) + 17n, (1n << 52n) - 1n]) {
        for (const sign of [0n, 1n]) {
          view.setBigUint64(0, (sign << 63n) | (exponent << 52n) | fraction, false);
          const value = view.getFloat64(0, false);
          const oracle = exactNumber(value);
          expect(binary64Units(value)).toBe(oracle.numerator << (1074n - oracle.scale));
        }
      }
    }
    expect(binary64Units(Number.MIN_VALUE)).toBe(1n);
    expect(binary64Units(-Number.MIN_VALUE)).toBe(-1n);
    expect(binary64Units(0)).toBe(0n);
    expect(binary64Units(-0)).toBe(0n);
    for (const value of [NaN, Infinity, -Infinity]) expect(binary64Units(value)).toBeNull();
  });

  it('keeps the TypeScript packet identical to the Lean-checked exact table', () => {
    const ts = readFileSync(new URL('./minus-one-jet.ts', import.meta.url), 'utf8');
    const lean = readFileSync(
      new URL('../../../../proof/IntMProof/MinusOneJetKernel.lean', import.meta.url),
      'utf8',
    );
    const tsLiteral = ts.split('const COEFFICIENTS:')[1]?.split('=')[1]?.split(';')[0];
    const leanLiteral = lean.split('def minusOneJetKernelRows')[1]?.split(':=')[1]?.split('/--')[0];
    const rows = (source: string | undefined): number[][] =>
      [
        ...(source ?? '').matchAll(/\[\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*\]/g),
      ].map((row) => row.slice(1).map(Number));
    expect(rows(tsLiteral)).toHaveLength(17);
    expect(rows(tsLiteral)).toEqual(rows(leanLiteral));
  });

  it('checks the exact closed disk, including a subnormal just outside its boundary', () => {
    const radius = 1 / 256;
    for (const delta of [
      { re: radius, im: 0 },
      { re: -radius, im: 0 },
      { re: 0, im: radius },
      { re: 0, im: -radius },
      { re: radius - 2 ** -61, im: Number.MIN_VALUE },
    ]) {
      expect(evaluateMinusOneJet(delta, 16).status).toBe('audited');
    }
    for (const delta of [
      { re: radius, im: Number.MIN_VALUE },
      { re: radius + 2 ** -60, im: 0 },
      { re: radius, im: radius },
      { re: Number.MAX_VALUE, im: 0 },
    ]) {
      expect(evaluateMinusOneJet(delta, 16)).toEqual({ status: 'refused', reason: 'outside-disk' });
    }
    // A rounded hypot would lose this positive imaginary contribution.
    expect(Math.hypot(radius, Number.MIN_VALUE)).toBe(radius);
  });

  it('refuses unsupported iterations and nonfinite offsets', () => {
    for (const n of [-1, 17, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
      expect(evaluateMinusOneJet({ re: 0, im: 0 }, n)).toEqual({
        status: 'refused',
        reason: 'invalid-iteration',
      });
    }
    for (const value of [NaN, Infinity, -Infinity]) {
      for (const delta of [
        { re: value, im: 0 },
        { re: 0, im: value },
      ]) {
        expect(evaluateMinusOneJet(delta, 16)).toEqual({
          status: 'refused',
          reason: 'nonfinite-offset',
        });
      }
    }
  });

  it('audits all 17 horizons against direct exact-rational orbit iteration', () => {
    const offsets = [
      { re: 0, im: 0 },
      { re: 1 / 256, im: 0 },
      { re: -1 / 256, im: 0 },
      { re: 0, im: 1 / 256 },
      { re: 0, im: -1 / 256 },
      { re: 1 / 512, im: 1 / 512 },
      { re: -3 / 2048, im: 4 / 2048 },
      { re: 7 / 2048, im: -3 / 2048 },
    ];
    for (const offset of offsets) {
      const delta = exactComplex(offset);
      const parameter = { ...delta, re: delta.re - (1n << delta.scale) };
      let target: ExactComplex = { re: 0n, im: 0n, scale: 0n };
      for (let n = 0; n <= 16; n++) {
        const result = evaluateMinusOneJet(offset, n);
        expect(result.status).toBe('audited');
        if (result.status !== 'audited') throw new Error('Unexpected refusal');
        expect(result.errorBound).toEqual({ numerator: 1n, denominator: 1000000n });
        expect(errorFits(result.value, target)).toBe(true);
        if (n < 16) target = orbitStep(target, parameter);
      }
    }
  });

  it('covers non-grid offsets and underflow without using a rounded parameter sum', () => {
    for (const offset of [
      { re: 0.001, im: -0.002 },
      { re: 2 ** -60, im: -(2 ** -61) },
      { re: Number.MIN_VALUE, im: -Number.MIN_VALUE },
    ]) {
      const delta = exactComplex(offset);
      const parameter = { ...delta, re: delta.re - (1n << delta.scale) };
      let target: ExactComplex = { re: 0n, im: 0n, scale: 0n };
      for (let n = 0; n <= 4; n++) {
        const result = evaluateMinusOneJet(offset, n);
        if (result.status !== 'audited') throw new Error('Unexpected refusal');
        expect(errorFits(result.value, target)).toBe(true);
        target = orbitStep(target, parameter);
      }
      expect(evaluateMinusOneJet(offset, 16).status).toBe('audited');
    }
    expect(-1 + 2 ** -60).toBe(-1);
  });

  it('uses exactly three offset-first complex products and audits corrupted results', () => {
    const spy = vi.spyOn(complex, 'complexMultiply');
    const offset = { re: 1 / 512, im: -1 / 1024 };
    expect(evaluateMinusOneJet(offset, 16).status).toBe('audited');
    expect(spy).toHaveBeenCalledTimes(3);
    for (const [left] of spy.mock.calls) expect(left).toEqual(offset);
    spy.mockImplementation((left, right) => {
      const product = actualMultiply(left, right);
      return { re: product.re + 2 ** -39, im: product.im };
    });
    expect(evaluateMinusOneJet(offset, 16)).toEqual({
      status: 'refused',
      reason: 'arithmetic-budget',
    });
    // Inclusive bound: exactly 2^-40 fits; two such components do not.
    spy.mockReturnValue({ re: 2 ** -40, im: 0 });
    expect(evaluateMinusOneJet({ re: 0, im: 0 }, 16).status).toBe('audited');
    spy.mockReturnValue({ re: 2 ** -40, im: 2 ** -40 });
    expect(evaluateMinusOneJet({ re: 0, im: 0 }, 16)).toEqual({
      status: 'refused',
      reason: 'arithmetic-budget',
    });
    spy.mockReturnValue({ re: 0, im: Infinity });
    expect(evaluateMinusOneJet(offset, 16)).toEqual({
      status: 'refused',
      reason: 'arithmetic-budget',
    });
  });

  it('captures the input once before auditing and uses mathematical zero for either sign', () => {
    let reads = 0;
    const offset = {
      get re(): number {
        reads++;
        return reads === 1 ? 1 / 512 : 1;
      },
      im: 0,
    };
    expect(evaluateMinusOneJet(offset, 16).status).toBe('audited');
    expect(reads).toBe(1);
    for (let n = 0; n <= 16; n++) {
      const result = evaluateMinusOneJet({ re: -0, im: -0 }, n);
      if (result.status !== 'audited') throw new Error('Unexpected refusal');
      expect(abs(binary64Units(result.value.re) ?? 0n)).toBe(n % 2 === 0 ? 0n : 1n << 1074n);
      expect(binary64Units(result.value.im)).toBe(0n);
    }
  });
});
