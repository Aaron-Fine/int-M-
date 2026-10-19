import { describe, expect, it } from 'vitest';

import { spokenAngledAddress } from '../../../src/ui/angled-address';
import { CATALOG_GLOSSARY } from '../../../src/ui/catalog-glossary';

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
