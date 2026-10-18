import { describe, expect, it } from 'vitest';

import { CatalogSchemaError, COMPONENT_CATALOG } from '../../../../src/catalog/components';
import { kneadingSequence } from '../../../../src/catalog/combinatorics';
import {
  CORE_HEADER_BYTES,
  CORE_RECORD_BYTES,
  decodeCatalogCore,
  isCoreCandidateId,
  mergeCatalog,
  parseCoreManifest,
  sha256Hex,
} from '../../../../src/catalog/core';
import { componentSizeEstimate } from '../../../../src/catalog/navigation';
import { rayModulus } from '../../../../src/catalog/schema';
import { CORE_MANIFEST, CORE_MANIFEST_DATA, coreBytes, fullCatalog } from './core-bytes';

/** Hyperbolic components of exact period p (OEIS A000740), p = 1..12; 4,016 in all. */
const COMPONENT_COUNTS = [1, 1, 3, 6, 15, 27, 63, 120, 252, 495, 1023, 2010];
const CORE = decodeCatalogCore(coreBytes(), CORE_MANIFEST);

/** A copy of the committed core with one record field rewritten. */
const edited = (edit: (view: DataView) => void): ArrayBuffer => {
  const copy = coreBytes();
  edit(new DataView(copy));
  return copy;
};
const recordOffset = (index: number): number => CORE_HEADER_BYTES + index * CORE_RECORD_BYTES;

/** |f^p(0)| / |d/dc f^p(0)| in binary64: the Newton step from the stored centre. */
const newtonStep = (re: number, im: number, period: number): number => {
  let [zr, zi, dr, di] = [0, 0, 0, 0];
  for (let step = 0; step < period; step += 1) {
    [dr, di] = [2 * (zr * dr - zi * di) + 1, 2 * (zr * di + zi * dr)];
    [zr, zi] = [zr * zr - zi * zi + re, 2 * zr * zi + im];
  }
  return Math.hypot(zr, zi) / Math.hypot(dr, di);
};

describe('catalog core file (ADR 0014)', () => {
  it('matches the SHA-256 and the 256 KiB budget in its manifest', async () => {
    const bytes = coreBytes();
    expect(await sha256Hex(bytes)).toBe(CORE_MANIFEST.sha256);
    expect(bytes.byteLength).toBe(CORE_HEADER_BYTES + 4016 * CORE_RECORD_BYTES);
    expect(bytes.byteLength).toBeLessThanOrEqual(256 * 1024);
  });

  it('lists every component of period 1 to 12 once, in catalog order', () => {
    const counts = COMPONENT_COUNTS.map(
      (_, index) => CORE.filter((component) => component.period === index + 1).length,
    );
    expect(counts).toEqual(COMPONENT_COUNTS);
    expect(new Set(CORE.map((component) => component.id)).size).toBe(4016);
  });

  it('stores centres a binary64 Newton step from a root, of exact period', () => {
    for (const { id, center, period, residual } of CORE) {
      const scale = Math.max(1, Math.hypot(center.re, center.im));
      expect(newtonStep(center.re, center.im, period), id).toBeLessThan(1e-15 * scale);
      expect(residual.centerError, id).toBeLessThanOrEqual(Number.EPSILON * scale);
      if (period > 1) expect(residual.properDivisorOrbitMinAbs, id).toBeGreaterThan(1e-3);
    }
  });

  it('pairs two rays with one kneading sequence, in the half-plane of the centre', () => {
    for (const { id, period, center, characteristicRays } of CORE) {
      if (characteristicRays === undefined) continue;
      const [lower, upper] = characteristicRays.map((ray) => ray.numerator) as [number, number];
      const modulus = rayModulus(period);
      expect(kneadingSequence(lower, period), id).toBe(kneadingSequence(upper, period));
      if (center.im > 0) expect(2 * upper, id).toBeLessThan(modulus);
      else if (center.im < 0) expect(2 * lower, id).toBeGreaterThan(modulus);
      else expect(lower + upper, id).toBe(modulus);
    }
  });

  it('is closed under complex conjugation, mirroring rays and angled addresses', () => {
    const byId = new Map(CORE.map((component) => [component.id, component] as const));
    for (const component of CORE.filter((entry) => entry.period > 1)) {
      const modulus = rayModulus(component.period);
      const [lower, upper] = component.characteristicRays!.map((ray) => ray.numerator) as [
        number,
        number,
      ];
      const mirror = byId.get(`mi-p${component.period}-${modulus - upper}-${modulus - lower}`);
      expect(mirror?.center, component.id).toEqual({
        re: component.center.re,
        im: -component.center.im + 0,
      });
      expect(mirror?.angledInternalAddress?.map((step) => step.rotation)).toEqual(
        component.angledInternalAddress?.map(({ rotation }) => ({
          numerator: rotation.denominator - rotation.numerator,
          denominator: rotation.denominator,
        })),
      );
    }
  });

  it('gives each period distinct angled internal addresses', () => {
    for (let period = 2; period <= 12; period += 1) {
      const addresses = CORE.filter((component) => component.period === period).map((component) =>
        JSON.stringify(component.angledInternalAddress),
      );
      expect(new Set(addresses).size, `period ${period}`).toBe(addresses.length);
    }
  });

  it('has a finite, positive size estimate for every entry', () => {
    for (const component of CORE) {
      const size = componentSizeEstimate(component);
      expect(Number.isFinite(size) && size > 0, component.id).toBe(true);
    }
  });

  it('agrees with every curated entry, which the merge keeps', () => {
    const merged = fullCatalog();
    expect(merged).toHaveLength(4016);
    for (const named of COMPONENT_CATALOG) {
      const generated = CORE.find((component) => component.id === named.id);
      expect(generated?.center, named.id).toEqual(named.center);
      expect(generated?.residual, named.id).toEqual(named.residual);
      expect(generated?.centerPrecisionDigits, named.id).toBe(named.centerPrecisionDigits);
      expect(generated?.internalAddress, named.id).toEqual(named.internalAddress);
      expect(generated?.angledInternalAddress, named.id).toEqual(named.angledInternalAddress);
      expect(merged.find((component) => component.id === named.id)).toBe(named);
    }
  });

  it('labels every generated entry by its rays', () => {
    const entry = fullCatalog().find((component) => component.id === 'mi-p12-2047-2048');
    expect(entry?.label).toBe('Period 12, rays 2047/4095 and 2048/4095');
    expect(entry?.provenance).toBe('generated-label');
  });
});

