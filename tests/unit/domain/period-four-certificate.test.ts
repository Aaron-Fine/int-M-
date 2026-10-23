import { describe, expect, it } from 'vitest';

import {
  classifyPeriodFourInto,
  createOrbitSample,
  PERIOD_FOUR_BOXES,
  VERIFIER_THRESHOLDS,
  type PeriodFourCertificate,
} from '../../../src/domain';

/**
 * Exact audit of the period-4 root-error certificate (ADR 0013,
 * docs/PERFORMANCE-MATHEMATICS.md section 12). Every binary64 number is a
 * dyadic rational, so the cubic's exact coefficients at the binary64 c, its
 * exact value at the binary64 candidate, and every inequality of the
 * certificate can be checked in exact BigInt arithmetic. For each sampled c
 * the code certifies, this test checks, with no rounding at all (for the
 * others it checks only that the code refuses):
 *
 * 1. F >= |M(mu~)|, D <= |M'(mu~)| and K >= |3 mu~ + a2| for the exact cubic;
 * 2. the Rouché inequality F + K r^2 + r^3 < D r holds for r = 2h (1 + 2^-40), so exactly one root
 *    of the exact cubic lies within r of mu~;
 * 3. whenever the code accepts, 16 |mu~| + 16 r < 1 - attractMargin, so that
 *    root's multiplier is attracting beyond the margin.
 *
 * It does not depend on the floating-point error analysis of section 12.5:
 * it checks that analysis's conclusions directly, point by point.
 */

interface Dyadic {
  /** value = n / 2^s */
  readonly n: bigint;
  readonly s: number;
}

const view = new DataView(new ArrayBuffer(8));

const exact = (x: number): Dyadic => {
  if (!Number.isFinite(x)) throw new RangeError(`not finite: ${x}`);
  if (x === 0) return { n: 0n, s: 0 };
  view.setFloat64(0, x);
  const bits = view.getBigUint64(0);
  const negative = bits >> 63n === 1n;
  const exponent = Number((bits >> 52n) & 0x7ffn);
  const fraction = bits & 0xfffffffffffffn;
  const mantissa = exponent === 0 ? fraction : fraction | (1n << 52n);
  const power = (exponent === 0 ? 1 : exponent) - 1075;
  const n = negative ? -mantissa : mantissa;
  return power >= 0 ? { n: n << BigInt(power), s: 0 } : { n, s: -power };
};

const align = (a: Dyadic, b: Dyadic): [bigint, bigint, number] =>
  a.s >= b.s ? [a.n, b.n << BigInt(a.s - b.s), a.s] : [a.n << BigInt(b.s - a.s), b.n, b.s];
const add = (a: Dyadic, b: Dyadic): Dyadic => {
  const [x, y, s] = align(a, b);
  return { n: x + y, s };
};
const sub = (a: Dyadic, b: Dyadic): Dyadic => add(a, { n: -b.n, s: b.s });
const mul = (a: Dyadic, b: Dyadic): Dyadic => ({ n: a.n * b.n, s: a.s + b.s });
const int = (k: number): Dyadic => ({ n: BigInt(k), s: 0 });
/** Sign of a - b. */
const compare = (a: Dyadic, b: Dyadic): number => {
  const [x, y] = align(a, b);
  return x === y ? 0 : x < y ? -1 : 1;
};

interface Cx {
  readonly re: Dyadic;
  readonly im: Dyadic;
}
const cadd = (a: Cx, b: Cx): Cx => ({ re: add(a.re, b.re), im: add(a.im, b.im) });
const csub = (a: Cx, b: Cx): Cx => ({ re: sub(a.re, b.re), im: sub(a.im, b.im) });
const cmul = (a: Cx, b: Cx): Cx => ({
  re: sub(mul(a.re, b.re), mul(a.im, b.im)),
  im: add(mul(a.re, b.im), mul(a.im, b.re)),
});
const cscale = (k: number, a: Cx): Cx => ({ re: mul(int(k), a.re), im: mul(int(k), a.im) });
const creal = (k: number): Cx => ({ re: int(k), im: int(0) });
const norm2 = (a: Cx): Dyadic => add(mul(a.re, a.re), mul(a.im, a.im));

const certificate = (): PeriodFourCertificate => ({
  productRe: Number.NaN,
  productIm: Number.NaN,
  residualBound: Number.NaN,
  derivativeBound: Number.NaN,
  curvatureBound: Number.NaN,
  radiusRatio: Number.NaN,
  allowance: Number.NaN,
  certified: false,
});

const RADIUS_INFLATION: Dyadic = add(int(1), { n: 1n, s: 40 });
const THRESHOLD = exact(1 - VERIFIER_THRESHOLDS.attractMargin);

interface Tally {
  points: number;
  certified: number;
  accepted: number;
}

