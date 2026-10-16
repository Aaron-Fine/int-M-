/**
 * Arm order for one repetition: a rotation, so over arms.length repetitions
 * every arm takes every position. Headed browsers pay window start-up on the
 * first navigation of a fresh context; a fixed order would bias the first arm.
 */
export const armOrder = (arms: readonly string[], repetition: number): string[] => {
  const shift = repetition % arms.length;
  return [...arms.slice(shift), ...arms.slice(0, shift)];
};
