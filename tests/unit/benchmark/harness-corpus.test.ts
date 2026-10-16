import { describe, expect, it } from 'vitest';
import {
  assertViewport,
  summarizeCase,
  urlFor,
} from '../../../tools/benchmark/harness/passes/corpus.ts';

const caseInfo = {
  id: 'mi-hard-supplied-126x',
  class: 'Hard known',
  center: { re: '-0.158902249', im: '-1.034028' },
  spanY: '0.019841269841269841269',
  profile: 'Detailed',
  designation: 'release-gate',
};

describe('corpus pass', () => {
  it('builds hook, plain, query, and dist arm URLs with exact decimal views', () => {
    const view = 'view=-0.158902249,-1.034028,0.019841269841269841269&quality=detailed';
    expect(urlFor('http://h', caseInfo, { name: 'hook', hook: true })).toBe(
      `http://h/?perf=1&${view}`,
    );
    expect(urlFor('http://h', caseInfo, { name: 'plain', hook: false })).toBe(`http://h/?${view}`);
    expect(
      urlFor('http://h', caseInfo, { name: 'mirrorOff', hook: true, query: 'conjugateMirror=0' }),
    ).toBe(`http://h/?perf=1&conjugateMirror=0&${view}`);
  });

  it('summarizes budgets, hook overhead, parity, and a compare arm from one sample set', () => {
    const samples = Array.from({ length: 22 }, (_, repetition) =>
      ['hook', 'plain', 'mirrorOff'].map((arm) => ({
        caseId: caseInfo.id,
        repetition,
        arm,
        climate: repetition === 0 ? 'cold' : 'warm',
        markWallMs: arm === 'mirrorOff' ? 500 : 400,
        stableMs: arm === 'plain' ? undefined : arm === 'mirrorOff' ? 480 : 380,
        coarseMs: arm === 'plain' ? undefined : 50,
        classifyMs: arm === 'plain' ? undefined : 300,
        hash: 'h',
        retriedAfterStall: false,
      })),
    ).flat();
    const arms = [
      { name: 'hook', hook: true },
      { name: 'plain', hook: false },
      { name: 'mirrorOff', hook: true, query: 'conjugateMirror=0' },
    ];
    const summary = summarizeCase(caseInfo, samples, arms, 11);
    expect(summary.budget).toEqual({ coarse: 'pass', stable: 'pass', stableBudgetMs: 600 });
    expect(summary.hookOverhead?.ratio).toBeCloseTo(1, 10);
    expect(summary.hashMismatches).toBe(0);
    expect(summary.compare['mirrorOff']?.wall?.ratio).toBeCloseTo(480 / 380, 10);
  });

  it('counts hash mismatches across arms and repetitions', () => {
    const samples = [0, 1].flatMap((repetition) =>
      ['hook', 'plain'].map((arm) => ({
        caseId: caseInfo.id,
        repetition,
        arm,
        climate: 'warm',
        markWallMs: 1,
        stableMs: 1,
        coarseMs: 1,
        classifyMs: 1,
        hash: arm === 'plain' && repetition === 1 ? 'x' : 'h',
        retriedAfterStall: false,
      })),
    );
    expect(
      summarizeCase(
        caseInfo,
        samples,
        [
          { name: 'hook', hook: true },
          { name: 'plain', hook: false },
        ],
        11,
      ).hashMismatches,
    ).toBe(1);
  });

  it('rejects a render whose achieved viewport is not the corpus view', () => {
    expect(() =>
      assertViewport(caseInfo, { center: { re: -0.75, im: 0 }, spanY: 2.5 }, 'previous'),
    ).toThrow(/previous.*did not apply \?view=/);
    expect(() =>
      assertViewport(
        caseInfo,
        { center: { re: -0.158902249, im: -1.034028 }, spanY: Number(caseInfo.spanY) },
        'hook',
      ),
    ).not.toThrow();
  });
});
