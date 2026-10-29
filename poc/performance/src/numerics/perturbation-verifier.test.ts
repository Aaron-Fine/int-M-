import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { classifyOrbit } from '../../../../src/domain/orbit';
import { binary64Units } from './minus-one-jet';
import { approximateReference, pixelOffset, type PixelState } from './perturbation-tile';
import {
  classifyPerturbationInteriorTile,
  CycleWindow,
  properDivisors,
  verdictCode,
  type InteriorPixel,
  type InteriorTileSpec,
} from './perturbation-verifier';

interface OracleInteriorTile {
  readonly id: string;
  readonly reference: { readonly re: string; readonly im: string; readonly exponent?: number };
  readonly stepExponent: number;
  readonly width: number;
  readonly height: number;
  readonly maxIterations: number;
  readonly maxPeriod: number;
  readonly pixels: readonly {
    readonly status: 'escaped' | 'bounded' | 'unresolved';
    readonly iteration: number;
    readonly codes?: string;
  }[];
}

const fixture = JSON.parse(
  readFileSync(
    new URL('../../../../fixtures/perturbation-interior.v1.json', import.meta.url),
    'utf8',
  ),
) as { readonly tiles: readonly OracleInteriorTile[] };

const specOf = (tile: OracleInteriorTile): InteriorTileSpec => ({
  reference:
    tile.reference.exponent === undefined
      ? { re: Number(tile.reference.re), im: Number(tile.reference.im) }
      : {
          re: BigInt(tile.reference.re),
          im: BigInt(tile.reference.im),
          exponent: tile.reference.exponent,
        },
  stepExponent: tile.stepExponent,
  width: tile.width,
  height: tile.height,
  maxIterations: tile.maxIterations,
  maxPeriod: tile.maxPeriod,
});

function classified(tile: OracleInteriorTile): readonly InteriorPixel[] {
  const result = classifyPerturbationInteriorTile(specOf(tile));
  if (result.status !== 'audited') throw new Error(`tile refused: ${result.reason}`);
  return result.pixels;
}

const cache = new Map<string, readonly InteriorPixel[]>();
const pixelsOf = (tile: OracleInteriorTile): readonly InteriorPixel[] => {
  const cached = cache.get(tile.id) ?? classified(tile);
  cache.set(tile.id, cached);
  return cached;
};

const tile = (id: string): OracleInteriorTile => {
  const found = fixture.tiles.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`missing fixture tile ${id}`);
  return found;
};

/** Synthetic window: exact points (binary64), each with the same radius. */
function windowOf(points: readonly (readonly [number, number])[], radius: number): CycleWindow {
  const units = (value: number): bigint => {
    const decoded = binary64Units(value);
    if (decoded === null) throw new Error('nonfinite');
    return decoded;
  };
  const r = units(radius);
  const states: PixelState[] = points.map(([re, im]) => ({
    centerRe: units(re),
    centerIm: units(im),
    radius: { m: r, e: -1074 },
    deltaRe: 0n,
    deltaIm: 0n,
    deltaBudget: { m: 0n, e: 0 },
  }));
  return new CycleWindow(states);
}

