import type { CatalogGroup } from '../catalog/navigation';
import type { CatalogComponent } from '../catalog/schema';
import { CATALOG_GLOSSARY } from './catalog-glossary';
import { button, element } from './dom';

/**
 * The catalog panel (PHASE2-TODO item 6, MI-UX-020): every entry, grouped by
 * period in catalog order, each a button that zooms to its component and
 * selects it. Groups are native disclosures; a group's buttons are built the
 * first time it opens, so the 4,016-entry core costs nothing until then.
 */
export interface CatalogPanel {
  readonly element: HTMLElement;
  /** Marks the selected entry (aria-current) and opens its group; undefined clears the mark. */
  setSelected(id: string | undefined): void;
}

const HINT_ID = 'catalog-panel-hint';

const countText = (count: number): string => `${count} component${count === 1 ? '' : 's'}`;

function createGlossary(): HTMLElement {
  const glossary = element('details', { className: 'catalog-glossary' });
  const terms = element('dl');
  for (const { term, definition } of CATALOG_GLOSSARY) {
    terms.append(element('dt', { text: term }), element('dd', { text: definition }));
  }
  glossary.append(element('summary', { text: 'About periods, rays and addresses' }), terms);
  return glossary;
}

export function createCatalogPanel(options: {
  readonly groups: readonly CatalogGroup[];
  readonly onActivate: (component: CatalogComponent) => void;
}): CatalogPanel {
  const root = element('section', {
    className: 'catalog-panel',
    attributes: { 'aria-labelledby': 'catalog-panel-heading' },
  });
  const entries = new Map<string, HTMLButtonElement>();
  const openers = new Map<string, () => void>();
  let selectedId: string | undefined;

  const createEntry = (component: CatalogComponent): HTMLLIElement => {
    const entry = button(component.label, { className: 'catalog-entry' });
    entry.dataset['catalogId'] = component.id;
    entry.setAttribute('aria-describedby', HINT_ID);
    if (component.id === selectedId) entry.setAttribute('aria-current', 'true');
    entry.addEventListener('click', () => {
      options.onActivate(component);
    });
    entries.set(component.id, entry);
    const item = element('li');
    item.append(entry);
    return item;
  };

  const createGroup = (group: CatalogGroup): HTMLDetailsElement => {
    const details = element('details', { className: 'catalog-group' });
    const summary = element('summary', { className: 'catalog-group__summary' });
    summary.append(
      element('span', { text: `Period ${group.period}` }),
      // Keeps the period and the count apart in the accessible name.
      element('span', { className: 'visually-hidden', text: ', ' }),
      element('span', {
        className: 'catalog-group__count',
        text: countText(group.components.length),
      }),
    );
    const list = element('ul', { className: 'catalog-group__list' });
    details.append(summary, list);
    let built = false;
    const open = (): void => {
      if (!built) {
        built = true;
        list.append(...group.components.map(createEntry));
      }
      details.open = true;
    };
    details.addEventListener('toggle', () => {
      if (details.open) open();
    });
    for (const component of group.components) openers.set(component.id, open);
    if (group.openByDefault) open();
    return details;
  };

  root.append(
    element('h2', {
      className: 'eyebrow',
      text: 'Catalog',
      attributes: { id: 'catalog-panel-heading' },
    }),
    element('p', {
      className: 'catalog-panel__hint',
      text: 'Choose a component to zoom to it and inspect it.',
      attributes: { id: HINT_ID },
    }),
    ...options.groups.map(createGroup),
    createGlossary(),
  );

  return {
    element: root,
    setSelected: (id) => {
      if (id === selectedId) return;
      if (selectedId !== undefined) entries.get(selectedId)?.removeAttribute('aria-current');
      selectedId = id;
      if (id === undefined) return;
      openers.get(id)?.();
      entries.get(id)?.setAttribute('aria-current', 'true');
    },
  };
}
