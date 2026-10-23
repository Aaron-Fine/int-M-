import { describe, expect, it } from 'vitest';

import catalogData from '../../../catalog/components.v2.json';
import referenceData from '../../../catalog/references.v1.json';
import {
  CatalogSchemaError,
  parseCatalog,
  parseReferenceTable,
  REFERENCE_TABLE,
} from '../../../src/catalog/components';

type Raw = Record<string, unknown>;

const tableWith = (reference: Raw): unknown => ({
  schemaVersion: 1,
  references: {
    sample: {
      title: 'Sample',
      source: 'Wikipedia',
      url: 'https://en.wikipedia.org/wiki/X',
      ...reference,
    },
  },
});

const catalogWith = (references: unknown): unknown => {
  const copy = structuredClone(catalogData) as unknown as { components: Raw[] };
  copy.components[2]!['references'] = references;
  return copy;
};

describe('reference table loader', () => {
  it('accepts the shipped table', () => {
    expect(parseReferenceTable(referenceData)).toEqual(REFERENCE_TABLE);
    expect(Object.keys(REFERENCE_TABLE)).toHaveLength(17);
  });

  it.each([
    ['a non-https URL', { url: 'http://en.wikipedia.org/wiki/X' }, /must be https/],
    ['another host', { url: 'https://example.org/wiki/X' }, /must be on en\.wikipedia\.org/],
    ['a look-alike host', { url: 'https://en.wikipedia.org.evil.example/x' }, /must be on/],
    ['credentials in the URL', { url: 'https://user@en.wikipedia.org/x' }, /must be on/],
    ['a port', { url: 'https://en.wikipedia.org:8443/x' }, /must be on/],
    ['a source that does not match the host', { source: 'arXiv' }, /must be on arxiv\.org/],
    ['an unknown source', { source: 'Blog' }, /Wikipedia or arXiv/],
    ['an empty title', { title: ' ' }, /title: must be a non-empty string/],
    ['a relative URL', { url: '/wiki/X' }, /absolute URL/],
  ])('rejects %s', (_name, change, message) => {
    const raw = tableWith(change);
    expect(() => parseReferenceTable(raw)).toThrow(CatalogSchemaError);
    expect(() => parseReferenceTable(raw)).toThrow(message);
  });
});

describe('component references', () => {
  it('rejects an unknown key, a repeat and an empty list', () => {
    expect(() => parseCatalog(catalogWith(['nowhere']))).toThrow(/unknown reference nowhere/);
    expect(() => parseCatalog(catalogWith(['julia-set', 'julia-set']))).toThrow(/repeat/);
    expect(() => parseCatalog(catalogWith([]))).toThrow(/must not be empty/);
    expect(() => parseCatalog(catalogWith('julia-set'))).toThrow(/must be an array/);
  });

  it('accepts known keys', () => {
    expect(parseCatalog(catalogWith(['julia-set'])).components[2]?.references).toEqual([
      'julia-set',
    ]);
  });
});
