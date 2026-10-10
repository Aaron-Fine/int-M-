/**
 * Parity comparison of one candidate frame against the baseline frame.
 *
 * Pure: takes decoded fields and RGBA buffers, returns a structured result.
 * Policies:
 *  - 'bit-identical' (default): every field equal, except float fields within
 *    a declared tolerance. status and period are always exact.
 *  - 'semantic-revision': see compareSemanticRevision rules below.
 */
import type {
  FieldTolerancePolicy,
  FloatTolerance,
  ParityPolicy,
  SemanticFields,
  SemanticView,
} from '../candidates/types';
import { compareFloat, directionDeviation, sameDouble, validateTolerance } from './tolerance';
import { percentile } from './stats';

export const MISMATCH_LIMIT = 10;
export const CONVERSION_LIMIT = 20;
export const SEMANTIC_VIEWS: readonly SemanticView[] = ['stability', 'multiplier', 'period'];

export type RgbaViews = Partial<Record<SemanticView, Uint8ClampedArray>>;

export interface Mismatch {
  readonly caseId: string;
  readonly raster: string;
  readonly pixel: number;
  readonly x: number;
  readonly y: number;
  readonly field: string;
  readonly baseline: number | string;
  readonly candidate: number | string;
}

export interface FieldStat {
  compared: number;
  identical: number;
  withinTolerance: number;
  violations: number;
  maxAbs: number;
  maxRel: number;
}

export interface Conversion {
  readonly caseId: string;
  readonly raster: string;
  readonly pixel: number;
  readonly x: number;
  readonly y: number;
  readonly c: { readonly re: number; readonly im: number };
  readonly period: number;
  readonly multiplierMagnitude: number;
  readonly multiplierAngle: number;
  readonly certificate: unknown;
}

export interface DistributionSummary {
  readonly compared: number;
  readonly differing: number;
  readonly min: number;
  readonly p50: number;
  readonly p90: number;
  readonly max: number;
  readonly mean: number;
}

export interface CompareInput {
  readonly caseId: string;
  readonly raster: string;
  readonly width: number;
  readonly height: number;
  readonly policy: ParityPolicy;
  readonly tolerance: FieldTolerancePolicy | undefined;
  readonly base: SemanticFields;
  readonly cand: SemanticFields;
  readonly baseRgba: RgbaViews;
  readonly candRgba: RgbaViews;
  readonly pixelToComplex: (x: number, y: number) => { re: number; im: number };
  readonly certificates: ReadonlyMap<number, unknown> | undefined;
  readonly mismatchLimit?: number;
}

export interface CompareResult {
  readonly caseId: string;
  readonly raster: string;
  readonly pixels: number;
  readonly policy: ParityPolicy;
  readonly violationCount: number;
  readonly mismatches: readonly Mismatch[];
  readonly fieldStats: Readonly<Record<string, FieldStat>>;
  /** Pixels whose stored semantic fields differ at all (violations or tolerated). */
  readonly changedPixels: number;
  readonly conversionCount: number;
  readonly conversions: readonly Conversion[];
  /** Diagnostics only (never fail the gate): iterations/evidence differences. */
  readonly iterationDeltas: Readonly<Record<string, DistributionSummary>> | undefined;
  readonly evidenceChanges: Readonly<Record<string, number>> | undefined;
}

class Recorder {
  readonly mismatches: Mismatch[] = [];
  violationCount = 0;
  readonly stats = new Map<string, FieldStat>();

  public constructor(
    private readonly input: CompareInput,
    private readonly limit: number,
  ) {}

  public stat(field: string): FieldStat {
    let stat = this.stats.get(field);
    if (stat === undefined) {
      stat = {
        compared: 0,
        identical: 0,
        withinTolerance: 0,
        violations: 0,
        maxAbs: 0,
        maxRel: 0,
      };
      this.stats.set(field, stat);
    }
    return stat;
  }

  public violation(
    pixel: number,
    field: string,
    baseline: number | string,
    candidate: number | string,
  ): void {
    this.violationCount += 1;
    this.stat(field).violations += 1;
    if (this.mismatches.length >= this.limit) return;
    this.mismatches.push({
      caseId: this.input.caseId,
      raster: this.input.raster,
      pixel,
      x: pixel % this.input.width,
      y: Math.floor(pixel / this.input.width),
      field,
      baseline,
      candidate,
    });
  }
}

/** Per-pixel checker shared by both policies. */
class PixelChecker {
  readonly changed: Uint8Array;
  private readonly directionTol: FieldTolerancePolicy['multiplierDirection'];

