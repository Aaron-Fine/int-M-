import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { angledInternalAddressOf } from '../../../../src/catalog/combinatorics';

/**
 * tools/dump_angled_addresses.py writes the generator's angled internal
 * addresses (its tuned search of the sub-wakes) for every Lavaurs pair of
 * period 2 to 12. The browser's closed form must give the same on all 4,015
 * (ADR 0011 amendment, ADR 0014).
 */
const FIXTURE = JSON.parse(
  readFileSync(new URL('../../../../fixtures/angled-addresses.p12.json', import.meta.url), 'utf8'),
) as Record<string, string>;

describe('angled internal addresses (ADR 0014)', () => {
  it('agree with the generator on every pair of period 2 to 12', () => {
    const entries = Object.entries(FIXTURE);
    expect(entries).toHaveLength(4015);
    const disagreements = entries.filter(([key, expected]) => {
      const [period, lower] = key.split('/').map(Number) as [number, number];
      const actual = angledInternalAddressOf(lower, period)
        .map(
          ({ fromPeriod, toPeriod, rotation }) =>
            `${fromPeriod}>${toPeriod}:${rotation.numerator}/${rotation.denominator}`,
        )
        .join(' ');
      return actual !== expected;
    });
    expect(disagreements.map(([key]) => key)).toEqual([]);
  });
});
