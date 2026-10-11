import { productionCandidate } from './support';
import type { Candidate } from './types';

/**
 * Prepared coordinates: the real coordinate is computed once per column and
 * the imaginary coordinate once per sampled row, using the canonical
 * pixel-center formula, instead of mapping every pixel through the viewport
 * transform. Same results bit for bit, so the default 'bit-identical' policy
 * applies.
 */
export const coordinatePrep: Candidate = productionCandidate({
  id: 'coordinate-prep',
  description:
    'Production renderer with preparedCoordinates: per-column real and per-row imaginary coordinates.',
  requestOptions: { preparedCoordinates: true },
});
