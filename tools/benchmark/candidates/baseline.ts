import { productionCandidate } from './support';
import type { Candidate } from './types';

/**
 * The reference arm: the production serial CPU renderer with its default
 * options (the triggered-scan classifier and conjugate mirroring as shipped).
 * Every candidate is judged against this and timed against this.
 */
export const baseline: Candidate = productionCandidate({
  id: 'baseline',
  description: 'Production CpuRenderer with default options.',
});
