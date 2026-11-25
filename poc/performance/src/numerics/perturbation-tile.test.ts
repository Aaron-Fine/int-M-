import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  approximateReference,
  auditPerturbationTile,
  boundAdd,
  boundMultiply,
  deltaStep,
  generateReferenceOrbit,
  normUpper,
  pixelOffset,
  type DeltaStep,
  type PixelAudit,
  type TileSpec,
  type UpperBound,
} from './perturbation-tile';
import {
  backendSpec,
  checkBackendTile,
  verdictDisagreements,
  type OracleTile,
} from './perturbation-oracle-check';

const fixture = JSON.parse(
  readFileSync(new URL('../../../../fixtures/perturbation-tiles.v1.json', import.meta.url), 'utf8'),
) as { readonly tiles: readonly OracleTile[] };

function audited(spec: TileSpec, step?: DeltaStep): readonly PixelAudit[] {
  const result = auditPerturbationTile(spec, step);
  if (result.status !== 'audited') throw new Error(`tile refused: ${result.reason}`);
  return result.pixels;
}

const tile = (id: string): OracleTile => {
  const found = fixture.tiles.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`missing fixture tile ${id}`);
  return found;
};

const at = (exponent: number, value: bigint, target: number): bigint =>
  value << BigInt(exponent - target);

// Exact value of an upper bound as a rational m * 2^e, for primitive checks.
const scaled = (bound: UpperBound, exponent: number): bigint => at(bound.e, bound.m, exponent);

describe('binary64 perturbation backend pilot (Phase 3 packet 1)', () => {
  it.each(fixture.tiles.map((oracle) => [oracle.id, oracle] as const))(
    'agrees with the independent interval oracle, deltas within 2^-24, on %s',
    (_id, oracle) => {
      const report = checkBackendTile(oracle);
      expect(report.failures).toEqual([]);
      expect(report.pixels).toBe(oracle.width * oracle.height);
    },
    60_000,
  );

  it('separates deep pixels that binary64 parameters merge', () => {
    const oracle = tile('misiurewicz-i-step-2^-60');
    const spec = backendSpec(oracle);
    const x = oracle.width / 2;
    const reference = approximateReference(spec.reference);
    const rows = Array.from({ length: oracle.height }, (_, y) => y);
    // c = i (1 + k 2^-60): every parameter in this column rounds to i itself.
    const direct = new Set(
      rows.map(
        (y) =>
          `${reference.re + pixelOffset(spec, x, y).re},${reference.im + pixelOffset(spec, x, y).im}`,
      ),
    );
    expect(direct).toEqual(new Set(['0,1']));
    const pixels = audited(spec);
    const iterations = new Set(rows.map((y) => pixels[y * oracle.width + x]?.iteration));
    expect(iterations.size).toBeGreaterThan(5);
  });

  it('stays sound when the kernel is perturbed or wrong', () => {
    const oracle = tile('misiurewicz-i-step-2^-60');
    const noisy: DeltaStep = (rRe, rIm, dRe, dIm, oRe, oIm, out) => {
      deltaStep(rRe, rIm, dRe, dIm, oRe, oIm, out);
      out[0] = (out[0] ?? 0) * (1 + 2 ** -30);
    };
    const wrongSign: DeltaStep = (rRe, rIm, dRe, dIm, oRe, oIm, out) => {
      deltaStep(rRe, rIm, dRe, dIm, oRe, -oIm, out);
    };
    for (const step of [noisy, wrongSign]) {
      expect(verdictDisagreements(audited(backendSpec(oracle), step), oracle)).toEqual([]);
    }
    // A wrong kernel is not silently certified: its residual swamps the budget.
    const wrong = audited(backendSpec(oracle), wrongSign);
    expect(wrong.filter((pixel) => pixel.status === 'unresolved').length).toBeGreaterThan(200);
  }, 60_000);

  it('refuses unsupported tiles', () => {
    const base = backendSpec(tile('misiurewicz-i-step-2^-60'));
    const refused: readonly TileSpec[] = [
      { ...base, stepExponent: 23 },
      { ...base, stepExponent: 1001 },
      { ...base, stepExponent: 60.5 },
      { ...base, width: 15 },
      { ...base, height: 66 },
      { ...base, maxIterations: 0 },
      { ...base, maxIterations: 4097 },
      { ...base, reference: { re: Number.NaN, im: 0 } },
      { ...base, reference: { re: 2, im: 0.5 } },
      { ...base, reference: { re: 1n, im: 0n, exponent: -2000 } },
      { ...base, reference: { re: 1n, im: 0n, exponent: 0.5 } },
      { ...base, reference: { re: 3n, im: 0n, exponent: 0 } },
    ];
    for (const spec of refused) {
      expect(auditPerturbationTile(spec)).toEqual({
        status: 'refused',
        reason: 'unsupported-tile',
      });
    }
  });

  it('reports reference exhaustion instead of extrapolating', () => {
    const reference = generateReferenceOrbit({ re: 0, im: 1 }, 4096);
    expect(reference).not.toBeNull();
    // The c = i reference's ball radius passes 2^-64 well before 4096 steps.
    expect(reference?.length).toBeLessThan(4096);
    expect(reference?.length).toBeGreaterThan(400);
  });

  it('rounds every bound primitive upward and tightly', () => {
    let seed = 12345;
    const random = (): bigint => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return BigInt(seed);
    };
    for (let trial = 0; trial < 200; trial += 1) {
      const a: UpperBound = {
        m: random() * random() * random() + 1n,
        e: Number(random() % 200n) - 100,
      };
      const b: UpperBound = { m: random() * random() + 1n, e: Number(random() % 200n) - 100 };
      const e = Math.min(a.e, b.e) * 2 - 64;
      const sum = boundAdd(a, b);
      const product = boundMultiply(a, b);
      expect(scaled(sum, e)).toBeGreaterThanOrEqual(scaled(a, e) + scaled(b, e));
      expect(scaled(product, e)).toBeGreaterThanOrEqual(at(a.e + b.e, a.m * b.m, e));
      const re = random() * random() * random() - random() * random() * random();
      const im = random() * random() - random();
      const norm = normUpper(re, im, -10);
      const exact = re * re + im * im;
      const unit = at(norm.e, norm.m, -10 - 64);
      expect(unit * unit).toBeGreaterThanOrEqual(exact << 128n);
      // Tight: within one part in 2^50.
      const shrunk = unit - (unit >> 50n) - 1n;
      expect(shrunk * shrunk).toBeLessThan(exact << 128n);
    }
  });
});