describe('certified V0 verifier on perturbation enclosures (Phase 3 packet 3)', () => {
  it.each(fixture.tiles.map((oracle) => [oracle.id, oracle] as const))(
    'matches the independent interval V0 oracle on every certified frame of %s',
    (_id, oracle) => {
      const pixels = pixelsOf(oracle);
      let compared = 0;
      let uncertified = 0;
      pixels.forEach((pixel, index) => {
        const expected = oracle.pixels[index];
        if (expected === undefined) throw new Error('fixture size');
        if (pixel.status === 'escaped') {
          expect(expected).toMatchObject({ status: 'escaped', iteration: pixel.iteration });
          return;
        }
        if (pixel.codes === null || expected.codes === undefined) return;
        const oracleCodes = expected.codes.split(',');
        expect(pixel.codes).toHaveLength(oracleCodes.length);
        pixel.codes.forEach((code, p) => {
          if (code === 'U') uncertified += 1;
          if (code === 'U' || oracleCodes[p] === 'U') return;
          compared += 1;
          expect(`p=${p + 1}:${code}`).toBe(`p=${p + 1}:${oracleCodes[p]}`);
        });
      });
      expect(compared).toBeGreaterThan(0);
      // The enclosures are tight enough to certify every reached comparison.
      expect(uncertified).toBe(0);
    },
    120_000,
  );

  it('classifies deep minibrot interiors with their primitive period', () => {
    const counts = (id: string): Record<string, number> => {
      const result: Record<string, number> = {};
      for (const pixel of pixelsOf(tile(id))) {
        const key = pixel.status === 'attracting' ? `A${pixel.period}` : pixel.status;
        result[key] = (result[key] ?? 0) + 1;
      }
      return result;
    };
    expect(counts('minibrot-p34-step-2^-33')).toMatchObject({ A34: 22 });
    expect(counts('minibrot-p61-step-2^-40')).toMatchObject({ A61: 16 });
    // Every certified period is the minibrot's own, or its period-doubled satellite.
    for (const id of ['minibrot-p34-step-2^-33', 'minibrot-p61-step-2^-40']) {
      const periods = Object.keys(counts(id)).filter((key) => key.startsWith('A'));
      expect(['A34', 'A68', 'A61']).toEqual(expect.arrayContaining(periods));
    }
  }, 120_000);

  it('classifies a minibrot interior below binary64 parameter resolution', () => {
    const oracle = tile('minibrot-p349-step-2^-58');
    const spec = specOf(oracle);
    const reference = approximateReference(spec.reference);
    // Every row's parameters round to one binary64 value...
    for (let y = 0; y < oracle.height; y += 1) {
      const row = new Set(
        Array.from({ length: oracle.width }, (_, x) => {
          const offset = pixelOffset(spec, x, y);
          return `${reference.re + offset.re},${reference.im + offset.im}`;
        }),
      );
      expect(row.size).toBe(1);
    }
    // ...yet the certified V0 decision separates them.
    const periods = pixelsOf(oracle).flatMap((pixel) =>
      pixel.status === 'attracting' ? [pixel.period] : [],
    );
    expect(periods).toHaveLength(13);
    expect(new Set(periods)).toEqual(new Set([349]));
  }, 120_000);

  it('reduces a proposed multiple to the primitive period', () => {
    const oracle = tile('minibrot-p34-step-2^-33');
    const reduced = pixelsOf(oracle).filter(
      (pixel) => pixel.status === 'attracting' && pixel.codes[67] === 'A34',
    );
    expect(reduced.length).toBeGreaterThan(10);
  }, 120_000);

  // Only inside the supported zoom bound: at steps 2^-33 and 2^-40 the
  // production classifier is outside its contract and does disagree (see
  // PERTURBATION-VERIFIER-PILOT.md, production beyond the bound).
  it.each(['minibrot-p25-step-2^-24'])(
    'agrees with the production classifier inside the zoom bound on %s',
    (id) => {
      const oracle = tile(id);
      const spec = specOf(oracle);
      const reference = approximateReference(spec.reference);
      let compared = 0;
      pixelsOf(oracle).forEach((pixel, index) => {
        const x = index % oracle.width;
        const y = Math.floor(index / oracle.width);
        const offset = pixelOffset(spec, x, y);
        const c = { re: reference.re + offset.re, im: reference.im + offset.im };
        // The parameter is exact: c_ref has bits down to 2^-53, offsets to 2^-stepExponent.
        expect(c.re - reference.re).toBe(offset.re);
        expect(c.im - reference.im).toBe(offset.im);
        const production = classifyOrbit(c, {
          maxIterations: oracle.maxIterations,
          maxPeriod: oracle.maxPeriod,
        });
        if (pixel.status === 'escaped') {
          compared += 1;
          expect(production).toMatchObject({ status: 'escaped', escapeIteration: pixel.iteration });
        } else if (pixel.status === 'attracting') {
          compared += 1;
          expect(production).toMatchObject({ status: 'attracting-cycle', period: pixel.period });
        }
      });
      expect(compared).toBeGreaterThan(200);
    },
    120_000,
  );

  it('follows the V0 order on exact synthetic cycles', () => {
    // c = -1: superattracting 2-cycle 0 -> -1 -> 0.
    const cycle = windowOf(
      Array.from({ length: 9 }, (_, k) => [k % 2 === 0 ? 0 : -1, 0] as const),
      2 ** -60,
    );
    expect(verdictCode(cycle.decide(1))).toBe('N');
    expect(verdictCode(cycle.decide(2))).toBe('A2');
    expect(verdictCode(cycle.decide(4))).toBe('A2'); // reduced
    expect(verdictCode(cycle.decide(8))).toBe('A2');
    // Closure at exactly the acceptance threshold: a radius that straddles it
    // must refuse, not guess.
    const straddle = windowOf(
      [
        [0, 0],
        [1e-8, 0],
      ],
      1e-12,
    );
    expect(straddle.decide(1)).toEqual({ verdict: 'uncertified', at: 'closure' });
    // Between accept and exclude: certified ambiguous.
    const ambiguous = windowOf(
      [
        [0, 0],
        [1e-7, 0],
      ],
      2 ** -60,
    );
    expect(verdictCode(ambiguous.decide(1))).toBe('C');
    // Repelling fixed point z = 2 (c = -2): closes, |lambda| = 4.
    const repelling = windowOf(
      [
        [2, 0],
        [2, 0],
      ],
      2 ** -60,
    );
    expect(verdictCode(repelling.decide(1))).toBe('X');
    // Divisor between accept and exclude: divisor ambiguous.
    const divisor = windowOf(
      [
        [0, 0],
        [1e-7, 0],
        [0, 0],
      ],
      2 ** -60,
    );
    expect(verdictCode(divisor.decide(2))).toBe('D');
  });

  it('lists proper divisors in ascending order', () => {
    expect(properDivisors(1)).toEqual([]);
    expect(properDivisors(12)).toEqual([1, 2, 3, 4, 6]);
    expect(properDivisors(61)).toEqual([1]);
  });

  it('refuses unsupported interior tiles', () => {
    const base = specOf(tile('minibrot-p34-step-2^-33'));
    for (const spec of [
      { ...base, maxPeriod: 0 },
      { ...base, maxPeriod: 513 },
      { ...base, maxPeriod: base.maxIterations },
      { ...base, stepExponent: 23 },
    ]) {
      expect(classifyPerturbationInteriorTile(spec)).toEqual({
        status: 'refused',
        reason: 'unsupported-tile',
      });
    }
  });
});
