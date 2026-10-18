import { describe, expect, it } from 'vitest';

import { angledAddressRuns, spokenAngledAddress } from '../../../src/ui/angled-address';
import { CATALOG_GLOSSARY } from '../../../src/ui/catalog-glossary';

const step = (fromPeriod: number, toPeriod: number, numerator: number, denominator: number) => ({
  fromPeriod,
  toPeriod,
  rotation: { numerator, denominator },
});

describe('angled internal address chain', () => {
  const steps = [step(1, 3, 1, 3), step(3, 6, 1, 2)];

  it('writes each rotation as a subscript on its arrow', () => {
    const runs = angledAddressRuns(steps);
    expect(runs).toEqual([
      { text: '1' },
      { text: ' →', sub: '1/3' },
      { text: ' 3' },
      { text: ' →', sub: '1/2' },
      { text: ' 6' },
    ]);
  });

  it('speaks the address for assistive technology', () => {
    expect(spokenAngledAddress(steps)).toBe('1, to 3 at angle 1/3, to 6 at angle 1/2');
    expect(spokenAngledAddress([])).toBe('');
  });
});

describe('catalog glossary', () => {
  const terms = CATALOG_GLOSSARY.map((entry) => entry.term);

  it('names the root rays a parameter ray pair, not characteristic rays', () => {
    expect(terms).toContain('Parameter ray pair');
    expect(terms).not.toContain('Characteristic rays');
  });

  it('draws the angled internal address examples as chains of the same kind', () => {
    const entry = CATALOG_GLOSSARY.find(
      (candidate) => candidate.term === 'Angled internal address',
    );
    const parts = typeof entry?.definition === 'string' ? [] : (entry?.definition ?? []);
    const spoken = parts.flatMap((part) =>
      typeof part === 'string' ? [] : [spokenAngledAddress(part.address)],
    );
    expect(spoken).toEqual(['1, to 3 at angle 1/3', '1, to 3 at angle 2/3']);
  });
});
