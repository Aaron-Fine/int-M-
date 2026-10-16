/**
 * Arm order for one repetition. Repetition 0 is the cold run and keeps the
 * declared order; warm repetitions rotate on the warm index, so over a warm
 * count that is a multiple of arms.length every arm leads equally often.
 * A first-in-context penalty is real (it moved plain/hook by about 3%), so an
 * unbalanced count biases paired ratios.
 */
export const armOrder = (arms: readonly string[], repetition: number): string[] => {
  const shift = repetition === 0 ? 0 : (repetition - 1) % arms.length;
  return [...arms.slice(shift), ...arms.slice(0, shift)];
};

/** Smallest warm count that is a multiple of the arm count and at least 21. */
export const releaseWarmCount = (armCount: number): number => Math.ceil(21 / armCount) * armCount;

/** Default release repetitions: one cold plus the balanced warm count. */
export const releaseDefaultReps = (armCount: number): number => 1 + releaseWarmCount(armCount);

/** Why a release run must not use this repetition count, or undefined. */
export const releaseRepsProblem = (reps: number, armCount: number): string | undefined => {
  const warm = reps - 1;
  if (warm < 21) return `--release requires at least 21 warm repetitions (--reps >= 22)`;
  if (warm % armCount !== 0) {
    const next = 1 + warm + (armCount - (warm % armCount));
    const fallback = releaseDefaultReps(armCount);
    const options = next === fallback ? `${next}` : `${fallback} or ${next}`;
    return `--release needs a warm count that is a multiple of the ${armCount} arms so arm order balances; use --reps ${options}`;
  }
  return undefined;
};
