import { parseBenchmarkParams } from './benchmark-params';
import {
  DEFAULT_SHARE_STATE,
  decodeShareState,
  encodeShareState,
  SHARE_KEYS,
  type ShareDecodeResult,
  type ShareFieldIssue,
  type ShareState,
} from './share-state';

/**
 * How the application starts from its address and keeps that address current
 * (ADR 0009). The benchmark harness parameters (`perf`, and `view`/`quality`
 * without `v`) keep their meaning; a v1 link takes precedence over them; and
 * `perf=1` stays an orthogonal diagnostic switch that is never copied into a
 * shared link.
 */

export interface StartupState extends ShareState {
  /** `?perf=1`: expose the render-trace diagnostic hook. */
  readonly perfEnabled: boolean;
  /** Shown and announced when the link could not be used as written. */
  readonly notice?: string | undefined;
}

/** The harness `quality` key, which the v1 `q` replaces when the address is rewritten. */
const LEGACY_SHARE_KEYS = ['quality'] as const;

const DEFAULT_VIEW_SUFFIX = 'Opening the default full-set view instead.';

const ISSUE_TEXT: Readonly<Record<ShareFieldIssue, string>> = Object.freeze({
  viewport: 'the view position was not valid, so the full-set view is shown',
  'zoom-clamped':
    'the zoom was outside the supported range, so the nearest supported zoom is shown',
  view: 'the interior view was not recognized, so Stability is shown',
  quality: 'the quality was not recognized, so Balanced is used',
  selection: 'the selected point or component was not found, so nothing is selected',
});

export const rejectionNotice = (
  result: Extract<ShareDecodeResult, { kind: 'rejected' }>,
): string => {
  if (result.reason === 'missing-version') {
    return `This link has no format version, so it was not applied. ${DEFAULT_VIEW_SUFFIX}`;
  }
  return result.version === undefined
    ? `This link uses an unrecognized format, so it was not applied. ${DEFAULT_VIEW_SUFFIX}`
    : `This link uses format version ${result.version}, which this explorer does not read. ${DEFAULT_VIEW_SUFFIX}`;
};

export const issuesNotice = (issues: readonly ShareFieldIssue[]): string =>
  `This link was adjusted: ${issues.map((issue) => ISSUE_TEXT[issue]).join('; ')}.`;

/** The state the application mounts with, from `window.location.search`. */
export const resolveStartupState = (search: string): StartupState => {
  const benchmark = parseBenchmarkParams(search);
  const shared = decodeShareState(search);
  switch (shared.kind) {
    case 'absent':
      return {
        ...DEFAULT_SHARE_STATE,
        viewport: benchmark.viewport ?? DEFAULT_SHARE_STATE.viewport,
        qualityProfile: benchmark.qualityProfile ?? DEFAULT_SHARE_STATE.qualityProfile,
        perfEnabled: benchmark.perfEnabled,
      };
    case 'rejected':
      return {
        ...DEFAULT_SHARE_STATE,
        perfEnabled: benchmark.perfEnabled,
        notice: rejectionNotice(shared),
      };
    case 'decoded':
      return {
        ...shared.state,
        perfEnabled: benchmark.perfEnabled,
        ...(shared.issues.length > 0 ? { notice: issuesNotice(shared.issues) } : {}),
      };
  }
};

/**
 * The address-bar query for `state`: every parameter the schema does not own
 * (for example `perf=1`), in original order but re-serialised (`%20` becomes
 * `+`, a bare `flag` becomes `flag=`), followed by the v1 fields.
 * Returns "" or a string starting with "?", comparable to `location.search`.
 */
export const addressBarSearch = (currentSearch: string, state: ShareState): string => {
  const kept = new URLSearchParams(currentSearch);
  for (const key of [...SHARE_KEYS, ...LEGACY_SHARE_KEYS]) kept.delete(key);
  const parts = [kept.toString(), encodeShareState(state)].filter((part) => part !== '');
  return parts.length === 0 ? '' : `?${parts.join('&')}`;
};

/**
 * False when `encodeShareState` would throw for `state`: a non-finite centre
 * or span (panning is unbounded), or a non-finite point selection. The
 * address bar is then left as it is.
 */
export const isEncodableShareState = (state: ShareState): boolean => {
  const { center, spanY } = state.viewport;
  const pointFinite = (point: { readonly re: number; readonly im: number }): boolean =>
    Number.isFinite(point.re) && Number.isFinite(point.im);
  const selection = state.selection;
  return (
    pointFinite(center) &&
    Number.isFinite(spanY) &&
    (selection?.kind !== 'point' || pointFinite(selection.point))
  );
};

/** The link the copy control places on the clipboard: the v1 fields only. */
export const shareLink = (origin: string, pathname: string, state: ShareState): string => {
  const query = encodeShareState(state);
  return `${origin}${pathname}${query === '' ? '' : `?${query}`}`;
};
