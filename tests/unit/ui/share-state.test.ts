import { describe, expect, it } from 'vitest';

import { COMPONENT_CATALOG } from '../../../src/catalog/components';
import { V1_CATALOG } from '../catalog/v1-catalog';
import { MAX_VIEWPORT_SPAN_Y, MIN_VIEWPORT_SPAN_Y } from '../../../src/domain';
import {
  DEFAULT_SHARE_STATE,
  decodeShareState,
  encodeShareState,
  formatShareDecimal,
  MAX_DECIMAL_LENGTH,
  parseShareDecimal,
  type ShareFieldIssue,
  type ShareState,
} from '../../../src/ui/share-state';

/** Decodes a link that must be v1, failing the test otherwise. */
const v1 = (search: string): { state: ShareState; issues: readonly ShareFieldIssue[] } => {
  const result = decodeShareState(search);
  if (result.kind !== 'decoded') throw new Error(`${search} was ${result.kind}, not decoded`);
  return { state: result.state, issues: result.issues };
};

const DEEP_VIEW: ShareState = {
  viewport: { center: { re: -0.1592, im: -1.0344 }, spanY: 0.0198 },
  semanticView: 'multiplier',
  qualityProfile: 'detailed',
  selection: { kind: 'catalog', id: 'mi-p3-1-2' },
};

