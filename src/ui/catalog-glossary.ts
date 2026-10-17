/**
 * The catalog panel's glossary (PHASE2-TODO item 6, ADR 0012): the terms the
 * panel's grouping and order and the inspector's catalog facts use.
 */
export interface GlossaryEntry {
  readonly term: string;
  readonly definition: string;
}

export const CATALOG_GLOSSARY: readonly GlossaryEntry[] = [
  {
    term: 'Period',
    definition:
      'The length of the attracting cycle shared by every parameter in the component. The catalog groups its entries by period.',
  },
  {
    term: 'Characteristic rays',
    definition:
      'The two external rays that land at the component’s root, where a bulb meets its parent or at the cusp of a cardioid such as the airplane. Their angles are a/(2^p − 1) and b/(2^p − 1) of a full turn; within a period the catalog lists entries by the first angle, and an entry’s id mi-p<p>-<a>-<b> records p, a and b.',
  },
  {
    term: 'Internal address',
    definition:
      'Start at the main cardioid, period 1. Each next number is the lowest period of any component on the rest of the way to this one, so the rabbit’s is 1 → 3. Different components can share it: the co-rabbit’s is also 1 → 3.',
  },
  {
    term: 'Angled internal address',
    definition:
      'The internal address with the angle taken at each step, shown as 1 → 3 at 1/3 for the rabbit and 1 → 3 at 2/3 for the co-rabbit. It names exactly one component.',
  },
];
