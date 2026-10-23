import { hexToRgb } from './palette-metrics';
import type { Rgb } from './color-science';

export interface PeriodPaletteCandidate {
  readonly id: string;
  readonly source: string;
  /** Five colours in the order assigned to ascending emphasized periods. */
  readonly emphasized: readonly string[];
  /** The neutral "other periods" colour. */
  readonly other: string;
}

/**
 * Five-colour period palettes evaluated against PALETTE_FLOORS. Each is the
 * best five-colour subset of its source by minimum pairwise CIEDE2000 under
 * the four visions; Tol bright has no subset that clears the escaped and
 * unresolved floors, so its first five colours stand in for it.
 */
export const PERIOD_PALETTE_CANDIDATES: readonly PeriodPaletteCandidate[] = [
  {
    id: 'okabe-ito',
    source: 'Okabe and Ito (2008): yellow, sky blue, reddish purple, vermillion, blue',
    emphasized: ['#F0E442', '#56B4E9', '#CC79A7', '#D55E00', '#0072B2'],
    other: '#BBBBBB',
  },
  {
    id: 'tol-muted',
    source: 'Paul Tol muted: cyan, teal, green, olive, sand',
    emphasized: ['#88CCEE', '#44AA99', '#117733', '#999933', '#DDCC77'],
    other: '#DDDDDD',
  },
  {
    id: 'tol-bright',
    source: 'Paul Tol bright: blue, cyan, green, yellow, red',
    emphasized: ['#4477AA', '#66CCEE', '#228833', '#CCBB44', '#EE6677'],
    other: '#BBBBBB',
  },
];

export const SELECTED_PERIOD_PALETTE_ID = 'okabe-ito';

export const candidateClasses = (candidate: PeriodPaletteCandidate): readonly Rgb[] => [
  ...candidate.emphasized.map(hexToRgb),
  hexToRgb(candidate.other),
];
