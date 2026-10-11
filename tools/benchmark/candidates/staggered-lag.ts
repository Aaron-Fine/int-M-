import { productionCandidate } from './support';
import type { Candidate } from './types';

/**
 * Staggered harmonic lag schedule (src/domain/staggered-lag.ts). The flag is
 * the production option `classifierMode: 'staggered-lag'`. Lag p is tested
 * only at iterations divisible by p, with the frozen rejected-candidate
 * budget and a final window scan (prior-art policy, widened). The candidate
 * produces no certificates, so under 'semantic-revision' it may not convert
 * any unresolved baseline pixel; baseline attracting pixels must keep their
 * status and period, and escapes must stay bit-identical.
 */
export const staggeredLag: Candidate = {
  ...productionCandidate({
    id: 'staggered-lag',
    description:
      "Staggered harmonic lag schedule: production renderer with classifierMode 'staggered-lag'.",
    requestOptions: { classifierMode: 'staggered-lag' },
    diagnosticMode: 'staggered-lag',
  }),
  parityPolicy: 'semantic-revision',
  tolerance: {
    multiplierMagnitude: { absolute: 1e-4, relative: 1e-4 },
    multiplierDirection: { absolute: 1e-4 },
    note: 'Set from the measured drift of the 13-case parity run (max |dlambda| 3.2e-5 absolute, 5.9e-5 relative; max direction 3.0e-5), about 3x headroom. Drift comes from the cycle start moving with the later detection iteration.',
  },
  certificates: (): ReadonlyMap<number, unknown> => new Map(),
};
