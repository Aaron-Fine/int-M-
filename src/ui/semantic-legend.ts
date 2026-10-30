import type { PeriodKey } from '../domain';
import { element, replaceChildren } from './dom';
import {
  legendModel,
  type LegendItem,
  type LegendScale,
  type LegendSwatch,
  type LegendTick,
} from './legend-model';
import {
  isolatedPeriodOf,
  nextDroppedPeriod,
  NO_ISOLATION,
  nextIsolation,
  outlinedPeriodOf,
  type IsolationEvent,
} from './period-isolation';
import type { SemanticView } from './view-state';

/** The legend's palette inputs: the period isolated (pressed) and the period outlined (previewed). */
export interface PeriodEmphasis {
  readonly isolated: number | undefined;
  readonly outlined: number | undefined;
}

export type IsolationListener = (emphasis: PeriodEmphasis) => void;

/** The stage of the frame whose key the legend shows. */
export type LegendFrameStage = 'coarse' | 'stable';

export interface SemanticLegend {
  readonly element: HTMLElement;
  /**
   * Shows `view`; in the period view `periodKey` is the key of the frame on
   * screen and `stage` its stage (only a stable frame can end a pressed
   * isolation).
   */
  readonly update: (view: SemanticView, periodKey?: PeriodKey, stage?: LegendFrameStage) => void;
  /** Called with the periods to isolate and to outline whenever either changes. */
  readonly onIsolate: (listener: IsolationListener) => void;
  /** Ends a pressed isolation (Escape outside the legend); a no-op without one. */
  readonly restore: () => void;
}

const ISOLATION_HINT =
  'Hover or focus a period to outline it; select it to show only that period. Escape or selecting it again shows all periods.';

const waitingHint = (period: number): string =>
  `Period ${period} stays isolated until the stable frame arrives; this preview does not rank it among the five largest.`;

const droppedNote = (period: number): string =>
  `Period ${period} is no longer among the five largest here.`;

const HINT_ID = 'legend-isolation-hint';

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
  if (scale.stripes !== undefined) {
    // Stripe samples: the light/dark pair the raster draws, at its pitch and angle.
    const samples = element('span', { className: 'legend__stripes' });
    for (const stripe of scale.stripes) {
      const tile = element('span', { className: 'legend__stripe' });
      const chip = element('span', { className: 'legend__stripe-chip' });
      chip.style.background = stripe.background;
      tile.append(chip, element('span', { className: 'legend__stripe-label', text: stripe.label }));
      samples.append(tile);
    }
    graphic.append(samples);
  }
  item.append(copyOf(scale.label, scale.detail), graphic);
  return item;
};

const swatchOf = (entry: LegendSwatch): HTMLElement => {
  const swatch = element('span', {
    className:
      entry.border === 'solid'
        ? 'legend__swatch'
        : `legend__swatch legend__swatch--${entry.border}`,
    attributes: { 'aria-hidden': 'true' },
  });
  swatch.style.background = entry.background;
  return swatch;
};

/** An emphasized period: a toggle button that isolates the period (MI-UX-018). */
const renderPeriodControl = (entry: LegendSwatch, period: number): HTMLLIElement => {
  const item = element('li', {
    className: 'legend__item legend__item--period legend__item--control',
  });
  item.dataset['period'] = String(period);
  const control = element('button', {
    className: 'legend__entry',
    // The accessible name comes from the visible label and detail.
    attributes: { type: 'button', 'aria-pressed': 'false', 'aria-describedby': HINT_ID },
  });
  control.dataset['period'] = String(period);
  // Visible, non-colour pressed state (forced colours included).
  const state = element('span', {
    className: 'legend__state',
    text: 'Isolated',
    attributes: { 'aria-hidden': 'true' },
  });
  control.append(swatchOf(entry), copyOf(entry.label, entry.detail), state);
  item.append(control);
  return item;
};

