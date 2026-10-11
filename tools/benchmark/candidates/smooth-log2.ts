import { productionCandidate } from './support';
import type { Candidate } from './types';

/**
 * Candidate smooth-log2 (performance workstream, single experiment flag).
 * Enables the production option `algebraicEscapeSmoothing`, which computes
 * legacy-scan escape smoothing as log2(0.5 * log2(|z|^2)) instead of
 * log2(log2(sqrt(|z|^2))). The two forms are algebraically equal but are not
 * bit-identical in binary64, so the smoothIteration field alone declares a
 * relative tolerance of 1e-12 (well under the judge's bit-identical ceiling).
 * No other field is loosened: status, period, multiplier fields, and every
 * RGBA view stay exact.
 */
export const smoothLog2: Candidate = {
  ...productionCandidate({
    id: 'smooth-log2',
    description:
      'Escape smoothing as log2(0.5 * log2(|z|^2)) via the opt-in algebraicEscapeSmoothing option.',
    requestOptions: { algebraicEscapeSmoothing: true },
  }),
  tolerance: {
    smoothIteration: { relative: 1e-12 },
    note: 'Algebraically equal escape smoothing (log2(0.5*log2(m)) vs log2(log2(sqrt(m)))); binary64 rounding differs by a few ulp.',
  },
};
