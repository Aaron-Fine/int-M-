import { productionCandidate } from './support';
import type { Candidate } from './types';

/**
 * The reference arm: the current production serial CPU renderer with default
 * options (legacy-scan classifier, no experiment flags). Every candidate is
 * judged against this and timed against this.
 */
export const baseline: Candidate = productionCandidate({
  id: 'baseline',
  description: 'Production CpuRenderer, default options (classifierMode legacy-scan).',
});
