import {
  angledInternalAddressOf,
  generatedLabel,
  hasExactRayPeriod,
  internalAddressOf,
  kneadingSequence,
} from './combinatorics';
import type { Complex } from '../domain/types';
import {
  catalogIdFor,
  CatalogSchemaError,
  MAX_CATALOG_PERIOD,
  rayModulus,
  type AngledAddressStep,
  type CatalogComponent,
  type CatalogResidual,
  type RationalAngle,
} from './schema';

/**
 * The period ≤12 catalog core (PHASE2-TODO item 7, ADR 0014):
 * catalog/core.v1.bin, 4,016 fixed records written by
 * tools/generate_catalog_core.py, and its manifest catalog/core.v1.json.
 * Each record holds the period, both characteristic ray numerators, the
 * binary64 centre, its correct digits and three residuals; ids, labels and
 * addresses are derived here. Curated labels, aliases and annotations come
 * from catalog/components.v2.json (mergeCatalog). This module is pure, so the
 * worker that loads the core and the unit tests share it.
 */

export const CORE_FORMAT = 'mi-catalog-core';
export const CORE_FORMAT_VERSION = 1;
const MAGIC = 'MICORE';
/** magic (6 bytes), format version, maximum period, record size (u16 each), count (u32). */
export const CORE_HEADER_BYTES = 16;
/** period u8, lower u16, upper u16, re f64, im f64, digits u8, three f32 residuals. */
export const CORE_RECORD_BYTES = 34;
const GENERATED_PROVENANCE = 'generated-label';

export interface CoreManifest {
  readonly format: typeof CORE_FORMAT;
  readonly formatVersion: typeof CORE_FORMAT_VERSION;
  readonly maxPeriod: number;
  readonly count: number;
  readonly countsByPeriod: readonly number[];
  readonly recordBytes: number;
  readonly byteLength: number;
  readonly sha256: string;
  readonly method: string;
}

