import { describe, expect, it, vi } from 'vitest';

import {
  classifyInto,
  createOrbitSample,
  DEFAULT_VIEWPORT,
  InterleavedClassifier,
  OrbitScratch,
  resolveOrbitOptions,
  type OrbitOptions,
  type OrbitSample,
} from '../../../src/domain';
import { classifyRows } from '../../../src/render/classify-rows';
import { semanticRequestKey, type DynamicsRenderRequest } from '../../../src/render';
import { STRATA } from './legacy-differential';

/**
 * interleave-2: the two-lane lockstep kernel must equal two independent
 * scalar classifyInto calls bit for bit, for every pairing (including pairs
 * where one lane takes an analytic path, escapes early, or converges).
 */

const PROFILES = [
  { label: 'quick', maxIterations: 128, maxPeriod: 16 },
  { label: 'balanced', maxIterations: 512, maxPeriod: 32 },
] as const;

const bits = (value: number): bigint => {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value);
  return view.getBigUint64(0);
};

const FIELDS = [
  'status',
  'iterations',
  'evidence',
  'period',
  'multiplierRe',
  'multiplierIm',
  'multiplierMagnitude',
  'multiplierAngle',
  'stabilityExponent',
  'escapeIteration',
  'smoothIteration',
  'magnitudeSquared',
] as const satisfies readonly (keyof OrbitSample)[];

const sameBits = (a: Readonly<OrbitSample>, b: Readonly<OrbitSample>): boolean =>
  FIELDS.every((field) => bits(a[field]) === bits(b[field]));

/** Strict per-field Object.is equality (distinguishes +0/-0, NaN equals NaN). */
const sameObjectIs = (a: Readonly<OrbitSample>, b: Readonly<OrbitSample>): boolean =>
  FIELDS.every((field) => Object.is(a[field], b[field]));

/** mulberry32: small seeded PRNG so the randomized parity test is reproducible. */
const seededRandom = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

describe('interleaved pair kernel', () => {
  for (const profile of PROFILES) {
    it(`matches scalar classifyInto for adjacent and mirrored pairings (${profile.label})`, () => {
      const options = resolveOrbitOptions(profile);
      const scratch = new OrbitScratch(options.maxPeriod);
      const pair = new InterleavedClassifier(profile);
      const expectedA = createOrbitSample();
      const expectedB = createOrbitSample();
      const actualA = createOrbitSample();
      const actualB = createOrbitSample();
      const count = STRATA.length;
      let mismatches = 0;
      for (let i = 0; i < count; i += 1) {
        for (const j of [(i + 1) % count, count - 1 - i]) {
          const a = STRATA[i];
          const b = STRATA[j];
          if (a === undefined || b === undefined) continue;
          // Reuse the output records dirty: stale fields must not leak.
          classifyInto(a.re, a.im, options, scratch, expectedA);
          classifyInto(b.re, b.im, options, scratch, expectedB);
          pair.classifyPairInto(a.re, a.im, b.re, b.im, actualA, actualB);
          if (!sameBits(expectedA, actualA) || !sameBits(expectedB, actualB)) mismatches += 1;
        }
      }
      expect(mismatches).toBe(0);
    });
  }
});

// Permanent randomized parity: ~20k seeded pixel pairs per run against the
// scalar kernel, over the shipped budgets, a tiny budget, and a loose
// cycleTolerance (1e-3) that forces lag-scan proposals through the verifier.
const RANDOM_OPTION_SETS = [
  { label: '512/32', maxIterations: 512, maxPeriod: 32 },
  { label: '1024/64', maxIterations: 1024, maxPeriod: 64 },
  { label: '40/5', maxIterations: 40, maxPeriod: 5 },
  { label: '512/32 cycleTolerance 1e-3', maxIterations: 512, maxPeriod: 32, cycleTolerance: 1e-3 },
] as const;
const RANDOM_PAIRS_PER_SET = 5000;

