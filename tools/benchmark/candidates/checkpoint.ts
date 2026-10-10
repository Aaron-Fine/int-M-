import { productionCandidate } from './support';
import type { Candidate } from './types';

/**
 * Worked example contestant. The flag is the existing production option
 * `classifierMode: 'checkpoint'` (see ClassifierMode in src/domain/types.ts).
 * It declares no tolerance and the default 'bit-identical' policy, so any
 * pixel where the checkpoint detector differs from the legacy scan is a
 * parity failure. That is information about the candidate, not a judge bug
 * (docs/verification/ORBIT-RASTER-OPTIMIZATIONS.md records such differences).
 */
export const checkpoint: Candidate = productionCandidate({
  id: 'checkpoint',
  description: "Example: production renderer with classifierMode 'checkpoint'.",
  requestOptions: { classifierMode: 'checkpoint' },
  diagnosticMode: 'checkpoint',
});
