import { findInCatalog, type FindResult } from '../catalog/find';
import type { CatalogGroup } from '../catalog/navigation';
import type { CatalogComponent } from '../catalog/schema';
import { angledAddressChain } from './angled-address';
import { CATALOG_GLOSSARY } from './catalog-glossary';
import { referencesLine } from './references';
import { button, element } from './dom';

/**
 * The catalog panel (PHASE2-TODO items 6 and 7, MI-UX-020, ADR 0012 and
 * ADR 0014): a find field, then every entry grouped by period in catalog
 * order, each a button that zooms to its component and selects it. Groups are
 * native disclosures; a group's buttons are built the first time it opens, so
 * the 4,016-entry core costs nothing until then. The core arrives after the
 * first stable frame (addGroups); until then the panel lists the curated
 * periods and says that the rest is loading.
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
  /**
   * Shows "Zoomed to <label>." beside the list after a list activation, on
   * layouts where the canvas is above the panel (styles.css). It is not a
   * live region: the canvas toast already announces the zoom.
   */
  confirm(component: CatalogComponent): void;
}

const DESCRIPTION_ID = 'catalog-panel-hint';
const FIND_ID = 'catalog-find';
const FIND_HINT_ID = 'catalog-find-hint';
/** Quiet time before the match count is written (and announced) while typing. */
const COUNT_DELAY_MS = 400;

const countText = (count: number): string =>
  `${count.toLocaleString('en-US')} component${count === 1 ? '' : 's'}`;

const CORE_COUNT_SUFFIX: Readonly<Record<CatalogCoreState, string>> = {
  loading: ' Periods 5 to 12 are still loading.',
  ready: '',
  failed: ' Periods 5 to 12 could not be loaded.',
};

const resultText = (result: FindResult, core: CatalogCoreState): string => {
  const suffix = CORE_COUNT_SUFFIX[core];
  if (result.total === 0) return `No component matches.${suffix}`;
  if (result.matches.length < result.total) {
    return `${countText(result.total)} match; showing the first ${result.matches.length}.${suffix}`;
  }
  return `${countText(result.total)} ${result.total === 1 ? 'matches' : 'match'}.${suffix}`;
};

const CORE_STATE_TEXT: Readonly<Record<CatalogCoreState, string>> = {
  loading: 'Loading periods 5 to 12…',
  ready: '',
  failed: 'Periods 5 to 12 could not be loaded. Reload the page to try again.',
};

