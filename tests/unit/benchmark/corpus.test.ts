import corpusJson from '../../../tools/benchmark/corpus.v1.json';
import { describe, expect, it } from 'vitest';

import { validateCorpus } from '../../../tools/benchmark/validate-corpus';

type MutableCase = { [key: string]: unknown };

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
});