  public constructor(
    private readonly input: CompareInput,
    private readonly rec: Recorder,
  ) {
    this.changed = new Uint8Array(input.width * input.height);
    this.directionTol = input.tolerance?.multiplierDirection;
  }

  /** Exact integer/classification field. Returns true when it differs. */
  public exact(field: string, i: number, base: number, cand: number): boolean {
    const stat = this.rec.stat(field);
    stat.compared += 1;
    if (base === cand) {
      stat.identical += 1;
      return false;
    }
    this.changed[i] = 1;
    this.rec.violation(i, field, base, cand);
    return true;
  }

  /** Float field under an optional declared tolerance. Returns true on violation. */
  public float(
    field: string,
    i: number,
    base: number,
    cand: number,
    tolerance: FloatTolerance | undefined,
  ): boolean {
    const stat = this.rec.stat(field);
    stat.compared += 1;
    const result = compareFloat(base, cand, tolerance);
    if (result.verdict === 'identical') {
      stat.identical += 1;
      return false;
    }
    this.changed[i] = 1;
    if (Number.isFinite(result.absolute)) {
      stat.maxAbs = Math.max(stat.maxAbs, result.absolute);
      if (Number.isFinite(result.relative)) stat.maxRel = Math.max(stat.maxRel, result.relative);
    } else {
      stat.maxAbs = Number.POSITIVE_INFINITY;
    }
    if (result.verdict === 'within-tolerance') {
      stat.withinTolerance += 1;
      return false;
    }
    this.rec.violation(i, field, base, cand);
    return true;
  }

  private direction(i: number, baseAngle: number, candAngle: number): void {
    const tol = this.directionTol;
    if (tol === undefined) return;
    if (Math.abs(this.input.base.multiplierMagnitude[i] ?? 0) < (tol.minBaselineMagnitude ?? 0)) {
      return;
    }
    const stat = this.rec.stat('multiplierDirection');
    stat.compared += 1;
    const deviation = directionDeviation(baseAngle, candAngle);
    if (sameDouble(baseAngle, candAngle) || deviation === 0) {
      stat.identical += 1;
      return;
    }
    this.changed[i] = 1;
    stat.maxAbs = Math.max(stat.maxAbs, deviation);
    if (deviation <= tol.absolute) {
      stat.withinTolerance += 1;
      return;
    }
    this.rec.violation(i, 'multiplierDirection', baseAngle, candAngle);
  }

  /** multiplierAngle: raw tolerance, direction tolerance, or exact (see types.ts). */
  public angle(i: number): void {
    const { base, cand, tolerance } = this.input;
    const baseAngle = base.multiplierAngle[i] ?? 0;
    const candAngle = cand.multiplierAngle[i] ?? 0;
    const skipRaw = this.directionTol !== undefined && tolerance?.multiplierAngle === undefined;
    if (!skipRaw)
      this.float('multiplierAngle', i, baseAngle, candAngle, tolerance?.multiplierAngle);
    this.direction(i, baseAngle, candAngle);
  }

  /** The three float channels with the candidate's declared tolerances. */
  public floats(i: number): void {
    const { base, cand, tolerance } = this.input;
    this.float(
      'smoothIteration',
      i,
      base.smoothIteration[i] ?? 0,
      cand.smoothIteration[i] ?? 0,
      tolerance?.smoothIteration,
    );
    this.float(
      'multiplierMagnitude',
      i,
      base.multiplierMagnitude[i] ?? 0,
      cand.multiplierMagnitude[i] ?? 0,
      tolerance?.multiplierMagnitude,
    );
    this.angle(i);
  }

  /** Every semantic field bit-identical (no tolerance). */
  public allExact(i: number): void {
    const { base, cand } = this.input;
    if (this.exact('status', i, base.status[i] ?? 0, cand.status[i] ?? 0)) return;
    this.exact('period', i, base.period[i] ?? 0, cand.period[i] ?? 0);
    const pairs = [
      ['smoothIteration', base.smoothIteration, cand.smoothIteration],
      ['multiplierMagnitude', base.multiplierMagnitude, cand.multiplierMagnitude],
      ['multiplierAngle', base.multiplierAngle, cand.multiplierAngle],
    ] as const;
    for (const [field, left, right] of pairs) {
      this.float(field, i, left[i] ?? 0, right[i] ?? 0, undefined);
    }
  }
}

