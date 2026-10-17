import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MAX_COMPARE_DISTS,
  assertCompareDistLimit,
  assertServes,
  parseCompare,
  servedRoot,
} from '../../../tools/benchmark/harness/compare.ts';

describe('parseCompare', () => {
  it('parses a query arm on the current build', () => {
    expect(parseCompare('alt=quality=fast', '/work')).toEqual({
      arm: { name: 'alt', hook: true, query: 'quality=fast' },
    });
  });

  it('parses a dist arm and resolves a relative dir against the cwd', () => {
    expect(parseCompare('prev=dist:./dist-prev', '/work')).toEqual({
      arm: { name: 'prev', hook: true, dist: 'prev' },
      dist: { name: 'prev', dir: path.resolve('/work', 'dist-prev') },
    });
  });

  it('rejects malformed specs', () => {
    expect(() => parseCompare('nope', '/w')).toThrow(/--compare expects/);
    expect(() => parseCompare('=x', '/w')).toThrow(/--compare expects/);
    expect(() => parseCompare('a=', '/w')).toThrow(/--compare expects/);
  });

  it('rejects the reserved isolated name', () => {
    expect(() => parseCompare('isolated=quality=fast', '/w')).toThrow(/reserved/);
    expect(() => parseCompare('isolated=dist:./d', '/w')).toThrow(/reserved/);
  });
});

describe('assertCompareDistLimit', () => {
  const dist = (index: number) => parseCompare(`d${index}=dist:./d${index}`, '/work');

  it('accepts the 19 dists that fit the preview ports and ignores query arms', () => {
    const dists = Array.from({ length: MAX_COMPARE_DISTS }, (_, index) => dist(index));
    expect(() => assertCompareDistLimit(dists)).not.toThrow();
    const queries = Array.from({ length: 25 }, (_, index) =>
      parseCompare(`q${index}=a=b`, '/work'),
    );
    expect(() => assertCompareDistLimit(queries)).not.toThrow();
  });

  it('rejects a 20th dist, which would collide with the isolated build port', () => {
    const dists = Array.from({ length: MAX_COMPARE_DISTS + 1 }, (_, index) => dist(index));
    expect(() => assertCompareDistLimit(dists)).toThrow(/at most 19/);
  });
});

describe('served root', () => {
  it('resolves the outDir against the config root', () => {
    expect(servedRoot({ root: '/work', build: { outDir: 'dist' } })).toBe('/work/dist');
    expect(servedRoot({ root: '/work', build: { outDir: '/elsewhere/dist-prev' } })).toBe(
      '/elsewhere/dist-prev',
    );
  });

  it('refuses a compare arm that would serve a different build', () => {
    // The preview of /work/vite.config.ts serves /work/dist, not /work/dist-prev.
    expect(() =>
      assertServes('prev', { root: '/work', build: { outDir: 'dist' } }, '/work/dist-prev'),
    ).toThrow(/would serve \/work\/dist, not \/work\/dist-prev/);
    expect(() =>
      assertServes(
        'prev',
        { root: '/work', build: { outDir: '/work/dist-prev' } },
        '/work/dist-prev',
      ),
    ).not.toThrow();
  });
});