/** Audits one parameter and tallies it. */
const audit = (cRe: number, cIm: number, tally: Tally): void => {
  const cert = certificate();
  const accepted = classifyPeriodFourInto(cRe, cIm, createOrbitSample(), cert);
  tally.points += 1;
  if (!cert.certified) {
    expect(accepted).toBe(false);
    return;
  }
  tally.certified += 1;
  const c: Cx = { re: exact(cRe), im: exact(cIm) };
  const mu: Cx = { re: exact(cert.productRe), im: exact(cert.productIm) };
  const c2 = cmul(c, c);
  const a2 = csub(c2, creal(3));
  const a1 = csub(creal(3), cmul(c2, csub(cadd(c2, c), creal(1))));
  const g4 = cadd(
    cmul(c2, cadd(cmul(c2, cadd(cadd(c2, cscale(3, c)), creal(3))), cadd(cscale(3, c), creal(2)))),
    creal(1),
  );
  const a0 = csub(creal(0), g4);
  const residual = cadd(cmul(cadd(cmul(cadd(mu, a2), mu), a1), mu), a0);
  const slope = cadd(cmul(cadd(cscale(3, mu), cscale(2, a2)), mu), a1);
  const curvature = cadd(cscale(3, mu), a2);
  const f = exact(cert.residualBound);
  const d = exact(cert.derivativeBound);
  const k = exact(cert.curvatureBound);
  // 1. The bounds dominate the exact quantities (compare squares; F, D, K > 0).
  expect(compare(norm2(residual), mul(f, f))).toBeLessThanOrEqual(0);
  expect(compare(d, int(0))).toBe(1);
  expect(compare(norm2(slope), mul(d, d))).toBeGreaterThanOrEqual(0);
  // Stricter than 12.5 item 7 needs (K̂(1 + 8u) >= |M''|/2), on purpose.
  expect(compare(norm2(curvature), mul(k, k))).toBeLessThanOrEqual(0);
  // 2. Rouché on |w| = r with r = 2h (1 + 2^-40).
  const r = mul(mul(int(2), exact(cert.radiusRatio)), RADIUS_INFLATION);
  const lhs = add(add(f, mul(k, mul(r, r))), mul(r, mul(r, r)));
  expect(compare(lhs, mul(d, r))).toBe(-1);
  if (!accepted) return;
  tally.accepted += 1;
  // 3. |lambda*| <= 16 |mu~| + 16 r < 1 - attractMargin.
  const slack = sub(THRESHOLD, mul(int(16), r));
  expect(compare(slack, int(0))).toBe(1);
  expect(compare(mul(int(256), norm2(mu)), mul(slack, slack))).toBe(-1);
};

const ring = (centre: readonly [number, number], tally: Tally): void => {
  for (let e = 4; e <= 32; e += 1) {
    const radius = 10 ** (-e / 2);
    for (let k = 0; k < 24; k += 1) {
      const angle = (2 * Math.PI * k) / 24 + 0.0137;
      audit(centre[0] + radius * Math.cos(angle), centre[1] + radius * Math.sin(angle), tally);
    }
  }
};

describe('period-4 certificate, audited in exact arithmetic', () => {
  it('holds around the cusps, the satellite roots and the centres', () => {
    const tally: Tally = { points: 0, certified: 0, accepted: 0 };
    for (const point of [
      // Primitive cusps: (4c + 3)^3 = -108.
      [-1.9405507889761495, 0],
      [-0.1547246055119252, 1.031047227748952],
      // Satellite roots: lambda = 1 is a simple root there.
      [-1.25, 0],
      [0.25, 0.5],
      // Centres: roots of G4.
      [-1.9407998065294847, 0],
      [-1.310702641336833, 0],
      [0.2822713907669139, 0.5300606175785253],
      [-0.15652016683375508, 1.0322471089228318],
    ] as const) {
      ring(point, tally);
    }
    expect(tally.accepted).toBeGreaterThan(3000);
  });

  it('holds on a grid over every gate box and its conjugate', () => {
    const tally: Tally = { points: 0, certified: 0, accepted: 0 };
    const steps = 48;
    for (const box of PERIOD_FOUR_BOXES) {
      const reStep = (box.reMax - box.reMin) / steps;
      const imLow = box.absImMin === 0 ? -box.absImMax : box.absImMin;
      const imStep = (box.absImMax - imLow) / steps;
      for (let i = 0; i < steps; i += 1) {
        for (let j = 0; j < steps; j += 1) {
          const re = box.reMin + (i + 0.5) * reStep;
          const im = imLow + (j + 0.5) * imStep;
          audit(re, im, tally);
          if (box.absImMin > 0) audit(re, -im, tally);
        }
      }
    }
    expect(tally.accepted).toBeGreaterThan(5000);
  });

  it('holds on both sides of the acceptance edge along each box midline', () => {
    const tally: Tally = { points: 0, certified: 0, accepted: 0 };
    const sample = createOrbitSample();
    for (const box of PERIOD_FOUR_BOXES) {
      const im = box.absImMin === 0 ? 0 : 0.5 * (box.absImMin + box.absImMax);
      // Walk the midline; bisect every flip of the decision down to adjacent doubles.
      const steps = 400;
      let previous = box.reMin;
      let previousAccepted = classifyPeriodFourInto(previous, im, sample);
      for (let i = 1; i <= steps; i += 1) {
        const re = box.reMin + ((box.reMax - box.reMin) * i) / steps;
        const accepted = classifyPeriodFourInto(re, im, sample);
        if (accepted !== previousAccepted) {
          let lo = previous;
          let hi = re;
          for (let n = 0; n < 80; n += 1) {
            const mid = 0.5 * (lo + hi);
            if (mid === lo || mid === hi) break;
            if (classifyPeriodFourInto(mid, im, sample) === previousAccepted) lo = mid;
            else hi = mid;
          }
          for (const edge of [lo, hi]) {
            for (let k = -8; k <= 8; k += 1) audit(edge + k * 1e-15, im, tally);
          }
        }
        previous = re;
        previousAccepted = accepted;
      }
    }
    expect(tally.accepted).toBeGreaterThan(50);
  });
});