const fail = (where: string, problem: string): never => {
  throw new CatalogSchemaError(`catalog core ${where}: ${problem}`);
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const positiveInteger = (value: unknown, where: string): number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0
    ? value
    : fail(where, 'must be a positive integer');

/** Validates the manifest's fields that the loader relies on. */
export const parseCoreManifest = (raw: unknown): CoreManifest => {
  if (!isRecord(raw)) return fail('manifest', 'must be an object');
  if (raw['format'] !== CORE_FORMAT) fail('format', `must be ${CORE_FORMAT}`);
  if (raw['formatVersion'] !== CORE_FORMAT_VERSION) {
    fail('formatVersion', `must be ${CORE_FORMAT_VERSION}`);
  }
  const maxPeriod = positiveInteger(raw['maxPeriod'], 'maxPeriod');
  if (maxPeriod > MAX_CATALOG_PERIOD) fail('maxPeriod', `must be at most ${MAX_CATALOG_PERIOD}`);
  const counts = raw['countsByPeriod'];
  if (!Array.isArray(counts) || counts.length !== maxPeriod) {
    fail('countsByPeriod', 'must hold one count per period');
  }
  const sha256 = raw['sha256'];
  if (typeof sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(sha256)) {
    fail('sha256', 'must be 64 lowercase hexadecimal digits');
  }
  const method = raw['method'];
  if (typeof method !== 'string' || method === '') fail('method', 'must be a non-empty string');
  return {
    format: CORE_FORMAT,
    formatVersion: CORE_FORMAT_VERSION,
    maxPeriod,
    count: positiveInteger(raw['count'], 'count'),
    countsByPeriod: (counts as unknown[]).map((count, index) =>
      positiveInteger(count, `countsByPeriod[${index}]`),
    ),
    recordBytes: positiveInteger(raw['recordBytes'], 'recordBytes'),
    byteLength: positiveInteger(raw['byteLength'], 'byteLength'),
    sha256: sha256 as string,
    method: method as string,
  };
};

/** The lowercase hexadecimal SHA-256 of the bytes (Web Crypto, in browsers and Node). */
export const sha256Hex = async (bytes: ArrayBuffer): Promise<string> => {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
};

/** A stored float32 residual, back to the three significant digits the generator wrote. */
const residualValue = (value: number, index: number): number => {
  if (!Number.isFinite(value) || value < 0) {
    fail(`record ${index}`, 'residuals must be finite and non-negative');
  }
  return value === 0 ? 0 : Number(value.toPrecision(3));
};

const checkHeader = (view: DataView, manifest: CoreManifest): void => {
  if (view.byteLength < CORE_HEADER_BYTES) fail('header', 'the file is shorter than its header');
  const magic = String.fromCharCode(...new Uint8Array(view.buffer, view.byteOffset, 6));
  if (magic !== MAGIC) fail('header', `must start with ${MAGIC}`);
  if (view.getUint16(6, true) !== CORE_FORMAT_VERSION) fail('header', 'unknown format version');
  if (view.getUint16(8, true) !== manifest.maxPeriod) fail('header', 'maximum period differs');
  if (
    view.getUint16(10, true) !== CORE_RECORD_BYTES ||
    manifest.recordBytes !== CORE_RECORD_BYTES
  ) {
    fail('header', `records must be ${CORE_RECORD_BYTES} bytes`);
  }
  const count = view.getUint32(12, true);
  if (
    count !== manifest.count ||
    view.byteLength !== CORE_HEADER_BYTES + count * CORE_RECORD_BYTES
  ) {
    fail('header', 'record count disagrees with the length or the manifest');
  }
};

const checkRays = (period: number, lower: number, upper: number, index: number): void => {
  if (period === 1) {
    if (lower !== 0 || upper !== 1)
      fail(`record ${index}`, 'the main cardioid has rays 0/1 and 1/1');
    return;
  }
  if (!(lower > 0 && lower < upper && upper < rayModulus(period))) {
    fail(`record ${index}`, 'rays must satisfy 0 < lower < upper < 2^p − 1');
  }
  if (!hasExactRayPeriod(lower, period) || !hasExactRayPeriod(upper, period)) {
    fail(`record ${index}`, 'both rays must have exact period p');
  }
  if (kneadingSequence(lower, period) !== kneadingSequence(upper, period)) {
    fail(`record ${index}`, 'both rays must have one kneading sequence');
  }
};

/**
 * A generated entry of period 2 to 12. Its internal and angled internal
 * addresses are computed the first time they are read (the inspector reads
 * them for the selected entry), which keeps decoding 4,016 records cheap.
 */
class CoreComponent implements CatalogComponent {
  readonly id: string;
  readonly aliases: readonly string[] = [];
  readonly label: string;
  readonly center: Complex;
  readonly centerPrecisionDigits: number;
  readonly period: number;
  readonly characteristicRays: readonly [RationalAngle, RationalAngle];
  readonly residual: CatalogResidual;
  readonly method: string;
  readonly provenance = GENERATED_PROVENANCE;
  #internalAddress: readonly number[] | undefined;
  #angledInternalAddress: readonly AngledAddressStep[] | undefined;

  constructor(
    period: number,
    rays: readonly [number, number],
    center: Complex,
    digits: number,
    residual: CatalogResidual,
    method: string,
  ) {
    const modulus = rayModulus(period);
    this.id = catalogIdFor(period, rays[0], rays[1]);
    this.label = generatedLabel(period, rays[0], rays[1]);
    this.center = center;
    this.centerPrecisionDigits = digits;
    this.period = period;
    this.characteristicRays = [
      { numerator: rays[0], denominator: modulus },
      { numerator: rays[1], denominator: modulus },
    ];
    this.residual = residual;
    this.method = method;
  }

  get internalAddress(): readonly number[] {
    this.#internalAddress ??= internalAddressOf(this.characteristicRays[0].numerator, this.period);
    return this.#internalAddress;
  }

  get angledInternalAddress(): readonly AngledAddressStep[] {
    this.#angledInternalAddress ??= angledInternalAddressOf(
      this.characteristicRays[0].numerator,
      this.period,
    );
    return this.#angledInternalAddress;
  }
}

