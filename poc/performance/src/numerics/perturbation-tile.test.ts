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

interface OracleTile {
  readonly id: string;
  readonly reference: { readonly re: string; readonly im: string };
  readonly stepExponent: number;
  readonly width: number;
  readonly height: number;
  readonly maxIterations: number;
  readonly exportBits: number;
  readonly pixels: readonly {
    readonly x: number;
    readonly y: number;
    readonly status: 'escaped' | 'bounded' | 'unresolved';
    readonly iteration: number;
    readonly box: {
      readonly reLo: string;
      readonly reHi: string;
      readonly imLo: string;
      readonly imHi: string;
    };
  }[];
}

const fixture = JSON.parse(
  readFileSync(new URL('../../../../fixtures/perturbation-tiles.v1.json', import.meta.url), 'utf8'),
) as { readonly tiles: readonly OracleTile[] };

const specOf = (tile: OracleTile): TileSpec => ({
  reference: { re: Number(tile.reference.re), im: Number(tile.reference.im) },
  stepExponent: tile.stepExponent,
  width: tile.width,
  height: tile.height,
  maxIterations: tile.maxIterations,
});

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

/** Exact: distance from the audited disk centre to the oracle box <= radius. */
function diskMeetsBox(
  pixel: PixelAudit,
  box: OracleTile['pixels'][number]['box'],
  exportBits: number,
): boolean {
  if (pixel.state === null) return false;
  const { centerRe, centerIm, radius } = pixel.state;
  const e = Math.min(-1074, -exportBits, radius.e);
  const gap = (lo: bigint, hi: bigint, value: bigint): bigint =>
    value < lo ? lo - value : value > hi ? value - hi : 0n;
  const re = gap(
    at(-exportBits, BigInt(box.reLo), e),
    at(-exportBits, BigInt(box.reHi), e),
    at(-1074, centerRe, e),
  );
  const im = gap(
    at(-exportBits, BigInt(box.imLo), e),
    at(-exportBits, BigInt(box.imHi), e),
    at(-1074, centerIm, e),
  );
  const r = at(radius.e, radius.m, e);
  return re * re + im * im <= r * r;
}

function certifiedDisagreements(pixels: readonly PixelAudit[], oracle: OracleTile): number {
  return pixels.filter((pixel, index) => {
    const expected = oracle.pixels[index];
    if (expected === undefined || pixel.status === 'unresolved' || expected.status === 'unresolved')
      return false;
    return pixel.status !== expected.status || pixel.iteration !== expected.iteration;
  }).length;
}

// Exact value of an upper bound as a rational m * 2^e, for primitive checks.
const scaled = (bound: UpperBound, exponent: number): bigint => at(bound.e, bound.m, exponent);

describe('binary64 perturbation backend pilot (Phase 3 packet 1)', () => {
  it.each(fixture.tiles.map((oracle) => [oracle.id, oracle] as const))(
    'agrees with the independent interval oracle on %s',
    (_id, oracle) => {
      const pixels = audited(specOf(oracle));
      expect(pixels).toHaveLength(oracle.width * oracle.height);
      expect(certifiedDisagreements(pixels, oracle)).toBe(0);
      // Only the c = i reference pixel itself (never escapes; its repelling
      // cycle exhausts the reference grid) may stay unresolved.
      const unresolved = pixels.flatMap((pixel, index) =>
        pixel.status === 'unresolved' ? [{ index, reason: pixel.reason }] : [],
      );
      const centre = (oracle.height / 2) * oracle.width + oracle.width / 2;
      expect(unresolved).toEqual(
        oracle.reference.im === '1' ? [{ index: centre, reason: 'reference-exhausted' }] : [],
      );
      // Same verdict and iteration: the audited disk meets the oracle box.
      pixels.forEach((pixel, index) => {
        const expected = oracle.pixels[index];
        if (expected === undefined || pixel.status === 'unresolved') return;
        expect(pixel.iteration).toBe(expected.iteration);
        expect(diskMeetsBox(pixel, expected.box, oracle.exportBits)).toBe(true);
      });
    },
    60_000,
  );

  it('certifies each delta to better than one part in 2^24', () => {
    for (const oracle of fixture.tiles) {
      for (const pixel of audited(specOf(oracle))) {
        if (pixel.state === null) continue;
        const { deltaRe, deltaIm, deltaBudget } = pixel.state;
        const deltaSquared = deltaRe * deltaRe + deltaIm * deltaIm; // units 2^-2148
        if (deltaSquared === 0n) continue; // the reference pixel itself
        // b_k^2 * 2^48 <= |d_k|^2, exactly.
        const e = Math.min(deltaBudget.e, -1074);
        const budget = at(deltaBudget.e, deltaBudget.m, e);
        expect((budget * budget) << 48n).toBeLessThanOrEqual(at(-2148, deltaSquared, 2 * e));
      }
    }
  }, 60_000);

  it('separates deep pixels that binary64 parameters merge', () => {
    const oracle = tile('misiurewicz-i-step-2^-60');
    const spec = specOf(oracle);
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
      const pixels = audited(specOf(oracle), step);
      expect(certifiedDisagreements(pixels, oracle)).toBe(0);
    }
    // A wrong kernel is not silently certified: its residual swamps the budget.
    const wrong = audited(specOf(oracle), wrongSign);
    expect(wrong.filter((pixel) => pixel.status === 'unresolved').length).toBeGreaterThan(200);
  }, 60_000);

  it('refuses unsupported tiles', () => {
    const base = specOf(tile('misiurewicz-i-step-2^-60'));
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