const renderSwatch = (entry: LegendSwatch): HTMLLIElement => {
  if (typeof entry.period === 'number') return renderPeriodControl(entry, entry.period);
  const item = element('li', {
    className: entry.period === undefined ? 'legend__item' : 'legend__item legend__item--period',
  });
  if (entry.period !== undefined) item.dataset['period'] = entry.period;
  item.append(swatchOf(entry), copyOf(entry.label, entry.detail));
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

const periodOf = (target: EventTarget | null): number | undefined => {
  if (!(target instanceof Element)) return undefined;
  const control = target.closest<HTMLElement>('.legend__entry');
  const value = control?.dataset['period'];
  return value === undefined ? undefined : Number(value);
};

export function createSemanticLegend(): SemanticLegend {
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
  const hint = element('p', {
    className: 'legend__hint',
    text: ISOLATION_HINT,
    attributes: { id: HINT_ID },
  });
  hint.hidden = true;
  // A polite live region, separate from the status line: it says why a pressed
  // isolation ended when a stable frame no longer lists the period.
  const dropped = element('p', {
    className: 'legend__dropped',
    attributes: { role: 'status', 'aria-live': 'polite' },
  });
  root.append(heading, definition, list, hint, dropped);

  let isolation = NO_ISOLATION;
  let notified: PeriodEmphasis = { isolated: undefined, outlined: undefined };
  let listener: IsolationListener | undefined;
  let shownView: SemanticView | undefined;
  let shown: string | undefined;
  let listed: readonly number[] = [];
  let redrawing = false;
  // The period whose entry a coarse frame took the focus from, until a later
  // frame lists it again (or focus goes elsewhere).
  let droppedPeriod: number | undefined;
  let lostFocus: number | undefined;
  list.tabIndex = -1;

  const controls = (): HTMLElement[] => [...list.querySelectorAll<HTMLElement>('.legend__entry')];

  const refreshHint = (): void => {
    const pressed = isolation.pressed;
    const waiting = pressed !== undefined && !listed.includes(pressed);
    hint.hidden = listed.length === 0 && !waiting;
    hint.textContent = waiting ? waitingHint(pressed) : ISOLATION_HINT;
  };

  const apply = (event: IsolationEvent): void => {
    const previous = isolation;
    isolation = nextIsolation(isolation, event);
    droppedPeriod = nextDroppedPeriod(droppedPeriod, previous, isolation, event);
    dropped.textContent = droppedPeriod === undefined ? '' : droppedNote(droppedPeriod);
    for (const control of controls()) {
      const pressed = Number(control.dataset['period']) === isolation.pressed;
      control.setAttribute('aria-pressed', String(pressed));
    }
    refreshHint();
    const emphasis: PeriodEmphasis = {
      isolated: isolatedPeriodOf(isolation),
      outlined: outlinedPeriodOf(isolation),
    };
    if (emphasis.isolated === notified.isolated && emphasis.outlined === notified.outlined) return;
    notified = emphasis;
    listener?.(emphasis);
  };

  const onPeriodEvent =
    (type: 'focus' | 'blur' | 'activate') =>
    (event: Event): void => {
      const period = periodOf(event.target);
      if (period !== undefined) apply({ type, period });
    };
  list.addEventListener('focusin', (event) => {
    if (periodOf(event.target) !== undefined) lostFocus = undefined;
    onPeriodEvent('focus')(event);
  });
  // A redraw removes the focused button; that focusout is not the user leaving.
  const onBlur = onPeriodEvent('blur');
  list.addEventListener('focusout', (event) => {
    if (redrawing) return;
    if (event.target === list) lostFocus = undefined;
    onBlur(event);
  });
  list.addEventListener('click', onPeriodEvent('activate'));
  // Hover previews with a mouse only: a tap focuses and activates instead.
  list.addEventListener('pointerover', (event) => {
    const period = periodOf(event.target);
    if (event.pointerType === 'mouse' && period !== undefined) apply({ type: 'hover', period });
  });
  list.addEventListener('pointerout', (event) => {
    const period = periodOf(event.target);
    const next = periodOf(event.relatedTarget);
    // Moving onto another entry is one change: its pointerover replaces the hover.
    if (period !== undefined && next === undefined) apply({ type: 'unhover', period });
  });
  list.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || isolatedPeriodOf(isolation) === undefined) return;
    event.preventDefault();
    apply({ type: 'escape' });
  });

  const redraw = (view: SemanticView, periodKey: PeriodKey | undefined): void => {
    if (view !== shownView) {
      apply({ type: 'reset' });
      lostFocus = undefined;
    }
    shownView = view;
    const activePeriod = periodOf(document.activeElement);
    // Focus parked on the list by an earlier redraw is still waiting for its entry.
    const focusedPeriod = activePeriod ?? (document.activeElement === list ? lostFocus : undefined);
    const model = legendModel(view, periodKey);
    definition.replaceChildren(model.definition);
    if (model.formula !== undefined) {
      definition.append(element('span', { className: 'legend__formula', text: model.formula }));
    }
    redrawing = true;
    try {
      replaceChildren(list, model.items.map(renderItem));
      listed = periodKey?.emphasized.map((entry) => entry.period) ?? [];
      apply({ type: 'available', periods: listed, final: false });
      const refocus = controls().find(
        (control) => Number(control.dataset['period']) === focusedPeriod,
      );
      // A focused entry that is gone hands focus to the list, not <body>, and
      // is remembered so a later frame that lists the period gets focus back.
      if (focusedPeriod !== undefined) {
        lostFocus = refocus === undefined ? focusedPeriod : undefined;
        (refocus ?? list).focus();
      }
    } finally {
      redrawing = false;
    }
  };

  const update = (
    view: SemanticView,
    periodKey?: PeriodKey,
    stage: LegendFrameStage = 'stable',
  ): void => {
    // Coarse and stable frames often share a key; skip identical redraws so
    // a focused entry keeps its focus.
    const signature = JSON.stringify([view, periodKey ?? null]);
    if (signature !== shown) {
      shown = signature;
      redraw(view, periodKey);
    }
    // Only a stable frame can end a pressed isolation (period-isolation.ts).
    if (stage === 'stable') apply({ type: 'available', periods: listed, final: true });
  };

  update('stability');
  return {
    element: root,
    update,
    onIsolate: (next) => {
      listener = next;
    },
    restore: () => {
      if (isolation.pressed !== undefined) apply({ type: 'escape' });
    },
  };
}
