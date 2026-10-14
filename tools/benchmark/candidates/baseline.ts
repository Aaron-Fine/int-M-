import { LEGACY_REFERENCE_OPTIONS, productionCandidate } from './support';
import type { Candidate } from './types';

/**
 * The reference arm: the production serial CPU renderer pinned to the
 * pre-flip default (legacy-scan classifier, conjugate mirroring off), NOT the
 * current production defaults (triggered-scan, mirroring on). Every
 * candidate is judged against this and timed against this.
 */
export const baseline: Candidate = productionCandidate({
  id: 'baseline',
  description:
    'Production CpuRenderer pinned to the reference kernel (classifierMode legacy-scan, conjugateMirror off).',
  requestOptions: LEGACY_REFERENCE_OPTIONS,
  diagnosticMode: 'legacy-scan',
});
