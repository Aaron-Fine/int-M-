/**
 * Tolerance policy application. status, period and every classification field
 * are exact by construction: this module only ever sees FLOAT fields.
 */
import type { FieldTolerancePolicy, FloatTolerance, ParityPolicy } from '../candidates/types';

export type FloatFieldName =
  'smoothIteration' | 'multiplierMagnitude' | 'multiplierAngle' | 'multiplierDirection';

/** Judge ceilings: declared tolerances beyond these are rejected outright. */
export interface ToleranceCeilings {
  readonly smoothIteration: FloatTolerance | undefined;
  readonly multiplierMagnitude: FloatTolerance;
  readonly multiplierAngle: FloatTolerance;
  readonly multiplierDirectionAbsolute: number;
  readonly rgbaMaxChannelDelta: number;
}

export const TOLERANCE_CEILINGS: Readonly<Record<ParityPolicy, ToleranceCeilings>> = {
  'bit-identical': {
    smoothIteration: { absolute: 1e-9, relative: 1e-9 },
    multiplierMagnitude: { absolute: 1e-6, relative: 1e-9 },
    multiplierAngle: { absolute: 1e-6 },
    multiplierDirectionAbsolute: 1e-6,
    rgbaMaxChannelDelta: 2,
  },
  // Escapes are bit-identical under semantic revision: no smooth tolerance.
  'semantic-revision': {
    smoothIteration: undefined,
    multiplierMagnitude: { absolute: 1e-3, relative: 1e-3 },
    multiplierAngle: { absolute: 1e-3 },
    multiplierDirectionAbsolute: 1e-3,
    rgbaMaxChannelDelta: 2,
  },
};

const floatProblems = (
  field: string,
  declared: FloatTolerance | undefined,
  ceiling: FloatTolerance | undefined,
  hasCeiling: boolean,
): string[] => {
  if (declared === undefined) return [];
  if (!hasCeiling) return [`${field}: no tolerance is permitted under this parity policy`];
  const problems: string[] = [];
  for (const key of ['absolute', 'relative'] as const) {
    const value = declared[key];
    if (value === undefined) continue;
    const limit = ceiling?.[key] ?? 0;
    if (!Number.isFinite(value) || value < 0) problems.push(`${field}.${key} must be finite >= 0`);
    else if (value > limit)
      problems.push(`${field}.${key}=${value} exceeds judge ceiling ${limit}`);
  }
  return problems;
};

/** Returns human-readable problems; a non-empty list makes the candidate FAIL. */
export const validateTolerance = (
  policy: ParityPolicy,
  tolerance: FieldTolerancePolicy | undefined,
): string[] => {
  if (tolerance === undefined) return [];
  const ceilings = TOLERANCE_CEILINGS[policy];
  const problems = [
    ...floatProblems(
      'smoothIteration',
      tolerance.smoothIteration,
      ceilings.smoothIteration,
      ceilings.smoothIteration !== undefined,
    ),
    ...floatProblems(
      'multiplierMagnitude',
      tolerance.multiplierMagnitude,
      ceilings.multiplierMagnitude,
      true,
    ),
    ...floatProblems('multiplierAngle', tolerance.multiplierAngle, ceilings.multiplierAngle, true),
  ];
  const direction = tolerance.multiplierDirection;
  if (direction !== undefined) {
    if (!Number.isFinite(direction.absolute) || direction.absolute < 0) {
      problems.push('multiplierDirection.absolute must be finite >= 0');
    } else if (direction.absolute > ceilings.multiplierDirectionAbsolute) {
      problems.push(
        `multiplierDirection.absolute=${direction.absolute} exceeds judge ceiling ${ceilings.multiplierDirectionAbsolute}`,
      );
    }
  }
  const delta = tolerance.rgbaMaxChannelDelta;
  if (delta !== undefined && (!Number.isInteger(delta) || delta < 0)) {
    problems.push('rgbaMaxChannelDelta must be a non-negative integer');
  } else if (delta !== undefined && delta > ceilings.rgbaMaxChannelDelta) {
    problems.push(
      `rgbaMaxChannelDelta=${delta} exceeds judge ceiling ${ceilings.rgbaMaxChannelDelta}`,
    );
  }
  return problems;
};

export type FloatVerdict = 'identical' | 'within-tolerance' | 'violation';

export interface FloatComparison {
  readonly verdict: FloatVerdict;
  readonly absolute: number;
  readonly relative: number;
}

/** Bit-level equality for doubles (distinguishes +0/-0, treats NaN == NaN). */
export const sameDouble = (a: number, b: number): boolean => Object.is(a, b);

/**
 * Compare one float against its baseline value under an (optional) declared
 * tolerance: allowed = absolute + relative * |baseline|.
 */
export const compareFloat = (
  baseline: number,
  candidate: number,
  tolerance: FloatTolerance | undefined,
): FloatComparison => {
  if (sameDouble(baseline, candidate)) return { verdict: 'identical', absolute: 0, relative: 0 };
  const absolute = Math.abs(baseline - candidate);
  const relative = baseline === 0 ? Number.POSITIVE_INFINITY : absolute / Math.abs(baseline);
  if (!Number.isFinite(absolute)) return { verdict: 'violation', absolute, relative };
  const allowed = (tolerance?.absolute ?? 0) + (tolerance?.relative ?? 0) * Math.abs(baseline);
  // +0 versus -0 has zero deviation but is not bit-identical: only a declared
  // (nonzero) allowance may absorb it.
  const accepted = absolute <= allowed && allowed > 0;
  return { verdict: accepted ? 'within-tolerance' : 'violation', absolute, relative };
};

/** Largest component deviation between the unit directions of two angles. */
export const directionDeviation = (baselineAngle: number, candidateAngle: number): number =>
  Math.max(
    Math.abs(Math.cos(baselineAngle) - Math.cos(candidateAngle)),
    Math.abs(Math.sin(baselineAngle) - Math.sin(candidateAngle)),
  );
