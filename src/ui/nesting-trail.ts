import type { NestingStep } from '../catalog/nesting';
import type { CatalogComponent } from '../catalog/schema';
import { element, replaceChildren } from './dom';

/**
 * The nesting trail above the canvas (UI review Proposal C): the angled
 * internal address of the deepest catalog component around the view, in
 * Schleicher's notation 1 →₁/₃ 3 →₁/₂ 6. Each period is a button that zooms
 * to that component; the last is the current location.
 */
export interface NestingTrail {
  readonly element: HTMLElement;
  /** Redraws only when the steps change, keeping the focus on the same component. */
  show(steps: readonly NestingStep[]): void;
}

const angle = (step: NestingStep): string =>
  step.rotation === undefined ? '' : `${step.rotation.numerator}/${step.rotation.denominator}`;

const signature = (steps: readonly NestingStep[]): string =>
  steps.map((step) => `${angle(step)}:${step.period}:${step.component?.id ?? ''}`).join(' ');

export function createNestingTrail(onSelect: (component: CatalogComponent) => void): NestingTrail {
  const root = element('nav', {
    className: 'nesting-trail',
    attributes: { 'aria-label': 'Angled internal address of the view' },
  });
  const lead = element('span', {
    className: 'nesting-trail__lead',
    text: 'Address',
    attributes: { 'aria-hidden': 'true' },
  });
  const list = element('ol', { className: 'nesting-trail__steps' });
  root.append(lead, list);
  let shown = '';

  const renderStep = (step: NestingStep, current: boolean): HTMLLIElement => {
    const item = element('li', { className: 'nesting-trail__step' });
    if (step.rotation !== undefined) {
      const edge = element('span', {
        className: 'nesting-trail__edge',
        text: '→',
        attributes: { 'aria-hidden': 'true' },
      });
      edge.append(element('sub', { text: angle(step) }));
      item.append(
        edge,
        element('span', { className: 'visually-hidden', text: `at angle ${angle(step)}, ` }),
      );
    }
    const { component } = step;
    const node =
      component === undefined
        ? element('span', { className: 'nesting-trail__node', text: String(step.period) })
        : element('button', {
            className: 'nesting-trail__node',
            text: String(step.period),
            attributes: {
              type: 'button',
              'aria-label': `Zoom to ${component.label}, period ${step.period}`,
              'data-component-id': component.id,
            },
          });
    if (component !== undefined) node.addEventListener('click', () => onSelect(component));
    if (current) node.setAttribute('aria-current', 'location');
    item.append(node);
    return item;
  };

  return {
    element: root,
    show: (steps) => {
      const next = signature(steps);
      if (next === shown) return;
      shown = next;
      const active = document.activeElement;
      const focusedId =
        active instanceof HTMLElement && list.contains(active)
          ? active.dataset['componentId']
          : undefined;
      replaceChildren(
        list,
        steps.map((step, index) => renderStep(step, index === steps.length - 1)),
      );
      root.dataset['period'] = String(steps.at(-1)?.period ?? 1);
      if (focusedId !== undefined) {
        const buttons = [...list.querySelectorAll<HTMLElement>('button')];
        // If the focused step left the trail, the focus stays in it, on the deepest step.
        (
          buttons.find((button) => button.dataset['componentId'] === focusedId) ?? buttons.at(-1)
        )?.focus();
      }
    },
  };
}
