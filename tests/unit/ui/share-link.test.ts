import { describe, expect, it } from 'vitest';

import { MIN_VIEWPORT_SPAN_Y } from '../../../src/domain';
import { addressBarSearch, resolveStartupState, shareLink } from '../../../src/ui/share-link';
import { DEFAULT_SHARE_STATE, type ShareState } from '../../../src/ui/share-state';

const BASILICA_VIEW: ShareState = {
  viewport: { center: { re: -1, im: 0 }, spanY: 0.5 },
  semanticView: 'period',
  qualityProfile: 'quick',
  selection: { kind: 'catalog', id: 'mi-p2-basilica' },
};
const BASILICA_QUERY = 'v=1&c=-1,0&s=0.5&view=period&q=quick&sel=mi-p2-basilica';
const DEFAULT_VIEW_SUFFIX = 'Opening the default full-set view instead.';

describe('resolveStartupState', () => {
  it('starts at the defaults without parameters and without a notice', () => {
    expect(resolveStartupState('')).toEqual({ ...DEFAULT_SHARE_STATE, perfEnabled: false });
    expect(resolveStartupState('').notice).toBeUndefined();
  });

  it('keeps the benchmark harness form working (ADR 0009)', () => {
    expect(
      resolveStartupState(
        '?perf=1&view=-0.158902249,-1.034028,0.019841269841269841269&quality=detailed',
      ),
    ).toEqual({
      ...DEFAULT_SHARE_STATE,
      viewport: {
        center: { re: -0.158902249, im: -1.034028 },
        spanY: Number('0.019841269841269841269'),
      },
      qualityProfile: 'detailed',
      perfEnabled: true,
    });
    expect(resolveStartupState('?view=-1,0,0.5&quality=quick')).toEqual({
      ...DEFAULT_SHARE_STATE,
      viewport: { center: { re: -1, im: 0 }, spanY: 0.5 },
      qualityProfile: 'quick',
      perfEnabled: false,
    });
  });

  it('restores a v1 link and keeps the perf hook orthogonal to it', () => {
    expect(resolveStartupState(`?${BASILICA_QUERY}`)).toEqual({
      ...BASILICA_VIEW,
      perfEnabled: false,
    });
    expect(resolveStartupState(`?perf=1&${BASILICA_QUERY}`)).toEqual({
      ...BASILICA_VIEW,
      perfEnabled: true,
    });
  });

  it('does not read a harness view triple or quality key inside a v1 link', () => {
    const startup = resolveStartupState('?v=1&view=-1,0,0.5&quality=detailed');
    expect(startup.viewport).toEqual(DEFAULT_SHARE_STATE.viewport);
    expect(startup.qualityProfile).toBe('balanced');
    expect(startup.notice).toBe(
      'This link was adjusted: the interior view was not recognized, so Stability is shown.',
    );
  });

  it('falls back to the defaults with a notice when the version is missing', () => {
    expect(resolveStartupState('?c=-1,0&s=0.5&view=period')).toEqual({
      ...DEFAULT_SHARE_STATE,
      perfEnabled: false,
      notice: `This link has no format version, so it was not applied. ${DEFAULT_VIEW_SUFFIX}`,
    });
  });

  it('falls back to the defaults with a notice naming an unsupported version', () => {
    expect(resolveStartupState('?perf=1&v=2&c=-1,0&s=0.5')).toEqual({
      ...DEFAULT_SHARE_STATE,
      perfEnabled: true,
      notice: `This link uses format version 2, which this explorer does not read. ${DEFAULT_VIEW_SUFFIX}`,
    });
    expect(resolveStartupState('?v=0&view=period').notice).toBe(
      `This link uses format version 0, which this explorer does not read. ${DEFAULT_VIEW_SUFFIX}`,
    );
  });

  it('never repeats an unprintable version back to the user', () => {
    const notice = resolveStartupState('?v=%3Cb%3Ex%3C%2Fb%3E').notice;
    expect(notice).toBe(
      `This link uses an unrecognized format, so it was not applied. ${DEFAULT_VIEW_SUFFIX}`,
    );
    expect(notice).not.toContain('<b>');
  });

  it('lists every adjusted field in one notice, in field order', () => {
    const startup = resolveStartupState('?v=1&c=-1,0&s=1e-12&q=ultra&sel=mi-p9-nope');
    expect(startup.viewport).toEqual({ center: { re: -1, im: 0 }, spanY: MIN_VIEWPORT_SPAN_Y });
    expect(startup.notice).toBe(
      'This link was adjusted: ' +
        'the zoom was outside the supported range, so the nearest supported zoom is shown; ' +
        'the quality was not recognized, so Balanced is used; ' +
        'the selected point or component was not found, so nothing is selected.',
    );
  });
});

describe('addressBarSearch', () => {
  it('leaves a plain address plain for the default state', () => {
    expect(addressBarSearch('', DEFAULT_SHARE_STATE)).toBe('');
    expect(addressBarSearch('?v=1&c=-1,0&s=0.5', DEFAULT_SHARE_STATE)).toBe('');
    expect(addressBarSearch('?perf=1', DEFAULT_SHARE_STATE)).toBe('?perf=1');
  });

  it('writes the v1 fields after the parameters the schema does not own', () => {
    expect(addressBarSearch('', BASILICA_VIEW)).toBe(`?${BASILICA_QUERY}`);
    expect(addressBarSearch('?perf=1', BASILICA_VIEW)).toBe(`?perf=1&${BASILICA_QUERY}`);
  });

  it('replaces the harness view triple and quality key with v1 fields', () => {
    expect(
      addressBarSearch('?perf=1&view=-1,0,0.5&quality=detailed', {
        ...DEFAULT_SHARE_STATE,
        viewport: { center: { re: -1, im: 0 }, spanY: 0.5 },
        qualityProfile: 'detailed',
      }),
    ).toBe('?perf=1&v=1&c=-1,0&s=0.5&view=stability&q=detailed');
  });

  it('drops stale v1 fields, including a selection that was cleared', () => {
    expect(
      addressBarSearch(`?utm_source=mail&${BASILICA_QUERY}`, {
        ...BASILICA_VIEW,
        selection: undefined,
      }),
    ).toBe('?utm_source=mail&v=1&c=-1,0&s=0.5&view=period&q=quick');
  });

  it('is stable: the address it writes restores the same state and rewrites to itself', () => {
    const search = addressBarSearch('?perf=1', BASILICA_VIEW);
    expect(resolveStartupState(search)).toEqual({ ...BASILICA_VIEW, perfEnabled: true });
    expect(addressBarSearch(search, BASILICA_VIEW)).toBe(search);
  });
});

describe('shareLink', () => {
  it('carries only the v1 fields, never perf or foreign parameters', () => {
    expect(shareLink('http://127.0.0.1:4174', '/', BASILICA_VIEW)).toBe(
      `http://127.0.0.1:4174/?${BASILICA_QUERY}`,
    );
  });

  it('is the plain address for the default state', () => {
    expect(shareLink('https://example.org', '/atlas/', DEFAULT_SHARE_STATE)).toBe(
      'https://example.org/atlas/',
    );
  });
});
