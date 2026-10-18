import type { CatalogComponent } from './schema';

/**
 * The catalog panel's find field (owner decision 2026-10-17, ADR 0014). A
 * query is one of three forms, tried in this order:
 *
 * 1. One or two ray fractions, such as `3/7` or `6/15 and 9/15` (separated
 *    by spaces, a comma or "and"): an entry matches when it has a
 *    parameter ray equal to each fraction, by value, so `2/5` also finds
 *    the rays 6/15. The main cardioid's rays are 0/1 and 1/1.
 * 2. Text starting with `mi-`: a prefix of the entry's id or of an alias, so
 *    `mi-p4-02` finds its v1 alias and `mi-p12-` lists period 12.
 * 3. Anything else: the label contains the text, ignoring case and treating
 *    every run of punctuation and spaces as one space ("period 2" finds the
 *    "1/2-bulb (basilica)"); the match starts at a word start and, when the text
 *    ends in a digit, also ends at a word end, so `period 1` does not find
 *    period 12.
 *
 * Matches come back in the order given (the catalog order), at most `limit`.
 */

export const FIND_RESULT_LIMIT = 50;

export interface FindResult {
  /** The first `limit` matches, in input order. */
  readonly matches: readonly CatalogComponent[];
  /** How many entries match in all. */
  readonly total: number;
}

type Matcher = (component: CatalogComponent) => boolean;

const FRACTIONS = /^(\d{1,5})\/(\d{1,5})(?:(?:\s*,\s*|\s+and\s+|\s+)(\d{1,5})\/(\d{1,5}))?$/;

const raysOf = (component: CatalogComponent): readonly [number, number][] =>
  component.characteristicRays?.map(
    (ray) => [ray.numerator, ray.denominator] as [number, number],
  ) ?? [
    [0, 1],
    [1, 1],
  ];

const fractionMatcher = (fractions: readonly [number, number][]): Matcher | undefined => {
  if (fractions.some(([, denominator]) => denominator === 0)) return undefined;
  return (component) =>
    fractions.every(([numerator, denominator]) =>
      raysOf(component).some(([n, d]) => n * denominator === numerator * d),
    );
};

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Lower case, with every run of characters other than letters, digits and "/" one space. */
const words = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}/]+/gu, ' ')
    .trim();

const labelMatcher = (text: string): Matcher | undefined => {
  const phrase = words(text);
  if (phrase === '') return undefined;
  const end = /\d$/.test(phrase) ? '(?![0-9])' : '';
  const pattern = new RegExp(`(?:^| )${escapeRegExp(phrase)}${end}`, 'u');
  return (component) => pattern.test(words(component.label));
};

/** The matcher for a query, or undefined when the query is empty or cannot match. */
export const catalogMatcher = (query: string): Matcher | undefined => {
  const text = query.trim().replace(/\s+/g, ' ').toLowerCase();
  if (text === '') return undefined;
  const fractions = FRACTIONS.exec(text);
  if (fractions !== null) {
    const values = [fractions.slice(1, 3), fractions.slice(3, 5)]
      .filter(([numerator]) => numerator !== undefined)
      .map(
        ([numerator, denominator]) => [Number(numerator), Number(denominator)] as [number, number],
      );
    return fractionMatcher(values) ?? (() => false);
  }
  if (text.startsWith('mi-')) {
    return (component) =>
      [component.id, ...component.aliases].some((name) => name.startsWith(text));
  }
  return labelMatcher(text) ?? (() => false);
};

/** Every entry matching `query`, the first `limit` of them listed; undefined for an empty query. */
export const findInCatalog = (
  components: readonly CatalogComponent[],
  query: string,
  limit = FIND_RESULT_LIMIT,
): FindResult | undefined => {
  const matcher = catalogMatcher(query);
  if (matcher === undefined) return undefined;
  const matches: CatalogComponent[] = [];
  let total = 0;
  for (const component of components) {
    if (!matcher(component)) continue;
    total += 1;
    if (matches.length < limit) matches.push(component);
  }
  return { matches, total };
};
