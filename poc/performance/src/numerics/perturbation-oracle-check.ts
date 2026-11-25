// Fixture comparisons for the Phase 3 perturbation pilots, shared by the Node
// unit tests (perturbation-tile.test.ts, perturbation-verifier.test.ts) and
// the browser runs (tests/e2e/perturbation-pilots.spec.ts), so both check the
// pilots against the committed interval-oracle fixtures in one way. Research
// only: nothing in the application imports this module.
import {
  auditPerturbationTile,
  type DeltaStep,
  type PixelAudit,
  type TileSpec,
} from './perturbation-tile';
import { classifyPerturbationInteriorTile, type InteriorTileSpec } from './perturbation-verifier';

interface OracleBox {
  readonly reLo: string;
  readonly reHi: string;
  readonly imLo: string;
  readonly imHi: string;
}

/** A tile of fixtures/perturbation-tiles.v1.json or fixtures/perturbation-interior.v1.json. */
export interface OracleTile {
  readonly id: string;
  readonly reference: { readonly re: string; readonly im: string; readonly exponent?: number };
  readonly stepExponent: number;
  readonly width: number;
  readonly height: number;
  readonly maxIterations: number;
  readonly maxPeriod?: number;
  readonly exportBits?: number;
  readonly pixels: readonly {
    readonly status: 'escaped' | 'bounded' | 'unresolved';
    readonly iteration: number;
    readonly box?: OracleBox;
    readonly codes?: string;
  }[];
}

export interface TileReport {
  readonly id: string;
  readonly pixels: number;
  readonly failures: readonly string[];
  /** Backend: pixels compared with the oracle. Interior: certified frame codes compared. */
  readonly compared: number;
}

const at = (exponent: number, value: bigint, target: number): bigint =>
  value << BigInt(exponent - target);

/** Exact: distance from the audited disk centre to the oracle box <= radius. */
function diskMeetsBox(pixel: PixelAudit, box: OracleBox, exportBits: number): boolean {
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

/** Exact: the delta is certified to better than one part in 2^24, b^2 * 2^48 <= |d|^2. */
function deltaWithinBudget(pixel: PixelAudit): boolean {
  if (pixel.state === null) return true;
  const { deltaRe, deltaIm, deltaBudget } = pixel.state;
  const deltaSquared = deltaRe * deltaRe + deltaIm * deltaIm; // units 2^-2148
  if (deltaSquared === 0n) return true; // the reference pixel itself
  const e = Math.min(deltaBudget.e, -1074);
  const budget = at(deltaBudget.e, deltaBudget.m, e);
  return (budget * budget) << 48n <= at(-2148, deltaSquared, 2 * e);
}

export const backendSpec = (tile: OracleTile): TileSpec => ({
  reference: { re: Number(tile.reference.re), im: Number(tile.reference.im) },
  stepExponent: tile.stepExponent,
  width: tile.width,
  height: tile.height,
  maxIterations: tile.maxIterations,
});

export const interiorSpec = (tile: OracleTile): InteriorTileSpec => ({
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
  maxPeriod: tile.maxPeriod ?? 0,
});

/** Pixels where both the backend and the oracle certify a verdict, and the verdicts differ. */
export function verdictDisagreements(
  pixels: readonly PixelAudit[],
  oracle: OracleTile,
): readonly string[] {
  return pixels.flatMap((pixel, index) => {
    const expected = oracle.pixels[index];
    if (expected === undefined || pixel.status === 'unresolved' || expected.status === 'unresolved')
      return [];
    return pixel.status === expected.status && pixel.iteration === expected.iteration
      ? []
      : [
          `pixel ${index}: ${pixel.status}@${pixel.iteration} vs ${expected.status}@${expected.iteration}`,
        ];
  });
}

/**
 * Backend pilot against the oracle: the same verdict and iteration on every
 * pixel, the audited disk meeting the oracle box, every delta within budget,
 * and only the c = i reference pixel itself unresolved (it never escapes; its
 * repelling cycle exhausts the reference grid). `step` replaces the delta
 * kernel, for soundness tests.
 */
export function checkBackendTile(oracle: OracleTile, step?: DeltaStep): TileReport {
  const result = auditPerturbationTile(backendSpec(oracle), step);
  if (result.status !== 'audited') {
    return { id: oracle.id, pixels: 0, failures: [`refused: ${result.reason}`], compared: 0 };
  }
  const { pixels } = result;
  const failures: string[] = [];
  if (pixels.length !== oracle.width * oracle.height) failures.push('pixel count');
  failures.push(...verdictDisagreements(pixels, oracle));
  const exportBits = oracle.exportBits ?? 0;
  const centre = (oracle.height / 2) * oracle.width + oracle.width / 2;
  let compared = 0;
  pixels.forEach((pixel, index) => {
    const expected = oracle.pixels[index];
    if (expected === undefined) {
      failures.push(`pixel ${index}: no oracle entry`);
      return;
    }
    if (!deltaWithinBudget(pixel)) failures.push(`pixel ${index}: delta budget exceeds 2^-24`);
    if (pixel.status === 'unresolved') {
      const allowed =
        oracle.reference.im === '1' && index === centre && pixel.reason === 'reference-exhausted';
      if (!allowed) failures.push(`pixel ${index}: unresolved (${pixel.reason})`);
      return;
    }
    if (expected.box === undefined || !diskMeetsBox(pixel, expected.box, exportBits)) {
      failures.push(`pixel ${index}: audited disk misses oracle box`);
      return;
    }
    compared += 1;
  });
  return { id: oracle.id, pixels: pixels.length, failures, compared };
}

/**
 * Interior verifier against the oracle: the same escape iteration, and the
 * same V0 code on every frame both certify, with no uncertified frame.
 */
export function checkInteriorTile(oracle: OracleTile): TileReport {
  const result = classifyPerturbationInteriorTile(interiorSpec(oracle));
  if (result.status !== 'audited') {
    return { id: oracle.id, pixels: 0, failures: [`refused: ${result.reason}`], compared: 0 };
  }
  const failures: string[] = [];
  let compared = 0;
  let uncertified = 0;
  result.pixels.forEach((pixel, index) => {
    const expected = oracle.pixels[index];
    if (expected === undefined) {
      failures.push(`pixel ${index}: no oracle entry`);
      return;
    }
    if (pixel.status === 'escaped') {
      if (expected.status !== 'escaped' || expected.iteration !== pixel.iteration) {
        failures.push(
          `pixel ${index}: escaped@${pixel.iteration} vs ${expected.status}@${expected.iteration}`,
        );
      }
      return;
    }
    if (pixel.codes === null || expected.codes === undefined) return;
    const oracleCodes = expected.codes.split(',');
    if (pixel.codes.length !== oracleCodes.length) {
      failures.push(`pixel ${index}: code count`);
      return;
    }
    pixel.codes.forEach((code, p) => {
      if (code === 'U') uncertified += 1;
      if (code === 'U' || oracleCodes[p] === 'U') return;
      compared += 1;
      if (code !== oracleCodes[p]) {
        failures.push(`pixel ${index} p=${p + 1}: ${code} vs ${oracleCodes[p]}`);
      }
    });
  });
  if (compared === 0) failures.push('no certified frame compared');
  // The enclosures are tight enough to certify every reached comparison.
  if (uncertified !== 0) failures.push(`${uncertified} uncertified frames`);
  return { id: oracle.id, pixels: result.pixels.length, failures, compared };
}