describe('share decimals', () => {
  it('round-trips binary64 values exactly through the shortest decimal', () => {
    for (const value of [
      -0.75,
      0,
      2.5,
      0.1,
      0.1 + 0.2,
      1 / 3,
      Math.PI,
      -1.7548776662466927,
      -0.12345678901234568,
      MIN_VIEWPORT_SPAN_Y,
      MAX_VIEWPORT_SPAN_Y,
      1e21,
      -1.25e-12,
      Number.MAX_VALUE,
      Number.MIN_VALUE,
    ]) {
      expect(parseShareDecimal(formatShareDecimal(value)), String(value)).toBe(value);
    }
  });

  it('writes negative zero as 0 and never writes a "+"', () => {
    expect(formatShareDecimal(-0)).toBe('0');
    expect(formatShareDecimal(1e21)).toBe('1e21');
    expect(formatShareDecimal(Number.MAX_VALUE)).toBe('1.7976931348623157e308');
    expect(formatShareDecimal(MIN_VIEWPORT_SPAN_Y)).toBe('4.1666666666666667e-7');
  });

  it('refuses to encode a non-finite value', () => {
    expect(() => formatShareDecimal(Number.NaN)).toThrow(RangeError);
    expect(() => formatShareDecimal(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  it('accepts strict decimal forms only', () => {
    expect(parseShareDecimal('-.5')).toBe(-0.5);
    expect(parseShareDecimal('5.')).toBe(5);
    expect(parseShareDecimal('+1')).toBe(1);
    expect(parseShareDecimal('1E-3')).toBe(0.001);
    for (const text of [
      '',
      ' 1',
      '1 ',
      '.',
      '+',
      '--1',
      '1e',
      '1,5',
      '0x10',
      'NaN',
      'Infinity',
      '1e400',
      '-1e400',
    ]) {
      expect(parseShareDecimal(text), JSON.stringify(text)).toBeUndefined();
    }
  });

  it('rounds a huge-precision decimal to the nearest binary64 value', () => {
    expect(parseShareDecimal('-0.75000000000000000000000000000001')).toBe(-0.75);
    expect(parseShareDecimal('0.1000000000000000055511151231257827')).toBe(0.1);
  });

  it('rejects decimals longer than MAX_DECIMAL_LENGTH', () => {
    expect(parseShareDecimal(`0.${'1'.repeat(MAX_DECIMAL_LENGTH - 2)}`)).toBeCloseTo(1 / 9, 15);
    expect(parseShareDecimal(`0.${'1'.repeat(MAX_DECIMAL_LENGTH - 1)}`)).toBeUndefined();
  });
});

describe('decodeShareState', () => {
  it('is absent when no share field is present', () => {
    for (const search of [
      '',
      '?',
      '?perf=1',
      '?utm_source=mail',
      '?view=-0.75,0,2.5&quality=detailed',
      '?perf=1&view=not-a-view&quality=detailed',
      '?view=',
    ]) {
      expect(decodeShareState(search), search).toEqual({ kind: 'absent' });
    }
  });

  it('rejects share fields that carry no version', () => {
    for (const search of [
      '?c=-1,0&s=0.5',
      '?s=0.5',
      '?q=detailed',
      '?sel=mi-p2-basilica',
      '?view=period',
      '?perf=1&c=-1,0',
    ]) {
      expect(decodeShareState(search), search).toEqual({
        kind: 'rejected',
        reason: 'missing-version',
      });
    }
  });

  it('rejects every version other than exactly 1 and never reinterprets it', () => {
    const rejected = (version?: string) => ({
      kind: 'rejected',
      reason: 'unsupported-version',
      version,
    });
    expect(decodeShareState('?v=0&c=-1,0&s=0.5&view=period')).toEqual(rejected('0'));
    expect(decodeShareState('?v=2&c=-1,0&s=0.5')).toEqual(rejected('2'));
    expect(decodeShareState('?v=01')).toEqual(rejected('01'));
    expect(decodeShareState('?v=')).toEqual(rejected());
    expect(decodeShareState('?v=1.0')).toEqual(rejected());
    expect(decodeShareState('?v=99999')).toEqual(rejected());
    expect(decodeShareState('?v=1&v=1')).toEqual(rejected());
    expect(decodeShareState('?v=%3Cb%3E1%3C%2Fb%3E')).toEqual(rejected());
  });

  it('decodes a complete v1 link exactly', () => {
    expect(
      decodeShareState(
        '?v=1&c=-0.1592,-1.0344&s=0.0198&view=multiplier&q=detailed&sel=mi-p3-rabbit',
      ),
    ).toEqual({ kind: 'decoded', state: DEEP_VIEW, issues: [] });
  });

  it('resolves every v1 catalog id to its canonical id without an issue (ADR 0011)', () => {
    for (const entry of V1_CATALOG) {
      expect(v1(`?v=1&sel=${entry.v1Id}`), entry.v1Id).toEqual({
        state: { ...DEFAULT_SHARE_STATE, selection: { kind: 'catalog', id: entry.id } },
        issues: [],
      });
    }
  });

  it('treats absent optional fields as their defaults without an issue', () => {
    expect(v1('?v=1')).toEqual({ state: DEFAULT_SHARE_STATE, issues: [] });
    expect(v1('v=1&view=period')).toEqual({
      state: { ...DEFAULT_SHARE_STATE, semanticView: 'period' },
      issues: [],
    });
  });

  it('decodes a selected point as an exact pair', () => {
    expect(v1('?v=1&c=-0.75,0&s=2.5&sel=-0.1,0.65').state.selection).toEqual({
      kind: 'point',
      point: { re: -0.1, im: 0.65 },
    });
  });

  it.each([
    ['?v=1&c=abc,0&s=2.5', ['viewport'], {}],
    ['?v=1&c=-1&s=0.5', ['viewport'], {}],
    ['?v=1&c=-1,0,1&s=0.5', ['viewport'], {}],
    ['?v=1&c=-1,&s=0.5', ['viewport'], {}],
    ['?v=1&c=-1,0', ['viewport'], {}],
    ['?v=1&s=0.5', ['viewport'], {}],
    ['?v=1&c=-1,0&s=0', ['viewport'], {}],
    ['?v=1&c=-1,0&s=-0.5', ['viewport'], {}],
    ['?v=1&c=-1,0&s=NaN', ['viewport'], {}],
    ['?v=1&c=1e400,0&s=0.5', ['viewport'], {}],
    ['?v=1&c=+1,0&s=0.5', ['viewport'], {}],
    ['?v=1&c=-1,0&c=1,0&s=0.5', ['viewport'], {}],
    ['?v=1&view=sparkle', ['view'], {}],
    ['?v=1&view=Period', ['view'], {}],
    ['?v=1&view=', ['view'], {}],
    ['?v=1&view=-1,0,0.5', ['view'], {}],
    ['?v=1&view=period&view=multiplier', ['view'], {}],
    ['?v=1&q=ultra', ['quality'], {}],
    ['?v=1&q=Balanced', ['quality'], {}],
    ['?v=1&sel=mi-p9-nope', ['selection'], {}],
    ['?v=1&sel=mi-p4-1-3', ['selection'], {}],
    ['?v=1&sel=MI-P2-BASILICA', ['selection'], {}],
    ['?v=1&sel=-0.1', ['selection'], {}],
    ['?v=1&sel=-0.1,abc', ['selection'], {}],
    ['?v=1&sel=', ['selection'], {}],
    [
      '?v=1&c=abc,0&s=0.5&view=period&q=ultra&sel=mi-p2-basilica',
      ['viewport', 'quality'],
      { semanticView: 'period', selection: { kind: 'catalog', id: 'mi-p2-1-2' } },
    ],
  ] as const)('falls back field by field for %s', (search, issues, kept) => {
    expect(v1(search)).toEqual({ state: { ...DEFAULT_SHARE_STATE, ...kept }, issues });
  });

  it('clamps a span outside the zoom bounds, keeps the centre, and says so', () => {
    expect(v1('?v=1&c=-1,0.25&s=1e-12')).toEqual({
      state: {
        ...DEFAULT_SHARE_STATE,
        viewport: { center: { re: -1, im: 0.25 }, spanY: MIN_VIEWPORT_SPAN_Y },
      },
      issues: ['zoom-clamped'],
    });
    expect(v1('?v=1&c=-1,0.25&s=100').state.viewport.spanY).toBe(MAX_VIEWPORT_SPAN_Y);
    expect(v1('?v=1&c=-1,0.25&s=100').issues).toEqual(['zoom-clamped']);
  });

  it('accepts spans exactly at both zoom bounds without clamping', () => {
    for (const spanY of [MIN_VIEWPORT_SPAN_Y, MAX_VIEWPORT_SPAN_Y]) {
      expect(v1(`?v=1&c=-1,0&s=${formatShareDecimal(spanY)}`)).toEqual({
        state: { ...DEFAULT_SHARE_STATE, viewport: { center: { re: -1, im: 0 }, spanY } },
        issues: [],
      });
    }
  });

  it('ignores parameters the schema does not own, including the harness quality key', () => {
    expect(v1('?v=1&perf=1&utm_source=mail&quality=quick')).toEqual({
      state: DEFAULT_SHARE_STATE,
      issues: [],
    });
  });
});

describe('encodeShareState', () => {
  it('writes the default state as an empty query', () => {
    expect(encodeShareState(DEFAULT_SHARE_STATE)).toBe('');
    expect(
      encodeShareState({
        ...DEFAULT_SHARE_STATE,
        viewport: { center: { re: -0.75, im: -0 }, spanY: 2.5 },
      }),
    ).toBe('');
  });

  it('writes every field in schema order with exact decimals', () => {
    expect(encodeShareState(DEEP_VIEW)).toBe(
      'v=1&c=-0.1592,-1.0344&s=0.0198&view=multiplier&q=detailed&sel=mi-p3-1-2',
    );
  });

  it('writes the full viewport when only the view, quality or selection differs', () => {
    expect(encodeShareState({ ...DEFAULT_SHARE_STATE, semanticView: 'period' })).toBe(
      'v=1&c=-0.75,0&s=2.5&view=period&q=balanced',
    );
    expect(
      encodeShareState({
        ...DEFAULT_SHARE_STATE,
        selection: { kind: 'point', point: { re: -0.12345678901234568, im: 0.7 } },
      }),
    ).toBe('v=1&c=-0.75,0&s=2.5&view=stability&q=balanced&sel=-0.12345678901234568,0.7');
  });

  it('round-trips encodable states exactly', () => {
    const states: ShareState[] = [
      DEEP_VIEW,
      { ...DEFAULT_SHARE_STATE, qualityProfile: 'quick' },
      {
        viewport: { center: { re: 0.1 + 0.2, im: -1 / 3 }, spanY: MIN_VIEWPORT_SPAN_Y },
        semanticView: 'period',
        qualityProfile: 'balanced',
        selection: { kind: 'point', point: { re: Math.PI / 10, im: -0.12345678901234568 } },
      },
      {
        viewport: { center: { re: 12.5, im: -7 }, spanY: MAX_VIEWPORT_SPAN_Y },
        semanticView: 'stability',
        qualityProfile: 'detailed',
      },
      ...COMPONENT_CATALOG.map((component): ShareState => ({
        ...DEFAULT_SHARE_STATE,
        selection: { kind: 'catalog', id: component.id },
      })),
    ];
    for (const state of states) {
      const query = encodeShareState(state);
      expect(decodeShareState(`?${query}`), query).toEqual({ kind: 'decoded', state, issues: [] });
    }
  });

  it('round-trips the default state through the plain address', () => {
    expect(decodeShareState(`?${encodeShareState(DEFAULT_SHARE_STATE)}`)).toEqual({
      kind: 'absent',
    });
  });
});