const decodeRecord = (view: DataView, index: number, manifest: CoreManifest): CatalogComponent => {
  const offset = CORE_HEADER_BYTES + index * CORE_RECORD_BYTES;
  const period = view.getUint8(offset);
  if (period < 1 || period > manifest.maxPeriod) fail(`record ${index}`, 'period out of range');
  const lower = view.getUint16(offset + 1, true);
  const upper = view.getUint16(offset + 3, true);
  checkRays(period, lower, upper, index);
  // + 0 turns a stored -0 into 0, as the JSON catalog writes it.
  const center = {
    re: view.getFloat64(offset + 5, true) + 0,
    im: view.getFloat64(offset + 13, true) + 0,
  };
  if (!Number.isFinite(center.re) || !Number.isFinite(center.im)) {
    fail(`record ${index}`, 'centre must be finite');
  }
  const digits = view.getUint8(offset + 21);
  if (digits < 1 || digits > 17)
    fail(`record ${index}`, 'centerPrecisionDigits must be in [1, 17]');
  const orbitAbs = residualValue(view.getFloat32(offset + 22, true), index);
  const centerError = residualValue(view.getFloat32(offset + 26, true), index);
  const divisor = residualValue(view.getFloat32(offset + 30, true), index);
  if (period === 1) {
    return {
      id: catalogIdFor(1, 0, 1),
      aliases: [],
      label: 'Main cardioid',
      center,
      centerPrecisionDigits: digits,
      period,
      internalAddress: [1],
      residual: { orbitAbs, centerError },
      method: manifest.method,
      provenance: GENERATED_PROVENANCE,
    };
  }
  return new CoreComponent(
    period,
    [lower, upper],
    center,
    digits,
    { orbitAbs, centerError, properDivisorOrbitMinAbs: divisor },
    manifest.method,
  );
};

/**
 * Decodes and validates the core against its manifest; throws CatalogSchemaError.
 * Records must be in catalog order (by period, then lower ray), each once,
 * with the manifest's count per period. The SHA-256 is checked separately
 * (sha256Hex), because Web Crypto is asynchronous.
 */
export const decodeCatalogCore = (
  bytes: ArrayBuffer,
  manifest: CoreManifest,
): CatalogComponent[] => {
  if (bytes.byteLength !== manifest.byteLength) fail('length', 'differs from the manifest');
  const view = new DataView(bytes);
  checkHeader(view, manifest);
  const components: CatalogComponent[] = [];
  const counts = new Array<number>(manifest.maxPeriod).fill(0);
  let previous = { period: 0, lower: -1 };
  for (let index = 0; index < manifest.count; index += 1) {
    const component = decodeRecord(view, index, manifest);
    const lower = component.characteristicRays?.[0].numerator ?? 0;
    if (
      component.period < previous.period ||
      (component.period === previous.period && lower <= previous.lower)
    ) {
      fail(`record ${index}`, 'records must be in catalog order, each once');
    }
    previous = { period: component.period, lower };
    counts[component.period - 1] = (counts[component.period - 1] ?? 0) + 1;
    components.push(component);
  }
  if (counts.some((count, index) => count !== manifest.countsByPeriod[index])) {
    fail('counts', 'per period differ from the manifest');
  }
  return components;
};

/**
 * The full catalog: the core in catalog order, with each curated entry
 * (label, aliases, annotation, provenance) in place of its generated record.
 * Every curated entry must be in the core with exactly the same centre.
 */
export const mergeCatalog = (
  curated: readonly CatalogComponent[],
  core: readonly CatalogComponent[],
): CatalogComponent[] => {
  const byId = new Map(curated.map((component) => [component.id, component] as const));
  const merged = core.map((entry) => {
    const named = byId.get(entry.id);
    if (named === undefined) return entry;
    if (
      !Object.is(named.center.re, entry.center.re) ||
      !Object.is(named.center.im, entry.center.im)
    ) {
      fail(entry.id, 'the curated centre differs from the core');
    }
    byId.delete(entry.id);
    return named;
  });
  if (byId.size > 0)
    fail('merge', `curated entries missing from the core: ${[...byId.keys()].join(', ')}`);
  return merged;
};

/** A canonical id with no leading zeros: `mi-p<p>-<a>-<b>`. */
const CANONICAL_ID = /^mi-p([1-9]\d?)-([1-9]\d*)-([1-9]\d*)$/;

/**
 * True for a well-formed id of a period the curated file does not cover but
 * the core does (5 to 12): two rays of exact period p, in order, with one
 * kneading sequence. A share link may name one before the core has loaded;
 * the application confirms it once the core arrives (ADR 0014).
 */
export const isCoreCandidateId = (text: string, curatedMaxPeriod: number): boolean => {
  const match = CANONICAL_ID.exec(text);
  if (match === null) return false;
  const [period, lower, upper] = match.slice(1).map(Number) as [number, number, number];
  return (
    period > curatedMaxPeriod &&
    period <= MAX_CATALOG_PERIOD &&
    lower < upper &&
    upper < rayModulus(period) &&
    hasExactRayPeriod(lower, period) &&
    hasExactRayPeriod(upper, period) &&
    kneadingSequence(lower, period) === kneadingSequence(upper, period)
  );
};
