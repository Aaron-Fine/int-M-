import { REFERENCE_TABLE, type CatalogReference } from '../catalog/schema';
import { element } from './dom';

/** The label that opens a reference line. */
const REFERENCES_LABEL = 'References: ';
/** Between two links of a line. */
const REFERENCES_SEPARATOR = ' · ';

/** A link as the line draws it: the visible title, the target and the spoken suffix. */
export interface ReferenceLinkModel {
  readonly title: string;
  readonly href: string;
  readonly target: '_blank';
  readonly rel: 'noopener noreferrer';
  /** Visually hidden text after the title, so the link's name is "<title> – <source>, opens in a new tab". */
  readonly spokenSuffix: string;
}

/** A piece of the line: a text run or a link. */
export type ReferenceLineRun = string | ReferenceLinkModel;

/** The literature link of a key in the shared table; throws for a key the table lacks. */
function referenceFor(key: string): CatalogReference {
  const reference = Object.hasOwn(REFERENCE_TABLE, key) ? REFERENCE_TABLE[key] : undefined;
  if (reference === undefined) throw new Error(`unknown reference ${key}`);
  return reference;
}

export function referenceLinkModel(key: string): ReferenceLinkModel {
  const reference = referenceFor(key);
  return {
    title: reference.title,
    href: reference.url,
    target: '_blank',
    rel: 'noopener noreferrer',
    // Hidden text is positioned absolutely, so engines add a space before it; a spaced dash reads cleanly either way.
    spokenSuffix: ` – ${reference.source}, opens in a new tab`,
  };
}

/** The line's runs: the label, then the links separated by " · "; empty for no keys. */
export function referenceLineRuns(keys: readonly string[] | undefined): ReferenceLineRun[] {
  if (keys === undefined || keys.length === 0) return [];
  return [
    REFERENCES_LABEL,
    ...keys.flatMap((key, index) => [
      ...(index === 0 ? [] : [REFERENCES_SEPARATOR]),
      referenceLinkModel(key),
    ]),
  ];
}

function linkElement(model: ReferenceLinkModel): HTMLAnchorElement {
  const link = element('a', {
    className: 'reference-link',
    attributes: { href: model.href, target: model.target, rel: model.rel },
  });
  link.append(
    model.title,
    element('span', { className: 'visually-hidden', text: model.spokenSuffix }),
  );
  return link;
}

/** A `References: …` line with this class; undefined when there are none. */
export function referencesLine(
  keys: readonly string[] | undefined,
  className = 'inspector__references',
): HTMLElement | undefined {
  const runs = referenceLineRuns(keys);
  if (runs.length === 0) return undefined;
  const line = element('p', { className });
  line.append(...runs.map((run) => (typeof run === 'string' ? run : linkElement(run))));
  return line;
}
