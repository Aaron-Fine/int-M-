import { describe, expect, it } from 'vitest';

import { CATALOG } from '../../../src/catalog/components';
import { CATALOG_GLOSSARY } from '../../../src/ui/catalog-glossary';
import { referenceLineRuns, referenceLinkModel } from '../../../src/ui/references';

describe('reference line', () => {
  it('writes the label, then the links separated by a middle dot', () => {
    expect(referenceLineRuns(['julia-set', 'gaston-julia'])).toEqual([
      'References: ',
      {
        title: 'Julia set',
        href: 'https://en.wikipedia.org/wiki/Julia_set',
        target: '_blank',
        rel: 'noopener noreferrer',
        spokenSuffix: ', Wikipedia, opens in a new tab',
      },
      ' · ',
      expect.objectContaining({ title: 'Gaston Julia' }),
    ]);
  });

  it('names an arXiv link by its title, source and new-tab behaviour', () => {
    expect(referenceLinkModel('internal-addresses')).toMatchObject({
      title: 'Internal addresses in the Mandelbrot set (Lau and Schleicher)',
      href: 'https://arxiv.org/abs/math/9411238',
      spokenSuffix: ', arXiv, opens in a new tab',
    });
  });

  it('draws nothing without keys and rejects an unknown key', () => {
    expect(referenceLineRuns(undefined)).toEqual([]);
    expect(referenceLineRuns([])).toEqual([]);
    expect(() => referenceLineRuns(['nowhere'])).toThrow(/unknown reference/);
    expect(() => referenceLineRuns(['toString'])).toThrow(/unknown reference/);
  });

  it('cites known keys from every glossary term that has references', () => {
    const cited = CATALOG_GLOSSARY.filter((entry) => entry.references !== undefined);
    expect(cited.map((entry) => entry.term)).toEqual([
      'Period',
      'Parameter ray pair',
      'Internal address',
      'Angled internal address',
    ]);
    for (const entry of cited) expect(() => referenceLineRuns(entry.references)).not.toThrow();
  });

  it('gives the five curated components the owner-approved references in order', () => {
    const keys = (id: string) => CATALOG.components.find((c) => c.id === id)?.references;
    expect(keys('mi-p3-1-2')).toEqual([
      'douady-rabbit',
      'adrien-douady',
      'julia-set',
      'gaston-julia',
      'fatou-components',
      'pierre-fatou',
      'alpha-fixed-point',
      'parameter-rays',
    ]);
    expect(CATALOG.components.filter((c) => c.references !== undefined)).toHaveLength(5);
    expect(keys('mi-p4-1-2')).toBeUndefined();
  });
});
