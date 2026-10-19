import type { AngledAddressStep } from '../catalog/schema';
import { element } from './dom';

/** The parts of an angled internal address step the chain draws. */
export type AddressStep = AngledAddressStep;

const angle = (step: AddressStep): string =>
  `${step.rotation.numerator}/${step.rotation.denominator}`;

/** The spoken form: "1, to 3 at angle 1/3, to 6 at angle 1/2". */
export function spokenAngledAddress(steps: readonly AddressStep[]): string {
  const first = steps[0];
  if (first === undefined) return '';
  return [
    String(first.fromPeriod),
    ...steps.map((s) => `to ${s.toPeriod} at angle ${angle(s)}`),
  ].join(', ');
}

/** The visual chain as text runs; a run with `sub` is the rotation set under its arrow. */
export interface AddressRun {
  readonly text: string;
  readonly sub?: string;
}

export function angledAddressRuns(steps: readonly AddressStep[]): AddressRun[] {
  const first = steps[0];
  if (first === undefined) return [];
  return [
    { text: String(first.fromPeriod) },
    ...steps.flatMap((step): AddressRun[] => [
      { text: ' →', sub: angle(step) },
      { text: ` ${step.toPeriod}` },
    ]),
  ];
}

/**
 * An angled internal address in Schleicher's notation, 1 →₁/₃ 3 →₁/₂ 6: the
 * rotation is a subscript on each arrow. The visual chain is hidden from
 * assistive technology and a visually hidden span speaks it instead.
 */
export function angledAddressChain(steps: readonly AddressStep[]): HTMLElement {
  const visual = element('span', {
    className: 'angled-address__chain',
    attributes: { 'aria-hidden': 'true' },
  });
  for (const run of angledAddressRuns(steps)) {
    visual.append(run.text);
    if (run.sub !== undefined) visual.append(element('sub', { text: run.sub }));
  }
  const root = element('span', { className: 'angled-address' });
  root.append(
    visual,
    element('span', { className: 'visually-hidden', text: spokenAngledAddress(steps) }),
  );
  return root;
}
