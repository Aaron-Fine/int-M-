import type { PeriodKey } from '../domain';
import { element, replaceChildren } from './dom';
import {
  legendModel,
  type LegendItem,
  type LegendScale,
  type LegendSwatch,
  type LegendTick,
} from './legend-model';
import type { SemanticView } from './view-state';

const copyOf = (label: string, detail: string): HTMLElement => {
  const copy = element('span', { className: 'legend__copy' });
  copy.append(element('strong', { text: label }), element('small', { text: detail }));
  return copy;
};

const tickClass = (tick: LegendTick): string =>
  tick.position <= 0
    ? 'legend__tick legend__tick--start'
    : tick.position >= 1
      ? 'legend__tick legend__tick--end'
      : 'legend__tick';

const renderScale = (scale: LegendScale): HTMLLIElement => {
  const item = element('li', { className: 'legend__item legend__item--scale' });
  const bar = element('span', { className: 'legend__bar' });
  bar.style.background = scale.background;
  const ticks = element('span', { className: 'legend__ticks' });
  for (const tick of scale.ticks) {
    const label = element('span', { className: tickClass(tick), text: tick.label });
    label.style.left = `${tick.position * 100}%`;
    ticks.append(label);
  }
  // The detail text states the range in words; the bar and ticks repeat it visually.
  const graphic = element('span', {
    className: 'legend__scale',
    attributes: { 'aria-hidden': 'true' },
  });
  graphic.append(bar, ticks);
  item.append(copyOf(scale.label, scale.detail), graphic);
  return item;
};

const renderSwatch = (entry: LegendSwatch): HTMLLIElement => {
  const item = element('li', {
    className: entry.period === undefined ? 'legend__item' : 'legend__item legend__item--period',
  });
  if (entry.period !== undefined) item.dataset['period'] = String(entry.period);
  const swatch = element('span', {
    className:
      entry.border === 'solid'
        ? 'legend__swatch'
        : `legend__swatch legend__swatch--${entry.border}`,
    attributes: { 'aria-hidden': 'true' },
  });
  swatch.style.background = entry.background;
  item.append(swatch, copyOf(entry.label, entry.detail));
  return item;
};

const renderItem = (entry: LegendItem): HTMLLIElement => {
  switch (entry.kind) {
    case 'scale':
      return renderScale(entry);
    case 'swatch':
      return renderSwatch(entry);
    case 'note':
      return element('li', { className: 'legend__item legend__note', text: entry.text });
  }
};

export function createSemanticLegend(): {
  readonly element: HTMLElement;
  /** Shows `view`; in the period view `periodKey` is the key of the frame on screen. */
  readonly update: (view: SemanticView, periodKey?: PeriodKey) => void;
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
  const definition = element('p', { className: 'legend__definition' });
  const list = element('ul', { className: 'legend__list' });
  root.append(heading, definition, list);

  let shown: string | undefined;
  const update = (view: SemanticView, periodKey?: PeriodKey): void => {
    // Coarse and stable frames often share a key; skip identical redraws.
    const signature = JSON.stringify([view, periodKey ?? null]);
    if (signature === shown) return;
    shown = signature;
    const model = legendModel(view, periodKey);
    definition.textContent = model.definition;
    replaceChildren(list, model.items.map(renderItem));
  };

  update('stability');
  return { element: root, update };
}
