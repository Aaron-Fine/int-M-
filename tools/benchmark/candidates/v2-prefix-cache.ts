import { productionCandidate } from './support';
import type { Candidate } from './types';

/**
 * Candidate v2-prefix-cache: the production renderer with the experiment flag
 * `verifierPrefixCache` on (see OrbitOptions in src/domain/types.ts). The
 * verifier reads proper-divisor states recorded during the candidate period
 * walk instead of re-walking them. The output must be bit-identical to baseline.
 * diagnosticMode is omitted: ClassifierMode cannot name this flag, so the
 * untimed diagnostics use the legacy kernel (bit-identical, so the parity
 * diagnostics still agree).
 */
export const v2PrefixCache: Candidate = productionCandidate({
  id: 'v2-prefix-cache',
  description:
    'Verifier proper-divisor re-walks read states cached during the candidate period walk instead of recomputing them (bit-identical).',
  requestOptions: { verifierPrefixCache: true },
});
