import { productionCandidate } from './support';
import type { Candidate } from './types';

/**
 * Two-pixel interleaved legacy-scan kernel (src/domain/orbit-interleaved.ts):
 * two orbits of the same row advance in one lockstep loop to overlap the
 * latency of the z -> z^2 + c chains. Per-pixel arithmetic is unchanged, so
 * the default 'bit-identical' parity policy applies with no tolerance.
 */
export const interleave2: Candidate = productionCandidate({
  id: 'interleave-2',
  description: 'Legacy-scan kernel classifying two same-row pixels per lockstep orbit loop.',
  requestOptions: { interleave: true },
});
