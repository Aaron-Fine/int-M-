import { describe, expect, it } from 'vitest';

import {
  classifyOrbit,
  OrbitClassifier,
  type OrbitOptions,
  type OrbitResult,
} from '../../../src/domain';
import { boundaryPoints, rabbitPoints, STRATA, superattractingPoints } from './legacy-differential';

/**
 * v2-prefix-cache: the verifier's proper-divisor re-walks read states recorded
 * during the candidate period walk. The flag must not change any result, so
 * every point is classified with the flag off and on and the results compared
 * field by field (toEqual on the materialized results).
 */

const points = (): { readonly re: number; readonly im: number }[] => [
  ...STRATA,
  ...superattractingPoints(),
  ...rabbitPoints(),
  ...boundaryPoints(),
];

const bounded: Partial<OrbitOptions> = { maxIterations: 512, maxPeriod: 32 };

describe('verifierPrefixCache is bit-identical to the default lag scan', () => {
  it('classifyOrbit returns identical results on every differential point', () => {
    const on: Partial<OrbitOptions> = { ...bounded, verifierPrefixCache: true };
    let attracting = 0;
    for (const point of points()) {
      const expected: OrbitResult = classifyOrbit(point, bounded);
      const actual: OrbitResult = classifyOrbit(point, on);
      if (expected.status === 'attracting-cycle') attracting += 1;
      expect(actual).toEqual(expected);
    }
    // The comparison is only meaningful if the verifier actually ran on
    // attracting cycles, so make sure the point set exercises them.
    expect(attracting).toBeGreaterThan(0);
  });

  it('OrbitClassifier with the flag returns identical results', () => {
    const offClassifier = new OrbitClassifier(bounded);
    const onClassifier = new OrbitClassifier({ ...bounded, verifierPrefixCache: true });
    for (const point of points()) {
      expect(onClassifier.classify(point)).toEqual(offClassifier.classify(point));
    }
  });
});