const bitIdenticalPixel = (checker: PixelChecker, input: CompareInput, i: number): void => {
  const statusDiffers = checker.exact(
    'status',
    i,
    input.base.status[i] ?? 0,
    input.cand.status[i] ?? 0,
  );
  if (statusDiffers) return;
  checker.exact('period', i, input.base.period[i] ?? 0, input.cand.period[i] ?? 0);
  checker.floats(i);
};

const normalizeLambda = (magnitude: number): boolean => Number.isFinite(magnitude) && magnitude < 1;

/** Baseline unresolved, candidate accepted: record the conversion (rule 3). */
const recordConversion = (
  checker: PixelChecker,
  rec: Recorder,
  input: CompareInput,
  i: number,
  conversions: Conversion[],
): void => {
  const { cand, width } = input;
  const period = cand.period[i] ?? 0;
  const magnitude = cand.multiplierMagnitude[i] ?? 0;
  const angle = cand.multiplierAngle[i] ?? 0;
  checker.changed[i] = 1;
  const stat = rec.stat('conversion');
  stat.compared += 1;
  if (period < 1) rec.violation(i, 'conversion.period', 0, period);
  if (!normalizeLambda(magnitude))
    rec.violation(i, 'conversion.multiplierMagnitude', 'in [0,1)', magnitude);
  if ((cand.smoothIteration[i] ?? 0) !== 0) {
    rec.violation(i, 'conversion.smoothIteration', 0, cand.smoothIteration[i] ?? 0);
  }
  const certificate = input.certificates?.get(i);
  if (certificate === undefined) {
    rec.violation(i, 'conversion.certificate', 'required', 'missing');
  } else {
    stat.identical += 1;
  }
  if (conversions.length < CONVERSION_LIMIT) {
    const x = i % width;
    const y = Math.floor(i / width);
    conversions.push({
      caseId: input.caseId,
      raster: input.raster,
      pixel: i,
      x,
      y,
      c: input.pixelToComplex(x, y),
      period,
      multiplierMagnitude: magnitude,
      multiplierAngle: angle,
      certificate,
    });
  }
};

/**
 * 'semantic-revision' rules, per baseline status:
 *  1. attracting: candidate must accept with identical status and period; |lambda|
 *     and direction only within the declared tolerance; other fields exact.
 *  2. escaped: bit-identical on every field.
 *  3. unresolved: stay unresolved (exact), or convert to acceptance (counted,
 *     listed, certificate required). Never an escape.
 *  4. anything else FAILS.
 */
const semanticRevisionPixel = (
  checker: PixelChecker,
  rec: Recorder,
  input: CompareInput,
  i: number,
  conversions: Conversion[],
): number => {
  const baseStatus = input.base.status[i] ?? 0;
  const candStatus = input.cand.status[i] ?? 0;
  if (baseStatus === 1) {
    checker.allExact(i);
    return 0;
  }
  if (baseStatus === 2) {
    if (checker.exact('status', i, baseStatus, candStatus)) return 0;
    checker.exact('period', i, input.base.period[i] ?? 0, input.cand.period[i] ?? 0);
    checker.float(
      'smoothIteration',
      i,
      input.base.smoothIteration[i] ?? 0,
      input.cand.smoothIteration[i] ?? 0,
      undefined,
    );
    checker.float(
      'multiplierMagnitude',
      i,
      input.base.multiplierMagnitude[i] ?? 0,
      input.cand.multiplierMagnitude[i] ?? 0,
      input.tolerance?.multiplierMagnitude,
    );
    checker.angle(i);
    return 0;
  }
  if (candStatus === 2) {
    recordConversion(checker, rec, input, i, conversions);
    return 1;
  }
  checker.allExact(i);
  return 0;
};

const worstChannelDelta = (base: Uint8ClampedArray, cand: Uint8ClampedArray, i: number): number => {
  let worst = 0;
  for (let k = 0; k < 4; k += 1) {
    worst = Math.max(worst, Math.abs((base[i * 4 + k] ?? 0) - (cand[i * 4 + k] ?? 0)));
  }
  return worst;
};