describe('interleaved pair kernel (seeded randomized parity)', () => {
  for (const [setIndex, optionSet] of RANDOM_OPTION_SETS.entries()) {
    it(`is Object.is-identical to scalar classifyInto on ${RANDOM_PAIRS_PER_SET} random pairs (${optionSet.label})`, () => {
      const partial: Partial<OrbitOptions> = {
        maxIterations: optionSet.maxIterations,
        maxPeriod: optionSet.maxPeriod,
        ...('cycleTolerance' in optionSet ? { cycleTolerance: optionSet.cycleTolerance } : {}),
      };
      const options = resolveOrbitOptions(partial);
      const scratch = new OrbitScratch(options.maxPeriod);
      const pair = new InterleavedClassifier(partial);
      const random = seededRandom(0x1ea5e + setIndex);
      const expectedA = createOrbitSample();
      const expectedB = createOrbitSample();
      const actualA = createOrbitSample();
      const actualB = createOrbitSample();
      // Mix of the whole plane window and the interior-rich region, so lanes
      // escape, converge, hit analytic regions and exhaust the budget.
      const point = (): [number, number] =>
        random() < 0.5
          ? [-2.2 + 3 * random(), -1.3 + 2.6 * random()]
          : [-1.4 + 1.2 * random(), -0.7 + 1.4 * random()];
      const statuses = new Set<number>();
      let mismatches = 0;
      for (let n = 0; n < RANDOM_PAIRS_PER_SET; n += 1) {
        const [reA, imA] = point();
        // Every third pair is a horizontal neighbour pair as the raster sees it.
        const [reB, imB] = n % 3 === 0 ? [reA + 1e-3 * (1 + random()), imA] : point();
        classifyInto(reA, imA, options, scratch, expectedA);
        classifyInto(reB, imB, options, scratch, expectedB);
        pair.classifyPairInto(reA, imA, reB, imB, actualA, actualB);
        statuses.add(expectedA.status);
        if (!sameObjectIs(expectedA, actualA) || !sameObjectIs(expectedB, actualB)) {
          mismatches += 1;
        }
      }
      expect(mismatches).toBe(0);
      // Guard against a degenerate sampler that never reaches some outcomes.
      expect(statuses.has(1)).toBe(true);
      expect(statuses.has(2)).toBe(true);
    });
  }
});

describe('interleave render option', () => {
  const size = { width: 37, height: 11 }; // odd width exercises the trailing pixel
  const quality = { maxIterations: 256, maxPeriod: 32, coarseStride: 4 };
  const request: DynamicsRenderRequest = { viewport: DEFAULT_VIEWPORT, size };

  it('renders the same band with the option on and off', async () => {
    for (const stride of [1, 3]) {
      const signal = new AbortController().signal;
      const off = await classifyRows(request, quality, stride, 0, size.height, signal);
      const on = await classifyRows(
        request,
        quality,
        stride,
        0,
        size.height,
        signal,
        undefined,
        undefined,
        undefined,
        { interleave: true },
      );
      expect(Array.from(on.packedStatusPeriod)).toEqual(Array.from(off.packedStatusPeriod));
      expect(Array.from(on.smoothIterationOrMultiplierMagnitude)).toEqual(
        Array.from(off.smoothIterationOrMultiplierMagnitude),
      );
      expect(Array.from(on.multiplierAngle)).toEqual(Array.from(off.multiplierAngle));
    }
  });

  it('composes with preparedCoordinates, bit-identical to the plain path', async () => {
    // Odd width exercises the trailing scalar cell of the pair loop; stride 3
    // exercises the clipped block-center columns.
    for (const stride of [1, 3]) {
      const signal = new AbortController().signal;
      const plain = await classifyRows(request, quality, stride, 0, size.height, signal);
      const combined = await classifyRows(
        request,
        quality,
        stride,
        0,
        size.height,
        signal,
        undefined,
        undefined,
        undefined,
        { interleave: true, preparedCoordinates: true },
      );
      expect(Array.from(combined.packedStatusPeriod)).toEqual(Array.from(plain.packedStatusPeriod));
      expect(
        combined.smoothIterationOrMultiplierMagnitude.every((value, index) =>
          Object.is(value, plain.smoothIterationOrMultiplierMagnitude[index]),
        ),
      ).toBe(true);
      expect(
        combined.multiplierAngle.every((value, index) =>
          Object.is(value, plain.multiplierAngle[index]),
        ),
      ).toBe(true);
    }
  });

  // NOTE: interleave does not currently combine with triggered-scan (or
  // checkpoint/differential): those modes take the scalar kernel below. A
  // combined triggered-scan pair kernel is future work.
  it.each([
    ['perfCounters is on', { perfCounters: true }, undefined],
    ['classifierMode is checkpoint', {}, 'checkpoint'],
    ['classifierMode is differential', {}, 'differential'],
    ['classifierMode is triggered-scan', {}, 'triggered-scan'],
  ] as const)('falls back to the scalar kernel when %s', async (_name, extra, mode) => {
    const pairSpy = vi.spyOn(InterleavedClassifier.prototype, 'classifyPairInto');
    try {
      const signal = new AbortController().signal;
      await classifyRows(request, quality, 1, 0, size.height, signal, mode, undefined, undefined, {
        interleave: true,
        ...extra,
      });
      expect(pairSpy).not.toHaveBeenCalled();
      // Control: the legacy-scan, counter-less path does use the pair kernel.
      await classifyRows(
        request,
        quality,
        1,
        0,
        size.height,
        signal,
        undefined,
        undefined,
        undefined,
        {
          interleave: true,
        },
      );
      expect(pairSpy).toHaveBeenCalled();
    } finally {
      pairSpy.mockRestore();
    }
  });

  it('scopes cached frames by the flag and leaves the default key unchanged', () => {
    const base = semanticRequestKey(request);
    expect(semanticRequestKey({ ...request, interleave: true })).toBe(`${base}|il:1`);
  });
});
