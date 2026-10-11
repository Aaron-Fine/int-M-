import { describe, expect, it } from 'vitest';

import {
  classifyInto,
  createOrbitSample,
  DEFAULT_VIEWPORT,
  InterleavedClassifier,
  OrbitScratch,
  resolveOrbitOptions,
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

  it('scopes cached frames by the flag and leaves the default key unchanged', () => {
    const base = semanticRequestKey(request);
    expect(semanticRequestKey({ ...request, interleave: true })).toBe(`${base}|il:1`);
  });
});
