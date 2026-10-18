import type { CatalogGroup } from '../catalog/navigation';
import type { CatalogComponent } from '../catalog/schema';
import { CATALOG_GLOSSARY } from './catalog-glossary';
import { button, element } from './dom';

/**
 * The catalog panel (PHASE2-TODO items 6 and 7, MI-UX-020, ADR 0012 and
 * ADR 0014): every entry, grouped by period in catalog order, each a button
 * that zooms to its component and selects it. Groups are native disclosures;
 * a group's buttons are built the first time it opens, so the 4,016-entry
 * core costs nothing until then. Periods 5 to 12 arrive after the first
 * stable frame (addGroups); until then the panel lists the curated periods
 * and says that the rest is loading.
 */
export type CatalogCoreState = 'loading' | 'ready' | 'failed';

export interface CatalogPanel {
  readonly element: HTMLElement;
  /**
   * Marks the selected entry (aria-current) and opens its group; undefined
   * clears the mark. A selection the panel did not make itself (a marker, a
   * link) also scrolls its entry into view inside its list, without moving
   * focus or the page.
   */
  setSelected(id: string | undefined): void;
  /** Adds the groups of periods not listed yet; the groups already shown, and focus, stay. */
  addGroups(groups: readonly CatalogGroup[]): void;
  /** The line below the groups that says whether periods 5 to 12 have arrived. */
  setCoreState(state: CatalogCoreState): void;
}

const HINT_ID = 'catalog-panel-hint';

const countText = (count: number): string =>
  `${count.toLocaleString('en-US')} component${count === 1 ? '' : 's'}`;

const CORE_STATE_TEXT: Readonly<Record<CatalogCoreState, string>> = {
  loading: 'Loading periods 5 to 12…',
  ready: '',
  failed: 'Periods 5 to 12 could not be loaded. Reload the page to try again.',
};

function createGlossary(): HTMLElement {
  const glossary = element('details', { className: 'catalog-glossary' });
  const terms = element('dl');
  for (const { term, definition } of CATALOG_GLOSSARY) {
    terms.append(element('dt', { text: term }), element('dd', { text: definition }));
  }
  glossary.append(element('summary', { text: 'About periods, rays and addresses' }), terms);
  return glossary;
}

/** Scrolls `list` so that `item` is inside it, centred if it was outside; nothing else moves. */
function revealWithin(list: HTMLElement, item: HTMLElement): void {
  const top = item.offsetTop;
  const bottom = top + item.offsetHeight;
  if (top >= list.scrollTop && bottom <= list.scrollTop + list.clientHeight) return;
  list.scrollTop = Math.max(0, top - (list.clientHeight - item.offsetHeight) / 2);
}

export function createCatalogPanel(options: {
  readonly groups: readonly CatalogGroup[];
  readonly onActivate: (component: CatalogComponent) => void;
}): CatalogPanel {
  const root = element('section', {
    className: 'catalog-panel',
    attributes: {
      'aria-labelledby': 'catalog-panel-heading',
      'data-catalog-core': 'loading',
    },
  });
  const entries = new Map<string, HTMLButtonElement>();
  const openers = new Map<string, () => void>();
  const periods = new Set<number>();
  let selectedId: string | undefined;
  /** Set while one of the panel's own buttons activates an entry, so it is not scrolled away. */
  let activatingId: string | undefined;

  const createEntry = (component: CatalogComponent): HTMLLIElement => {
    const entry = button(component.label, { className: 'catalog-entry' });
    entry.dataset['catalogId'] = component.id;
    entry.setAttribute('aria-describedby', HINT_ID);
    if (component.id === selectedId) entry.setAttribute('aria-current', 'true');
    entry.addEventListener('click', () => {
      activatingId = component.id;
      try {
        options.onActivate(component);
      } finally {
        activatingId = undefined;
      }
    });
    entries.set(component.id, entry);
    const item = element('li');
    item.append(entry);
    return item;
  };

  const createGroup = (group: CatalogGroup): HTMLDetailsElement => {
    const details = element('details', { className: 'catalog-group' });
    details.dataset['period'] = String(group.period);
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

  const coreStatus = element('p', {
    className: 'catalog-panel__status',
    text: CORE_STATE_TEXT.loading,
  });
  const groupsBox = element('div', { className: 'catalog-panel__groups' });

  const addGroups = (groups: readonly CatalogGroup[]): void => {
    for (const group of groups) {
      if (periods.has(group.period)) continue;
      periods.add(group.period);
      const next = [...groupsBox.children].find(
        (child) => Number((child as HTMLElement).dataset['period']) > group.period,
      );
      groupsBox.insertBefore(createGroup(group), next ?? null);
    }
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
    groupsBox,
    // Where periods 5 to 12 will appear, so that nothing above moves when they do.
    coreStatus,
    createGlossary(),
  );
  addGroups(options.groups);

  return {
    element: root,
    setSelected: (id) => {
      if (id === selectedId) return;
      if (selectedId !== undefined) entries.get(selectedId)?.removeAttribute('aria-current');
      selectedId = id;
      if (id === undefined) return;
      openers.get(id)?.();
      const entry = entries.get(id);
      entry?.setAttribute('aria-current', 'true');
      const list = entry?.closest<HTMLElement>('.catalog-group__list');
      if (id !== activatingId && entry !== undefined && list !== null && list !== undefined) {
        revealWithin(list, entry);
      }
    },
    addGroups,
    setCoreState: (state) => {
      root.dataset['catalogCore'] = state;
      coreStatus.textContent = CORE_STATE_TEXT[state];
      coreStatus.hidden = state === 'ready';
    },
  };
}