describe('catalog core loader rejects a damaged file (MI-PERF-003)', () => {
  it.each([
    ['a truncated file', () => coreBytes().slice(0, -1), /length/],
    ['another magic', () => edited((view) => view.setUint8(0, 0x41)), /must start with MICORE/],
    [
      'another format version',
      () => edited((view) => view.setUint16(6, 2, true)),
      /format version/,
    ],
    [
      'a ray not of exact period',
      () => edited((view) => view.setUint16(recordOffset(5) + 3, 5, true)),
      /exact period/,
    ],
    [
      'records out of order',
      () => edited((view) => view.setUint16(recordOffset(6) + 1, 1, true)),
      /catalog order/,
    ],
    [
      'a non-finite centre',
      () => edited((view) => view.setFloat64(recordOffset(7) + 5, Number.NaN, true)),
      /finite/,
    ],
    [
      'a negative residual',
      () => edited((view) => view.setFloat32(recordOffset(7) + 22, -1, true)),
      /non-negative/,
    ],
  ])('rejects %s', (_name, bytes, message) => {
    expect(() => decodeCatalogCore(bytes(), CORE_MANIFEST)).toThrow(CatalogSchemaError);
    expect(() => decodeCatalogCore(bytes(), CORE_MANIFEST)).toThrow(message);
  });

  it('rejects a manifest of another format or with a malformed digest', () => {
    const raw = CORE_MANIFEST_DATA as Record<string, unknown>;
    expect(() => parseCoreManifest({ ...raw, formatVersion: 2 })).toThrow(/formatVersion/);
    expect(() => parseCoreManifest({ ...raw, sha256: 'abc' })).toThrow(/sha256/);
    expect(() => parseCoreManifest({ ...raw, maxPeriod: 13 })).toThrow(/maxPeriod/);
  });

  it('rejects a curated entry whose centre differs from the core', () => {
    const [first, ...rest] = COMPONENT_CATALOG;
    const moved = { ...first!, center: { re: 1e-9, im: 0 } };
    expect(() => mergeCatalog([moved, ...rest], CORE)).toThrow(/curated centre differs/);
  });
});

describe('catalog ids a link may name before the core loads (ADR 0014)', () => {
  it.each([
    ['mi-p12-1-2', true],
    ['mi-p5-1-2', true],
    ['mi-p5-1-9', true], // well formed; the loaded core then says it is not a component
    ['mi-p4-1-2', false], // period 4 is curated and resolved at once
    ['mi-p13-1-2', false],
    ['mi-p5-01-2', false],
    ['mi-p5-2-1', false],
    ['mi-p5-1-31', false],
    ['mi-p5-1-3', false], // different kneading sequences
    ['mi-p6-21-42', false], // 21/63 = 1/3 has period 2
  ])('%s → %s', (id, accepted) => {
    expect(isCoreCandidateId(id, 4)).toBe(accepted);
  });
});
