import corpusJson from '../../../tools/benchmark/corpus.v1.json';
import { describe, expect, it } from 'vitest';

import { validateCorpus } from '../../../tools/benchmark/validate-corpus';

type MutableCase = Record<string, unknown>;

const clone = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

describe('frozen benchmark corpus', () => {
  it('corpus_v1Json_passesSchemaAndSanityValidation', () => {
    expect(validateCorpus(corpusJson)).toEqual([]);
  });

  it('corpus_rejectsNumericCoordinatesToProtectDecimalStringPrecision', () => {
    const mutated = clone(corpusJson) as { cases: MutableCase[] };
    // Simulate a float round-trip: the coordinate became a number.
    mutated.cases[0]!['spanY'] = 2.5;
    expect(validateCorpus(mutated)).toContainEqual(
      expect.stringContaining('cases[0].spanY must be an exact decimal string'),
    );
  });

  it('corpus_rejectsDuplicateCaseIds', () => {
    const mutated = clone(corpusJson) as { cases: unknown[] };
    mutated.cases = [...mutated.cases, mutated.cases[0]];
    expect(validateCorpus(mutated)).toContainEqual(
      expect.stringContaining('duplicate case id "mi-easy-default-full"'),
    );
  });

  it('corpus_rejectsSpansBeyondTheDeclaredZoomEnvelope', () => {
    const mutated = clone(corpusJson) as { cases: MutableCase[] };
    mutated.cases[0]!['spanY'] = '0.0000000000000001';
    expect(validateCorpus(mutated)).toContainEqual(
      expect.stringContaining('outside the declared viewport envelope'),
    );
  });

  it('corpus_rationaleCorrections_keepFrozenViewParametersAndNameTheMeasuredPeriods', () => {
    const cases = (corpusJson as unknown as { cases: MutableCase[] }).cases;
    const byId = (id: string): MutableCase => {
      const found = cases.find((entry) => entry['id'] === id);
      if (found === undefined) throw new Error(`missing case ${id}`);
      return found;
    };
    const { rationale: weakRationale, ...weakFrozen } = byId('mi-fallback-weak-attraction');
    const { rationale: rimRationale, ...rimFrozen } = byId('mi-scale-6mx-basilica-rim');

    expect(weakFrozen).toEqual({
      id: 'mi-fallback-weak-attraction',
      class: 'Fallback',
      center: { re: '-0.1205', im: '0.8268' },
      spanY: '0.005',
      profile: 'Balanced',
      designation: 'release-gate',
      strata: ['weak-attraction', 'period-5-8', 'boundary'],
    });
    expect(rimFrozen).toEqual({
      id: 'mi-scale-6mx-basilica-rim',
      class: 'Scale',
      center: { re: '-1.25', im: '0' },
      spanY: '0.00000041666666666666667',
      profile: 'Balanced',
      designation: 'release-gate',
      strata: ['period-1-4', 'weak-attraction', 'boundary', 'high-unresolved'],
    });

    // WORKSTREAM-H-SPIKE-2026-10-16.md, side finding 1.
    expect(String(weakRationale)).toMatch(/period-3/);
    expect(String(weakRationale)).not.toMatch(/period-6|p6/);
    expect(String(rimRationale)).toMatch(/period-4/);
    expect(String(rimRationale)).not.toMatch(/near-parabolic exterior/);
  });
});
