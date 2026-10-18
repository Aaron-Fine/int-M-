import { describe, expect, it } from 'vitest';

import { COMPONENT_CATALOG } from '../../../src/catalog/components';
import { FIND_RESULT_LIMIT, findInCatalog } from '../../../src/catalog/find';
import { compareCatalogOrder } from '../../../src/catalog/navigation';
import { syntheticCatalog } from './synthetic-catalog';

const CURATED = [...COMPONENT_CATALOG].sort(compareCatalogOrder);
const ids = (query: string, components = CURATED): string[] =>
  findInCatalog(components, query)?.matches.map((component) => component.id) ?? [];

describe('catalog find field (ADR 0014)', () => {
  it('does not filter on an empty or blank query', () => {
    expect(findInCatalog(CURATED, '')).toBeUndefined();
    expect(findInCatalog(CURATED, '   ')).toBeUndefined();
  });

  it('finds an entry by either ray, by value', () => {
    expect(ids('6/15')).toEqual(['mi-p4-6-9']);
    expect(ids('9/15')).toEqual(['mi-p4-6-9']);
    expect(ids('2/5')).toEqual(['mi-p4-6-9']); // 2/5 = 6/15
    expect(ids('3/7')).toEqual(['mi-p3-3-4']);
    expect(ids('1/3')).toEqual(['mi-p2-1-2']);
    expect(ids('0/1')).toEqual(['mi-p1-0-1']);
  });

  it('needs every fraction of a two-ray query', () => {
    expect(ids('6/15 and 9/15')).toEqual(['mi-p4-6-9']);
    expect(ids('6/15, 9/15')).toEqual(['mi-p4-6-9']);
    expect(ids('6/15 7/15')).toEqual([]);
  });

  it('finds an entry by a prefix of its id or of a v1 alias', () => {
    expect(ids('mi-p4-6-9')).toEqual(['mi-p4-6-9']);
    expect(ids('mi-p4-02')).toEqual(['mi-p4-6-9']);
    expect(ids('MI-P3-')).toEqual(['mi-p3-1-2', 'mi-p3-3-4', 'mi-p3-5-6']);
    expect(ids('mi-p3-rab')).toEqual(['mi-p3-1-2']);
  });

  it('finds an entry by its label from a word start, ignoring case and punctuation', () => {
    expect(ids('rabbit')).toEqual(['mi-p3-1-2']); // "corabbit" has no word start at rabbit
    expect(ids('Corabbit')).toEqual(['mi-p3-5-6']);
    expect(ids('basilica')).toEqual(['mi-p2-1-2']);
    expect(ids('abbit')).toEqual([]);
    expect(ids('period 4, rays 6')).toEqual(['mi-p4-6-9']);
  });

  it('does not let a trailing number match a longer one', () => {
    const synthetic = syntheticCatalog().components;
    const periods = new Set(
      findInCatalog(synthetic, 'period 1', 5000)?.matches.map((component) => component.period),
    );
    expect([...periods]).toEqual([]); // "Period 1, …" is curated as "Main cardioid"
    const twelve = findInCatalog(synthetic, 'period 12', 5000);
    expect(twelve?.total).toBe(2010);
    expect(new Set(twelve?.matches.map((component) => component.period))).toEqual(new Set([12]));
  });

  it('lists at most 50 matches in catalog order and counts them all', () => {
    const synthetic = syntheticCatalog().components;
    const result = findInCatalog(synthetic, 'period 11');
    expect(result?.total).toBe(1023);
    expect(result?.matches).toHaveLength(FIND_RESULT_LIMIT);
    expect(result?.matches).toEqual(
      synthetic.filter((component) => component.period === 11).slice(0, FIND_RESULT_LIMIT),
    );
  });

  it('matches nothing for a fraction with a zero denominator or a query of punctuation', () => {
    expect(ids('1/0')).toEqual([]);
    expect(ids('—')).toEqual([]);
  });
});
