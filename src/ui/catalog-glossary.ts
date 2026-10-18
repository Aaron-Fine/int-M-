/**
 * The catalog panel's glossary (PHASE2-TODO item 6, ADR 0012): the terms the
 * panel's grouping and order and the inspector's catalog facts use.
 */
import type { AddressStep } from './angled-address';

/** A definition made of plain text and angled internal addresses, which the panel draws as chains. */
export type GlossaryDefinitionPart = string | { readonly address: readonly AddressStep[] };

export interface GlossaryEntry {
  readonly term: string;
  readonly definition: string | readonly GlossaryDefinitionPart[];
}

const step = (
  fromPeriod: number,
  numerator: number,
  denominator: number,
  toPeriod: number,
): AddressStep => ({
  fromPeriod,
  toPeriod,
  rotation: { numerator, denominator },
});

export const CATALOG_GLOSSARY: readonly GlossaryEntry[] = [
  {
    term: 'Period',
    definition:
      'The length of the attracting cycle shared by every parameter in the component. The catalog groups its entries by period.',
  },
  {
    term: 'Parameter ray pair',
    definition:
      'The two parameter rays that land at the component’s root: the point where a bulb meets its parent, or the cusp of a primitive component’s cardioid, such as the airplane component’s. Their angles are a/(2^p − 1) and b/(2^p − 1) of a full turn; within a period the catalog lists entries by the first angle, and an entry’s id mi-p<p>-<a>-<b> records p, a and b.',
  },
  {
    term: 'Internal address',
    definition:
      'Start at the main cardioid, period 1. Each next number is the lowest period of any component on the rest of the way to this one, so the 1/3-bulb’s is 1 → 3. Different components can share it: the 2/3-bulb’s is also 1 → 3.',
  },
  {
    term: 'Angled internal address',
    definition: [
      'The internal address with the internal angle written under each arrow: ',
      { address: [step(1, 1, 3, 3)] },
      ' for the 1/3-bulb and ',
      { address: [step(1, 2, 3, 3)] },
      ' for the 2/3-bulb. It names exactly one component.',
    ],
  },
];
