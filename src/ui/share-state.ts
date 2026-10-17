import type { Complex } from '../domain';
import { findCatalogComponent } from '../catalog/components';
import {
  DEFAULT_QUALITY_PROFILE_ID,
  DEFAULT_VIEWPORT,
  isDefaultViewport,
  MAX_SCALE,
  MIN_SCALE,
  QUALITY_PROFILES,
  SEMANTIC_VIEWS,
  type QualityProfileId,
  type SemanticView,
  type Viewport,
} from './view-state';

/**
 * Shareable view links, schema version 1 (ADR 0009, MI-UX-019).
 *
 * `?v=1&c=<re>,<im>&s=<spanY>&view=<semantic view>&q=<quality>&sel=<selection>`
 *
 * Numbers are written as the shortest decimal that reads back as the same
 * binary64 value, so a link reproduces the exact viewport. The version tag
 * covers both the field layout and their meaning: any change that would make
 * a v1 link show something else must bump it, and an unknown version is
 * rejected, never reinterpreted. This module is pure: no DOM, no history.
 */

export const SHARE_SCHEMA_VERSION = '1';

/** Every query key the v1 schema owns, in the order the encoder writes them. */
export const SHARE_KEYS = ['v', 'c', 's', 'view', 'q', 'sel'] as const;

/** Longest accepted decimal string; longer values are malformed, not rounded. */
export const MAX_DECIMAL_LENGTH = 400;

/** Strict decimal: optional sign, digits with optional fraction, optional exponent. */
const DECIMAL_PATTERN = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

/** A version string short and plain enough to repeat back in a notice. */
const PRINTABLE_VERSION_PATTERN = /^\d{1,4}$/;

export type ShareSelection =
  | { readonly kind: 'catalog'; readonly id: string }
  | { readonly kind: 'point'; readonly point: Complex };

export interface ShareState {
  readonly viewport: Viewport;
  readonly semanticView: SemanticView;
  readonly qualityProfile: QualityProfileId;
  readonly selection?: ShareSelection | undefined;
}

/** A v1 field that could not be used as written. */
export type ShareFieldIssue = 'viewport' | 'zoom-clamped' | 'view' | 'quality' | 'selection';

export type ShareDecodeResult =
  | { readonly kind: 'absent' }
  | {
      readonly kind: 'rejected';
      readonly reason: 'missing-version' | 'unsupported-version';
      /** The rejected version, only when it is safe to show (1–4 digits). */
      readonly version?: string | undefined;
    }
  | {
      readonly kind: 'decoded';
      readonly state: ShareState;
      readonly issues: readonly ShareFieldIssue[];
    };

export const DEFAULT_SHARE_STATE: ShareState = Object.freeze({
  viewport: DEFAULT_VIEWPORT,
  semanticView: 'stability',
  qualityProfile: DEFAULT_QUALITY_PROFILE_ID,
});

/**
 * The shortest decimal that reads back as exactly `value`. A positive
 * exponent drops its "+", because a query string decodes "+" as a space.
 */
export const formatShareDecimal = (value: number): string => {
  if (!Number.isFinite(value)) {
    throw new RangeError('share coordinates must be finite');
  }
  return String(value).replace('e+', 'e');
};

/**
 * Parses one strict decimal into the nearest binary64 value. Returns
 * undefined for anything else, including overflow to Infinity.
 */
export const parseShareDecimal = (text: string): number | undefined => {
  if (text.length > MAX_DECIMAL_LENGTH || !DECIMAL_PATTERN.test(text)) return undefined;
  const value = Number(text);
  return Number.isFinite(value) ? value : undefined;
};

const parsePair = (text: string): Complex | undefined => {
  const parts = text.split(',');
  if (parts.length !== 2) return undefined;
  const re = parseShareDecimal(parts[0] ?? '');
  const im = parseShareDecimal(parts[1] ?? '');
  return re === undefined || im === undefined ? undefined : { re, im };
};

const formatPair = (point: Complex): string =>
  `${formatShareDecimal(point.re)},${formatShareDecimal(point.im)}`;

/** The single value of `key`: `null` when absent, `undefined` when repeated. */
const singleValue = (params: URLSearchParams, key: string): string | null | undefined => {
  const values = params.getAll(key);
  if (values.length === 0) return null;
  return values.length === 1 ? values[0] : undefined;
};

const decodeViewport = (
  params: URLSearchParams,
): { viewport: Viewport; issues: ShareFieldIssue[] } => {
  const centerText = singleValue(params, 'c');
  const spanText = singleValue(params, 's');
  if (centerText === null && spanText === null) {
    return { viewport: DEFAULT_SHARE_STATE.viewport, issues: [] };
  }
  const center = typeof centerText === 'string' ? parsePair(centerText) : undefined;
  const span = typeof spanText === 'string' ? parseShareDecimal(spanText) : undefined;
  if (center === undefined || span === undefined || span <= 0) {
    return { viewport: DEFAULT_SHARE_STATE.viewport, issues: ['viewport'] };
  }
  const spanY = Math.min(MAX_SCALE, Math.max(MIN_SCALE, span));
  return { viewport: { center, spanY }, issues: spanY === span ? [] : ['zoom-clamped'] };
};

