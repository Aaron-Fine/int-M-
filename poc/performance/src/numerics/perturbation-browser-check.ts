// Browser-run check for the Phase 3 perturbation pilots. The comparisons are
// the ones in perturbation-tile.test.ts and perturbation-verifier.test.ts
// (the Node unit tests), restated here so the same numerics and the same
// fixture checks can run inside a browser page. Research only: nothing in the
// application imports this module.
import { auditPerturbationTile, type PixelAudit, type TileSpec } from './perturbation-tile';
import { classifyPerturbationInteriorTile, type InteriorTileSpec } from './perturbation-verifier';

interface OracleBox {
  readonly reLo: string;
  readonly reHi: string;
  readonly imLo: string;
  readonly imHi: string;
}

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

const backendSpec = (tile: OracleTile): TileSpec => ({
  reference: { re: Number(tile.reference.re), im: Number(tile.reference.im) },
  stepExponent: tile.stepExponent,
  width: tile.width,
  height: tile.height,
  maxIterations: tile.maxIterations,
});

const interiorSpec = (tile: OracleTile): InteriorTileSpec => ({
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

/** Mirrors 'agrees with the independent interval oracle' and the delta-budget test. */
export function checkBackendTile(oracle: OracleTile): TileReport {
  const failures: string[] = [];
  const result = auditPerturbationTile(backendSpec(oracle));
  if (result.status !== 'audited') {
    return { id: oracle.id, pixels: 0, failures: [`refused: ${result.reason}`], compared: 0 };
  }
  const { pixels } = result;
  if (pixels.length !== oracle.width * oracle.height) failures.push('pixel count');
  const exportBits = oracle.exportBits ?? 0;
  const centre = (oracle.height / 2) * oracle.width + oracle.width / 2;
  let compared = 0;
  pixels.forEach((pixel, index) => {
    const expected = oracle.pixels[index];
    if (expected === undefined) {
      failures.push(`pixel ${index}: no oracle entry`);
      return;
    }
    if (pixel.status === 'unresolved') {
      // Only the c = i reference pixel itself may stay unresolved.
      const allowed =
        oracle.reference.im === '1' && index === centre && pixel.reason === 'reference-exhausted';
      if (!allowed) failures.push(`pixel ${index}: unresolved (${pixel.reason})`);
      return;
    }
    if (expected.status === 'unresolved' || expected.box === undefined) return;
    if (pixel.status !== expected.status || pixel.iteration !== expected.iteration) {
      failures.push(
        `pixel ${index}: ${pixel.status}@${pixel.iteration} vs ${expected.status}@${expected.iteration}`,
      );
      return;
    }
    if (!diskMeetsBox(pixel, expected.box, exportBits)) {
      failures.push(`pixel ${index}: audited disk misses oracle box`);
      return;
    }
    compared += 1;
    // Delta certified to better than one part in 2^24: b^2 * 2^48 <= |d|^2.
    const { deltaRe, deltaIm, deltaBudget } = pixel.state;
    const deltaSquared = deltaRe * deltaRe + deltaIm * deltaIm;
    if (deltaSquared !== 0n) {
      const e = Math.min(deltaBudget.e, -1074);
      const budget = at(deltaBudget.e, deltaBudget.m, e);
      if ((budget * budget) << 48n > at(-2148, deltaSquared, 2 * e)) {
        failures.push(`pixel ${index}: delta budget exceeds 2^-24`);
      }
    }
  });
  return { id: oracle.id, pixels: pixels.length, failures, compared };
}

/** Mirrors 'matches the independent interval V0 oracle on every certified frame'. */
export function checkInteriorTile(oracle: OracleTile): TileReport {
  const failures: string[] = [];
  const result = classifyPerturbationInteriorTile(interiorSpec(oracle));
  if (result.status !== 'audited') {
    return { id: oracle.id, pixels: 0, failures: [`refused: ${result.reason}`], compared: 0 };
  }
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
  if (uncertified !== 0) failures.push(`${uncertified} uncertified frames`);
  return { id: oracle.id, pixels: result.pixels.length, failures, compared };
}
