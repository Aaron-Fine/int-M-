import { element, replaceChildren } from './dom';
import type { SemanticView } from './view-state';

interface LegendEntry {
  readonly label: string;
  readonly detail: string;
  readonly cue:
    'strong' | 'weak' | 'angle' | 'period-1' | 'period-2' | 'period-3' | 'outside' | 'unknown';
}

const LEGENDS: Record<SemanticView, readonly LegendEntry[]> = {
  stability: [
    {
      label: 'Strong attraction',
      detail: 'High κ; centers reach κ = ∞',
      cue: 'strong',
    },
    {
      label: 'Weak attraction',
      detail: 'κ approaches 0 near neutral stability',
      cue: 'weak',
    },
  ],
  multiplier: [
    {
      label: 'Strong attraction',
      detail: 'Lighter values have smaller |λ|',
      cue: 'strong',
    },
    {
      label: 'Weak attraction',
      detail: 'Darker values have |λ| approaching 1',
      cue: 'weak',
    },
    {
      label: 'Multiplier angle',
      detail: 'Hue represents arg λ',
      cue: 'angle',
    },
  ],
  period: [
    { label: 'Period 1', detail: 'Fixed-point component', cue: 'period-1' },
    { label: 'Period 2', detail: 'Two-cycle component', cue: 'period-2' },
    {
      label: 'Period 3+',
      detail: 'Every exact period receives a distinct hue',
      cue: 'period-3',
    },
  ],
};

const COMMON: readonly LegendEntry[] = [
  {
    label: 'Escaped',
    detail: 'Outside the Mandelbrot set',
    cue: 'outside',
  },
  {
    label: 'Unresolved',
    detail: 'No claim at current quality',
    cue: 'unknown',
  },
];

const DEFINITIONS: Record<SemanticView, string> = {
  stability: 'κ = −log|λ| / p measures attraction per iteration.',
  multiplier: 'Hue = arg λ; lightness follows multiplier magnitude |λ|.',
  period: 'Color categories represent the exact detected attracting-cycle period.',
};

export function createSemanticLegend(): {
  readonly element: HTMLElement;
  readonly update: (view: SemanticView) => void;
} {
  const root = element('section', {
    className: 'legend',
    attributes: {
      'aria-labelledby': 'legend-heading',
    },
  });
  const heading = element('h2', {
    className: 'eyebrow',
    text: 'Semantic legend',
    attributes: { id: 'legend-heading' },
  });
  const definition = element('p', {
    className: 'legend__definition',
    text: DEFINITIONS.stability,
  });
  const list = element('ul', { className: 'legend__list' });
  root.append(heading, definition, list);

  const update = (view: SemanticView): void => {
    definition.textContent = DEFINITIONS[view];
    const entries = [...LEGENDS[view], ...COMMON];
    replaceChildren(
      list,
      entries.map((entry) => {
        const item = element('li', { className: 'legend__item' });
        const swatch = element('span', {
          className: `legend__swatch legend__swatch--${entry.cue}`,
          attributes: { 'aria-hidden': 'true' },
        });
        const copy = element('span', { className: 'legend__copy' });
        copy.append(
          element('strong', { text: entry.label }),
          element('small', { text: entry.detail }),
        );
        item.append(swatch, copy);
        return item;
      }),
    );
  };

  update('stability');
  return { element: root, update };
}
