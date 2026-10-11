import { productionCandidate } from './support';
import type { Candidate } from './types';

/**
 * Production renderer with the ring-wrap lag scan enabled (ringWrap = true):
 * the write slot advances by increment-and-wrap and lag reads use one
 * conditional add instead of two modulo operations. Bit-identical to the
 * default kernel by construction (same slots, same values, same compare order).
 */
export const ringWrap: Candidate = productionCandidate({
  id: 'ring-wrap',
  description:
    'Production renderer with the ring-wrap lag scan (ringWrap on): branch-based history indexing in place of modulo.',
  requestOptions: { ringWrap: true },
});