const compareRgbaView = (
  view: SemanticView,
  input: CompareInput,
  rec: Recorder,
  skip: Uint8Array | undefined,
  allowedDelta: number,
): void => {
  const base = input.baseRgba[view];
  const cand = input.candRgba[view];
  const field = `rgba:${view}`;
  if (base?.length !== cand?.length || base === undefined || cand === undefined) {
    rec.violation(0, field, base?.length ?? 'absent', cand?.length ?? 'absent');
    return;
  }
  const stat = rec.stat(field);
  const pixels = base.length / 4;
  for (let i = 0; i < pixels; i += 1) {
    if (skip?.[i] === 1) continue;
    stat.compared += 1;
    const worst = worstChannelDelta(base, cand, i);
    if (worst === 0) stat.identical += 1;
    else if (worst <= allowedDelta) stat.withinTolerance += 1;
    stat.maxAbs = Math.max(stat.maxAbs, worst);
    if (worst > allowedDelta) {
      const b = Array.from(base.subarray(i * 4, i * 4 + 4)).join(',');
      const c = Array.from(cand.subarray(i * 4, i * 4 + 4)).join(',');
      rec.violation(i, field, b, c);
    }
  }
};

const summarizeDeltas = (deltas: readonly number[], compared: number): DistributionSummary => {
  if (deltas.length === 0) {
    return { compared, differing: 0, min: 0, p50: 0, p90: 0, max: 0, mean: 0 };
  }
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let sum = 0;
  for (const delta of deltas) {
    min = Math.min(min, delta);
    max = Math.max(max, delta);
    sum += delta;
  }
  return {
    compared,
    differing: deltas.length,
    min,
    p50: percentile(deltas, 50),
    p90: percentile(deltas, 90),
    max,
    mean: sum / deltas.length,
  };
};

const STATUS_NAMES = ['unresolved', 'escaped', 'attracting'] as const;

/** Distribution of (candidate - baseline) iteration counts and evidence changes. */
export const diagnosticDifferences = (
  base: SemanticFields,
  cand: SemanticFields,
): Pick<CompareResult, 'iterationDeltas' | 'evidenceChanges'> => {
  if (base.iterations === undefined || cand.iterations === undefined) {
    return { iterationDeltas: undefined, evidenceChanges: undefined };
  }
  const deltas: number[][] = [[], [], []];
  const compared = [0, 0, 0];
  const changes = new Map<string, number>();
  for (let i = 0; i < base.iterations.length; i += 1) {
    const klass = base.status[i] ?? 0;
    compared[klass] = (compared[klass] ?? 0) + 1;
    const delta = (cand.iterations[i] ?? 0) - (base.iterations[i] ?? 0);
    if (delta !== 0) deltas[klass]?.push(delta);
    const be = base.evidence?.[i];
    const ce = cand.evidence?.[i];
    if (be !== undefined && ce !== undefined && be !== ce) {
      const key = `${be}->${ce}`;
      changes.set(key, (changes.get(key) ?? 0) + 1);
    }
  }
  const out: Record<string, DistributionSummary> = {};
  STATUS_NAMES.forEach((name, klass) => {
    out[name] = summarizeDeltas(deltas[klass] ?? [], compared[klass] ?? 0);
  });
  return { iterationDeltas: out, evidenceChanges: Object.fromEntries(changes) };
};

export const compareFrames = (input: CompareInput): CompareResult => {
  const pixels = input.width * input.height;
  const rec = new Recorder(input, input.mismatchLimit ?? MISMATCH_LIMIT);
  const checker = new PixelChecker(input, rec);
  const conversions: Conversion[] = [];
  let conversionCount = 0;
  for (const problem of validateTolerance(input.policy, input.tolerance)) {
    rec.violation(0, 'tolerance-declaration', 'within judge ceilings', problem);
  }
  for (let i = 0; i < pixels; i += 1) {
    if (input.policy === 'semantic-revision') {
      conversionCount += semanticRevisionPixel(checker, rec, input, i, conversions);
    } else {
      bitIdenticalPixel(checker, input, i);
    }
  }
  const allowedDelta = input.tolerance?.rgbaMaxChannelDelta ?? 0;
  // Under semantic revision only unchanged pixels must keep their colors.
  const skip = input.policy === 'semantic-revision' ? checker.changed : undefined;
  for (const view of SEMANTIC_VIEWS) compareRgbaView(view, input, rec, skip, allowedDelta);
  let changedPixels = 0;
  for (const flag of checker.changed) changedPixels += flag;
  return {
    caseId: input.caseId,
    raster: input.raster,
    pixels,
    policy: input.policy,
    violationCount: rec.violationCount,
    mismatches: rec.mismatches,
    fieldStats: Object.fromEntries(rec.stats),
    changedPixels,
    conversionCount,
    conversions,
    ...diagnosticDifferences(input.base, input.cand),
  };
};
