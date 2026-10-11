import { productionCandidate } from './support';
import type { Candidate } from './types';

/**
 * Contestant: the legacy lag scan run only when a scale-aware step gate fires
 * (plus a periodic safety scan and a final scan at the iteration budget). The
 * flag is the production option `classifierMode: 'triggered-scan'`. Accepted
 * pixels keep the baseline status and period; escapes are bit-identical;
 * iteration counts at acceptance may differ. The candidate produces no
 * certificates, so it may not convert any unresolved pixel.
 */
export const triggeredScan: Candidate = {
  ...productionCandidate({
    id: 'triggered-scan',
    description:
      "Production renderer with classifierMode 'triggered-scan': lag scan gated on the orbit step size, with safety scans.",
    requestOptions: { classifierMode: 'triggered-scan' },
    diagnosticMode: 'triggered-scan',
  }),
  parityPolicy: 'semantic-revision',
  tolerance: {
    multiplierMagnitude: { absolute: 1e-4 },
    multiplierAngle: { absolute: 1e-4 },
    note: 'Accepted lambda is evaluated at the iteration the candidate accepts. Transient late acceptances accept later than the baseline on slowly converging cycles, so lambda comes from a nearby orbit point (observed max deviation about 3e-5 on magnitude and angle). Status and period are unchanged.',
  },
};