function createGlossary(): HTMLElement {
  const glossary = element('details', { className: 'catalog-glossary' });
  const terms = element('dl');
  for (const { term, definition, references } of CATALOG_GLOSSARY) {
    const description = element('dd');
    if (typeof definition === 'string') description.textContent = definition;
    else {
      for (const part of definition) {
        description.append(typeof part === 'string' ? part : angledAddressChain(part.address));
      }
    }
    const line = referencesLine(references, 'glossary__references');
    if (line !== undefined) description.append(line);
    terms.append(element('dt', { text: term }), description);
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
  /** Brings the canvas into view (the confirmation's button); focus stays put. */
  readonly onShowView: () => void;
}): CatalogPanel {
  const root = element('section', {
    className: 'catalog-panel',
    attributes: {
      'aria-labelledby': 'catalog-panel-heading',
      'aria-describedby': DESCRIPTION_ID,
      'data-catalog-core': 'loading',
    },
  });
  /** Group entries and find results by catalog id; either may be absent. */
  const entries = new Map<string, HTMLButtonElement>();
  const results = new Map<string, HTMLButtonElement>();
  const openers = new Map<string, () => void>();
  const searchable: CatalogComponent[] = [];
  const periods = new Set<number>();
  let selectedId: string | undefined;
  /** Set while the panel's own button activates an entry, so it is not scrolled away. */
  let activatingId: string | undefined;
  let confirmedId: string | undefined;
  let coreState: CatalogCoreState = 'loading';
  let countTimer: ReturnType<typeof setTimeout> | undefined;

  const createEntry = (
    component: CatalogComponent,
    registry: Map<string, HTMLButtonElement>,
  ): HTMLLIElement => {
    const entry = button(component.label, { className: 'catalog-entry' });
    entry.dataset['catalogId'] = component.id;
    if (component.id === selectedId) entry.setAttribute('aria-current', 'true');
    entry.addEventListener('click', () => {
      activatingId = component.id;
      try {
        options.onActivate(component);
      } finally {
        activatingId = undefined;
      }
    });
    registry.set(component.id, entry);
    const item = element('li');
    item.append(entry);
    return item;
  };

  const groupsBox = element('div', { className: 'catalog-panel__groups' });

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
        list.append(...group.components.map((component) => createEntry(component, entries)));
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

  const findInput = element('input', {
    className: 'catalog-find__input',
    attributes: {
      id: FIND_ID,
      type: 'search',
      autocomplete: 'off',
      spellcheck: 'false',
      'aria-describedby': FIND_HINT_ID,
      'aria-controls': 'catalog-find-results',
    },
  });
  const findCount = element('p', {
    className: 'catalog-find__count',
    attributes: { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' },
  });
  const resultList = element('ul', {
    className: 'catalog-find__results',
    attributes: { id: 'catalog-find-results', 'aria-label': 'Matching components' },
  });
  resultList.hidden = true;
  const coreStatus = element('p', {
    className: 'catalog-panel__status',
    text: CORE_STATE_TEXT.loading,
    // Filled at creation, so only the change to "could not be loaded" is announced.
    attributes: { role: 'status' },
  });
  const confirmationText = element('span', { className: 'catalog-panel__confirmation-text' });
  const showView = button('Show the view', { className: 'catalog-panel__show-view' });
  showView.addEventListener('click', () => {
    options.onShowView();
  });
  const confirmation = element('p', { className: 'catalog-panel__confirmation' });
  confirmation.append(confirmationText, showView);
  confirmation.hidden = true;

  const runFind = (): void => {
    const result = findInCatalog(searchable, findInput.value);
    if (countTimer !== undefined) clearTimeout(countTimer);
    // Rebuilding the results (the core landing, say) must not drop focus from one.
    const focused = document.activeElement;
    const focusedId =
      focused instanceof HTMLElement && resultList.contains(focused)
        ? focused.dataset['catalogId']
        : undefined;
    results.clear();
    if (result === undefined) {
      resultList.replaceChildren();
      resultList.hidden = true;
      groupsBox.hidden = false;
      findCount.textContent = '';
      return;
    }
    resultList.replaceChildren(
      ...result.matches.map((component) => createEntry(component, results)),
    );
    resultList.hidden = false;
    groupsBox.hidden = true;
    if (focusedId !== undefined) (results.get(focusedId) ?? findInput).focus();
    countTimer = setTimeout(() => {
      findCount.textContent = resultText(result, coreState);
    }, COUNT_DELAY_MS);
  };
  findInput.addEventListener('input', runFind);
  findInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || findInput.value === '') return;
    // Escape clears the field first; the document's Escape (legend isolation) waits.
    event.preventDefault();
    findInput.value = '';
    runFind();
  });

  const findField = element('div', { className: 'catalog-find' });
  findField.append(
    element('label', {
      className: 'catalog-find__label',
      text: 'Find a component',
      attributes: { for: FIND_ID },
    }),
    findInput,
    element('p', {
      className: 'catalog-find__hint',
      text: 'By name, id or rays, such as rabbit, mi-p4-6-9 or 6/15.',
      attributes: { id: FIND_HINT_ID },
    }),
    findCount,
  );

  const addGroups = (groups: readonly CatalogGroup[]): void => {
    for (const group of groups) {
      if (periods.has(group.period)) continue;
      periods.add(group.period);
      searchable.push(...group.components);
      const details = createGroup(group);
      const next = [...groupsBox.children].find(
        (child) => Number((child as HTMLElement).dataset['period']) > group.period,
      );
      groupsBox.insertBefore(details, next ?? null);
    }
    // No find here: the caller follows with setCoreState, which runs it once.
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
      attributes: { id: DESCRIPTION_ID },
    }),
    findField,
    resultList,
    groupsBox,
    // Where periods 5 to 12 will appear, so that nothing above moves when they do.
    coreStatus,
    confirmation,
    createGlossary(),
  );
  addGroups(options.groups);

  const mark = (id: string, current: boolean): void => {
    for (const registry of [entries, results]) {
      const entry = registry.get(id);
      if (current) entry?.setAttribute('aria-current', 'true');
      else entry?.removeAttribute('aria-current');
    }
  };

  return {
    element: root,
    setSelected: (id) => {
      if (id !== confirmedId) {
        confirmation.hidden = true;
        confirmedId = undefined;
      }
      if (id === selectedId) return;
      if (selectedId !== undefined) mark(selectedId, false);
      selectedId = id;
      if (id === undefined) return;
      openers.get(id)?.();
      mark(id, true);
      const entry = entries.get(id);
      const list = entry?.closest<HTMLElement>('.catalog-group__list');
      if (id !== activatingId && entry !== undefined && list !== null && list !== undefined) {
        revealWithin(list, entry);
      }
    },
    addGroups,
    setCoreState: (state) => {
      coreState = state;
      root.dataset['catalogCore'] = state;
      // With a query, the live find count already announces the failure; stay quiet.
      coreStatus.setAttribute('aria-live', findInput.value.trim() === '' ? 'polite' : 'off');
      coreStatus.textContent = CORE_STATE_TEXT[state];
      coreStatus.hidden = state === 'ready';
      if (findInput.value.trim() !== '') runFind();
    },
    confirm: (component) => {
      confirmedId = component.id;
      confirmationText.textContent = `Zoomed to ${component.label}.`;
      confirmation.hidden = false;
    },
  };
}
