import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertServes,
  parseCompare,
  servedRoot,
} from '../../../tools/benchmark/harness/compare.ts';

describe('parseCompare', () => {
  it('parses a query arm on the current build', () => {
    expect(parseCompare('mirrorOff=conjugateMirror=0', '/work')).toEqual({
      arm: { name: 'mirrorOff', hook: true, query: 'conjugateMirror=0' },
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
