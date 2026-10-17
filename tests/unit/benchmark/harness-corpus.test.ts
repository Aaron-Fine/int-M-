import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Session } from '../../../tools/benchmark/harness/session.ts';
import type { CorpusDriver } from '../../../tools/benchmark/harness/passes/corpus.ts';
import {
  assertViewport,
  hookOverheadVerdict,
  runCorpusPass,
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
    expect(urlFor('http://h', caseInfo, { name: 'alt', hook: true, query: 'alt=1' })).toBe(
      `http://h/?perf=1&alt=1&${view}`,
    );
  });

  it('summarizes budgets, hook overhead, parity, and a compare arm from one sample set', () => {
    const samples = Array.from({ length: 22 }, (_, repetition) =>
      ['hook', 'plain', 'alt'].map((arm) => ({
        caseId: caseInfo.id,
        repetition,
        arm,
        climate: repetition === 0 ? 'cold' : 'warm',
        markWallMs: arm === 'alt' ? 500 : 400,
        stableMs: arm === 'plain' ? undefined : arm === 'alt' ? 480 : 380,
        coarseMs: arm === 'plain' ? undefined : 50,
        classifyMs: arm === 'plain' ? undefined : 300,
        hash: 'h',
        retriedAfterStall: false,
      })),
    ).flat();
    const arms = [
      { name: 'hook', hook: true },
      { name: 'plain', hook: false },
      { name: 'alt', hook: true, query: 'alt=1' },
    ];
    const summary = summarizeCase(caseInfo, samples, arms, 11);
    expect(summary.budget).toEqual({ coarse: 'pass', stable: 'pass', stableBudgetMs: 600 });
    expect(summary.hookOverhead?.ratio).toBeCloseTo(1, 10);
    expect(summary.hashMismatches).toBe(0);
    expect(summary.compare['alt']?.wall?.ratio).toBeCloseTo(480 / 380, 10);
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

  it('keeps compare-arm hash differences out of parity but reports them per arm', () => {
    const samples = [0, 1].flatMap((repetition) =>
      ['hook', 'plain', 'alt'].map((arm) => ({
        caseId: caseInfo.id,
        repetition,
        arm,
        climate: 'warm',
        markWallMs: 1,
        stableMs: 1,
        coarseMs: 1,
        classifyMs: 1,
        hash: arm === 'alt' ? 'differs' : 'h',
        retriedAfterStall: false,
      })),
    );
    const summary = summarizeCase(
      caseInfo,
      samples,
      [
        { name: 'hook', hook: true },
        { name: 'plain', hook: false },
        { name: 'alt', hook: true, query: 'alt=1' },
      ],
      11,
    );
    expect(summary.hashMismatches).toBe(0);
    expect(summary.compare['alt']?.hashMismatches).toBe(2);
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

describe('hook overhead gate', () => {
  it('fails a release run when the pooled lower bound admits a hook more than 5% slower', () => {
    expect(hookOverheadVerdict({ interval: [0.94, 1.01] }, true)).toBe('fail');
  });

  it('passes a release run when the pooled lower bound is within the 5% bound', () => {
    expect(hookOverheadVerdict({ interval: [0.96, 1.02] }, true)).toBe('pass');
  });

  it('never gates a non-release run', () => {
    expect(hookOverheadVerdict({ interval: [0.86, 0.97] }, false)).toBe('not-gated');
  });
});

describe('runCorpusPass stalls', () => {
  const second = { ...caseInfo, id: 'second-case' };
  const arms = [
    { name: 'hook', hook: true },
    { name: 'plain', hook: false },
  ];
  const header = {
    release: false,
    reps: 3,
    arms: ['hook', 'plain'],
    commit: 'abc',
    caseIds: [caseInfo.id, second.id],
  };
  const timeout = (): Error => Object.assign(new Error('stalled\nlog'), { name: 'TimeoutError' });
  const stub = (stallOn: (caseId: string, repetition: number, arm: string) => boolean) => {
    const calls: string[] = [];
    let current = { caseId: '', repetition: -1 };
    const driver: CorpusDriver = {
      baseUrl: () => 'http://h',
      open: () =>
        Promise.resolve({ context: { close: () => Promise.resolve() }, page: {} } as never),
      capture: (_live, info, arm) => {
        if (current.caseId !== info.id) current = { caseId: info.id, repetition: -1 };
        if (arm.name === 'hook') current.repetition += 1;
        calls.push(`${info.id}:${current.repetition}:${arm.name}`);
        if (stallOn(info.id, current.repetition, arm.name)) return Promise.reject(timeout());
        return Promise.resolve({
          capture: {
            markWallMs: 10,
            hash: 'h',
            width: 1,
            height: 1,
            retriedAfterStall: false,
            ...(arm.hook
              ? {
                  viewport: {
                    center: { re: Number(info.center.re), im: Number(info.center.im) },
                    spanY: Number(info.spanY),
                  },
                  trace: {
                    frames: [{ stage: 'stable', source: 'computed', requestToPresentMs: 5 }],
                  },
                }
              : {}),
          },
          retried: false,
        });
      },
    };
    return { driver, calls };
  };
  const file = () => path.join(mkdtempSync(path.join(tmpdir(), 'corpus-')), '.partial-x.json');

  it('records a case that stalls twice as incomplete, skips its repetitions and continues', async () => {
    const { driver, calls } = stub(
      (id, repetition, arm) => id === caseInfo.id && repetition === 1 && arm === 'plain',
    );
    const result = await runCorpusPass({} as Session, [caseInfo, second], arms, 3, file(), false, {
      header,
      driver,
    });
    expect(result.incomplete).toHaveLength(1);
    expect(result.incomplete[0]).toMatchObject({ caseId: caseInfo.id, repetition: 1, stalls: 2 });
    expect(result.incomplete[0]?.reason).toMatch(/plain stalled twice at repetition 1: stalled/);
    expect(calls.filter((c) => c.startsWith(`${caseInfo.id}:2`))).toEqual([]);
    expect(calls.filter((c) => c.startsWith('second-case'))).toHaveLength(6);
    const stableTrace = result.samples.find((s) => s.arm === 'hook')?.trace;
    expect(stableTrace).toMatchObject({ stage: 'stable' });
    const summary = summarizeCase(caseInfo, result.samples, arms, 11, result.incomplete);
    expect(summary.incomplete?.reason).toMatch(/stalled twice/);
    expect(summary.stalls).toBeGreaterThanOrEqual(2);
    expect(
      summarizeCase(second, result.samples, arms, 11, result.incomplete).incomplete,
    ).toBeUndefined();
  });

  it('throws the resumable error when a stall happens on a locked session', async () => {
    const { driver } = stub((id) => id === caseInfo.id);
    await expect(
      runCorpusPass({} as Session, [caseInfo, second], arms, 3, file(), true, {
        header,
        driver,
        locked: () => true,
      }),
    ).rejects.toThrow(/session locked.*resume with --resume/);
  });

  it('refuses a partial file written under a different protocol', async () => {
    const partial = file();
    const { driver } = stub(() => false);
    await runCorpusPass({} as Session, [caseInfo, second], arms, 3, partial, false, {
      header,
      driver,
    });
    await expect(
      runCorpusPass({} as Session, [caseInfo, second], arms, 3, partial, false, {
        header: { ...header, reps: 4 },
        driver,
      }),
    ).rejects.toThrow(/different protocol \(reps differs/);
  });

  it('returns only samples of the selected cases and arms', async () => {
    const partial = file();
    const first = stub(() => false);
    await runCorpusPass({} as Session, [caseInfo, second], arms, 3, partial, false, {
      header,
      driver: first.driver,
    });
    const narrowed = await runCorpusPass(
      {} as Session,
      [caseInfo, second],
      arms,
      3,
      partial,
      false,
      {
        header,
        driver: first.driver,
      },
    );
    expect(narrowed.samples.every((s) => ['hook', 'plain'].includes(s.arm))).toBe(true);
    expect(narrowed.samples).toHaveLength(12);
  });
});
