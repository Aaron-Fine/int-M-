import { describe, expect, it } from 'vitest';

import { findInCatalog } from '../../../../src/catalog/find';
import { fullCatalog } from './core-bytes';

const CATALOG = fullCatalog();
const ids = (query: string): string[] =>
  findInCatalog(CATALOG, query)?.matches.map((component) => component.id) ?? [];

describe('catalog find field over the real core (ADR 0014)', () => {
  it('finds a generated entry by either ray, its id or its label', () => {
    expect(ids('7/31')).toEqual(['mi-p5-7-8']);
    expect(ids('8/31')).toEqual(['mi-p5-7-8']);
    expect(ids('mi-p5-7-8')).toEqual(['mi-p5-7-8']);
    expect(ids('period 5, rays 7/31')).toEqual(['mi-p5-7-8']);
  });

  it('counts a whole period by id prefix or label, and never a longer period number', () => {
    expect(findInCatalog(CATALOG, 'mi-p12-')?.total).toBe(2010);
    expect(findInCatalog(CATALOG, 'period 12')?.total).toBe(2010);
    expect(findInCatalog(CATALOG, 'period 1')?.total).toBe(0);
    expect(findInCatalog(CATALOG, 'period 11')?.matches).toHaveLength(50);
  });

  it('finds a ray by value only among exact-period rays', () => {
    // 1/3 is a ray of the period-2 bulb only: 5/15 and 21/63 are not of exact period.
    expect(ids('1/3')).toEqual(['mi-p2-1-2']);
  });
});
