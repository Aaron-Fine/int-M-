import { describe, expect, it } from 'vitest';

import { parseBenchmarkParams, parseViewParam } from '../../../src/ui/benchmark-params';
import { MIN_VIEWPORT_SPAN_Y } from '../../../src/domain';

describe('parseViewParam', () => {
  it('parses exact decimal strings once into a viewport', () => {
    expect(parseViewParam('-0.75,0,2.5')).toEqual({
      center: { re: -0.75, im: 0 },
      spanY: 2.5,
    });
  });

  it('accepts the 6,000,000x corpus span and exponent notation', () => {
    expect(parseViewParam('-1.25,0,0.00000041666666666666667')).toEqual({
      center: { re: -1.25, im: 0 },
      spanY: 2.5 / 6_000_000,
    });
    expect(parseViewParam('0.1,1e-2,2e-3')?.spanY).toBe(0.002);
  });

  it('rejects missing, malformed, and non-decimal parts', () => {
    expect(parseViewParam(null)).toBeUndefined();
    expect(parseViewParam('')).toBeUndefined();
    expect(parseViewParam('-0.75,0')).toBeUndefined();
    expect(parseViewParam('-0.75,0,2.5,extra')).toBeUndefined();
    expect(parseViewParam('-0.75,,2.5')).toBeUndefined();
    expect(parseViewParam('-0.75,0,')).toBeUndefined();
    expect(parseViewParam('abc,0,2.5')).toBeUndefined();
    expect(parseViewParam('-0.75,0x10,2.5')).toBeUndefined();
    expect(parseViewParam('NaN,0,2.5')).toBeUndefined();
    expect(parseViewParam('-0.75,Infinity,2.5')).toBeUndefined();
  });

  it('rejects spans outside the declared zoom envelope', () => {
    expect(parseViewParam('-0.75,0,0')).toBeUndefined();
    expect(parseViewParam('-0.75,0,-2.5')).toBeUndefined();
    expect(parseViewParam('-0.75,0,5')).toBeUndefined();
    expect(parseViewParam(`-0.75,0,${MIN_VIEWPORT_SPAN_Y / 2}`)).toBeUndefined();
    expect(parseViewParam(`-0.75,0,${MIN_VIEWPORT_SPAN_Y}`)).toBeDefined();
  });
});

describe('parseBenchmarkParams', () => {
  it('leaves every default untouched when no parameters are present', () => {
    const params = parseBenchmarkParams('');
    expect(params).toEqual({ perfEnabled: false });
    expect(Object.keys(params)).toEqual(['perfEnabled']);
  });

  it('enables perf diagnostics only for the exact ?perf=1 form', () => {
    expect(parseBenchmarkParams('?perf=1').perfEnabled).toBe(true);
    expect(parseBenchmarkParams('?perf=0').perfEnabled).toBe(false);
    expect(parseBenchmarkParams('?perf=true').perfEnabled).toBe(false);
    expect(parseBenchmarkParams('?perf=').perfEnabled).toBe(false);
  });

  it('enables the plan §8 counters sub-mode only under ?perf=1&perfCounters=1', () => {
    expect(parseBenchmarkParams('?perf=1&perfCounters=1').perfCounters).toBe(true);
    expect(parseBenchmarkParams('?perf=1').perfCounters).toBeUndefined();
    expect(parseBenchmarkParams('?perfCounters=1').perfCounters).toBeUndefined();
    expect(parseBenchmarkParams('?perf=0&perfCounters=1').perfCounters).toBeUndefined();
    expect(parseBenchmarkParams('?perf=1&perfCounters=0').perfCounters).toBeUndefined();
    expect(parseBenchmarkParams('').perfCounters).toBeUndefined();
  });

  it('accepts exactly the frozen classifier mode vocabulary', () => {
    expect(parseBenchmarkParams('?classifierMode=legacy-scan').classifierMode).toBe('legacy-scan');
    expect(parseBenchmarkParams('?classifierMode=checkpoint').classifierMode).toBe('checkpoint');
    expect(parseBenchmarkParams('?classifierMode=differential').classifierMode).toBe(
      'differential',
    );
    expect(parseBenchmarkParams('?classifierMode=Checkpoint').classifierMode).toBeUndefined();
    expect(parseBenchmarkParams('?classifierMode=bogus').classifierMode).toBeUndefined();
    expect(parseBenchmarkParams('?classifierMode=').classifierMode).toBeUndefined();
  });

  it('accepts exactly the shipping quality profile ids', () => {
    expect(parseBenchmarkParams('?quality=balanced').qualityProfile).toBe('balanced');
    expect(parseBenchmarkParams('?quality=detailed').qualityProfile).toBe('detailed');
    expect(parseBenchmarkParams('?quality=quick').qualityProfile).toBe('quick');
    expect(parseBenchmarkParams('?quality=Balanced').qualityProfile).toBeUndefined();
    expect(parseBenchmarkParams('?quality=ultra').qualityProfile).toBeUndefined();
  });

  it('parses every validated parameter together and ignores invalid ones', () => {
    const params = parseBenchmarkParams(
      '?perf=1&classifierMode=checkpoint&view=-0.158902249,-1.034028,0.019841269841269841269&quality=detailed',
    );
    expect(params.perfEnabled).toBe(true);
    expect(params.classifierMode).toBe('checkpoint');
    expect(params.viewport).toEqual({
      center: { re: -0.158902249, im: -1.034028 },
      spanY: Number('0.019841269841269841269'),
    });
    expect(params.qualityProfile).toBe('detailed');

    const partlyInvalid = parseBenchmarkParams(
      '?perf=1&classifierMode=bogus&view=not-a-view&quality=detailed',
    );
    expect(partlyInvalid.perfEnabled).toBe(true);
    expect(partlyInvalid.classifierMode).toBeUndefined();
    expect(partlyInvalid.viewport).toBeUndefined();
    expect(partlyInvalid.qualityProfile).toBe('detailed');
  });
});
