import { describe, expect, it } from 'vitest';

import catalogData from '../../../catalog/components.v2.json';
import {
  CATALOG,
  CatalogSchemaError,
  findCatalogComponent,
  parseCatalog,
} from '../../../src/catalog/components';

type Raw = Record<string, unknown>;

/** A deep copy of the committed file with one edit applied to it. */
const edited = (edit: (catalog: Raw, components: Raw[]) => void): unknown => {
  const copy = structuredClone(catalogData) as unknown as Raw;
  edit(copy, copy['components'] as Raw[]);
  return copy;
};

/** The entry at `index` of the edited copy. */
const at = (components: Raw[], index: number): Raw => components[index]!;

const expectRejected = (raw: unknown, message: RegExp): void => {
  expect(() => parseCatalog(raw)).toThrow(CatalogSchemaError);
  expect(() => parseCatalog(raw)).toThrow(message);
};

describe('catalog schema v2 loader', () => {
  it('accepts the committed catalog', () => {
    expect(parseCatalog(catalogData)).toEqual(CATALOG);
    expect(CATALOG.schemaVersion).toBe(2);
    expect(CATALOG.components).toHaveLength(11);
  });

  it('gives every entry a residual, a method and a provenance it can resolve', () => {
    for (const component of CATALOG.components) {
      expect(CATALOG.methods[component.method], component.id).toBeTypeOf('string');
      expect(CATALOG.provenance[component.provenance], component.id).toBeDefined();
      expect(component.residual.orbitAbs, component.id).toBeGreaterThanOrEqual(0);
      expect(component.residual.centerError, component.id).toBeGreaterThanOrEqual(0);
    }
  });

  it('finds an entry by its canonical id or by an alias', () => {
    expect(findCatalogComponent('mi-p3-1-2')?.label).toBe('Douady rabbit');
    expect(findCatalogComponent('mi-p3-rabbit')).toBe(findCatalogComponent('mi-p3-1-2'));
    expect(findCatalogComponent('mi-p9-nope')).toBeUndefined();
  });

  it.each([
    ['another schema version', edited((c) => (c['schemaVersion'] = 1)), /schemaVersion/],
    ['another licence', edited((c) => (c['license'] = 'MIT')), /license/],
    ['a period above the generated core', edited((c) => (c['maxPeriod'] = 13)), /maxPeriod/],
    ['no components', edited((c) => (c['components'] = [])), /must not be empty/],
    ['an ordinal id', edited((_, e) => (at(e, 5)['id'] = 'mi-p4-01')), /must be mi-p4-7-8/],
    [
      'an id that disagrees with its rays',
      edited((_, e) => (at(e, 2)['id'] = 'mi-p3-1-2')),
      /must be mi-p3-3-4/,
    ],
    [
      'a repeated alias',
      edited((_, e) => (at(e, 1)['aliases'] = ['mi-p1-main'])),
      /mi-p1-main is not unique/,
    ],
    [
      'an alias equal to another id',
      edited((_, e) => (at(e, 1)['aliases'] = ['mi-p3-3-4'])),
      /mi-p3-3-4 is not unique/,
    ],
    ['an upper-case alias', edited((_, e) => (at(e, 1)['aliases'] = ['MI-X'])), /aliases\[0\]/],
    ['an empty label', edited((_, e) => (at(e, 0)['label'] = ' ')), /label/],
    ['a non-finite centre', edited((_, e) => (at(e, 2)['center'] = { re: null, im: 0 })), /re/],
    [
      'an address that does not end at the period',
      edited((_, e) => (at(e, 2)['internalAddress'] = [1, 2])),
      /internalAddress/,
    ],
    [
      'an angled step off the address',
      edited((_, e) => {
        const steps = at(e, 2)['angledInternalAddress'] as Raw[];
        steps[1]!['fromPeriod'] = 1;
      }),
      /must follow the internal address/,
    ],
    [
      'an angle not in lowest terms',
      edited((_, e) => {
        const steps = at(e, 1)['angledInternalAddress'] as Raw[];
        steps[0]!['rotation'] = { numerator: 2, denominator: 4 };
      }),
      /lowest terms/,
    ],
    [
      'a ray over the wrong denominator',
      edited(
        (_, e) =>
          (at(e, 1)['characteristicRays'] = [
            { numerator: 1, denominator: 7 },
            { numerator: 2, denominator: 7 },
          ]),
      ),
      /denominator must be 3/,
    ],
    [
      'rays in the wrong order',
      edited(
        (_, e) =>
          (at(e, 1)['characteristicRays'] = [
            { numerator: 2, denominator: 3 },
            { numerator: 1, denominator: 3 },
          ]),
      ),
      /lower angle first/,
    ],
    [
      'a main cardioid with a ray pair',
      edited((_, e) => (at(e, 0)['characteristicRays'] = [])),
      /main cardioid/,
    ],
    ['a missing residual', edited((_, e) => delete at(e, 3)['residual']), /residual/],
    [
      'a negative residual',
      edited((_, e) => ((at(e, 3)['residual'] as Raw)['orbitAbs'] = -1)),
      /orbitAbs/,
    ],
    [
      'a missing divisor residual',
      edited((_, e) => delete (at(e, 3)['residual'] as Raw)['properDivisorOrbitMinAbs']),
      /properDivisorOrbitMinAbs/,
    ],
    ['an unknown method', edited((_, e) => (at(e, 3)['method'] = 'guesswork')), /unknown method/],
    [
      'an unknown provenance',
      edited((_, e) => (at(e, 3)['provenance'] = 'hearsay')),
      /unknown provenance/,
    ],
  ])('rejects %s', (_name, raw, message) => {
    expectRejected(raw, message);
  });
});