/** `fallback` when absent; the matching id; or undefined when malformed. */
const decodeChoice = <T extends string>(
  text: string | null | undefined,
  choices: readonly { readonly id: T }[],
  fallback: T,
): T | undefined => {
  if (text === null) return fallback;
  return choices.find((choice) => choice.id === text)?.id;
};

/** `null` when absent; the selection; or undefined when malformed or unknown. */
const decodeSelection = (text: string | null | undefined): ShareSelection | null | undefined => {
  if (text === null) return null;
  if (text === undefined) return undefined;
  if (text.includes(',')) {
    const point = parsePair(text);
    return point === undefined ? undefined : { kind: 'point', point };
  }
  return findCatalogComponent(text) === undefined ? undefined : { kind: 'catalog', id: text };
};

const decodeVersion1 = (params: URLSearchParams): ShareDecodeResult => {
  const { viewport, issues } = decodeViewport(params);
  const semanticView = decodeChoice(
    singleValue(params, 'view'),
    SEMANTIC_VIEWS,
    DEFAULT_SHARE_STATE.semanticView,
  );
  const qualityProfile = decodeChoice(
    singleValue(params, 'q'),
    QUALITY_PROFILES,
    DEFAULT_SHARE_STATE.qualityProfile,
  );
  const selection = decodeSelection(singleValue(params, 'sel'));
  if (semanticView === undefined) issues.push('view');
  if (qualityProfile === undefined) issues.push('quality');
  if (selection === undefined) issues.push('selection');
  return {
    kind: 'decoded',
    state: {
      viewport,
      semanticView: semanticView ?? DEFAULT_SHARE_STATE.semanticView,
      qualityProfile: qualityProfile ?? DEFAULT_SHARE_STATE.qualityProfile,
      ...(selection ? { selection } : {}),
    },
    issues,
  };
};

/**
 * True when the query carries v1 fields but no `v`. A bare `view=` only
 * counts when it names a semantic view: the benchmark harness's
 * `view=<re>,<im>,<spanY>` (src/ui/benchmark-params.ts) has no `v` either.
 */
const hasUnversionedShareFields = (params: URLSearchParams): boolean =>
  ['c', 's', 'q', 'sel'].some((key) => params.has(key)) ||
  SEMANTIC_VIEWS.some((view) => view.id === params.get('view'));

/**
 * Reads a share link from a location search string (with or without "?").
 *
 * - `absent`: no share fields; the caller applies its other defaults.
 * - `rejected`: share fields without `v`, or any `v` other than exactly "1";
 *   nothing in the link is applied.
 * - `decoded`: a v1 link. Each malformed field falls back to its default
 *   and is listed in `issues`; a span outside the zoom bounds is clamped
 *   and reported as `zoom-clamped`.
 */
export const decodeShareState = (search: string): ShareDecodeResult => {
  const params = new URLSearchParams(search);
  const versions = params.getAll('v');
  if (versions.length === 0) {
    return hasUnversionedShareFields(params)
      ? { kind: 'rejected', reason: 'missing-version' }
      : { kind: 'absent' };
  }
  const version = versions.length === 1 ? versions[0] : undefined;
  if (version !== SHARE_SCHEMA_VERSION) {
    return {
      kind: 'rejected',
      reason: 'unsupported-version',
      version:
        version !== undefined && PRINTABLE_VERSION_PATTERN.test(version) ? version : undefined,
    };
  }
  return decodeVersion1(params);
};

export const isDefaultShareState = (state: ShareState): boolean =>
  isDefaultViewport(state.viewport) &&
  state.semanticView === DEFAULT_SHARE_STATE.semanticView &&
  state.qualityProfile === DEFAULT_SHARE_STATE.qualityProfile &&
  state.selection === undefined;

const encodeSelection = (selection: ShareSelection): string =>
  selection.kind === 'catalog' ? encodeURIComponent(selection.id) : formatPair(selection.point);

/**
 * The v1 query for `state`, without the leading "?". The default state
 * encodes as "" so that the plain address opens it.
 */
export const encodeShareState = (state: ShareState): string => {
  if (isDefaultShareState(state)) return '';
  const fields = [
    `v=${SHARE_SCHEMA_VERSION}`,
    `c=${formatPair(state.viewport.center)}`,
    `s=${formatShareDecimal(state.viewport.spanY)}`,
    `view=${state.semanticView}`,
    `q=${state.qualityProfile}`,
  ];
  if (state.selection !== undefined) fields.push(`sel=${encodeSelection(state.selection)}`);
  return fields.join('&');
};
