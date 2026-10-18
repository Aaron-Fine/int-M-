import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  appendPartial,
  claimPartial,
  completedCases,
  mergeSamples,
  readPartial,
} from '../../../tools/benchmark/harness/checkpoint.ts';

const sample = (caseId: string, repetition: number, arm: string) => ({
  caseId,
  repetition,
  arm,
  wallMs: 1,
});

describe('checkpoint', () => {
  it('merges without duplicating a (case, rep, arm) cell', () => {
    const merged = mergeSamples(
      [sample('a', 0, 'hook')],
      [sample('a', 0, 'hook'), sample('a', 1, 'hook')],
    );
    expect(merged).toHaveLength(2);
  });

  it('a case is complete only when every rep × arm cell exists', () => {
    const samples = [sample('a', 0, 'hook'), sample('a', 0, 'plain'), sample('a', 1, 'hook')];
    expect(completedCases(samples, ['a'], 2, ['hook', 'plain']).has('a')).toBe(false);
    expect(
      completedCases([...samples, sample('a', 1, 'plain')], ['a'], 2, ['hook', 'plain']).has('a'),
    ).toBe(true);
  });

  it('round-trips appended samples through the partial file', () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'harness-')), '.partial-chromium.json');
    expect(readPartial(file)).toEqual([]);
    appendPartial(file, [sample('a', 0, 'hook')]);
    appendPartial(file, [sample('a', 0, 'hook'), sample('b', 0, 'hook')]);
    expect(readPartial(file)).toHaveLength(2);
  });
});

describe('partial protocol header', () => {
  const header = {
    release: true,
    reps: 23,
    arms: ['hook', 'plain'],
    commit: 'abc1234',
    caseIds: ['a', 'b'],
  };
  const fresh = () => path.join(mkdtempSync(path.join(tmpdir(), 'harness-')), '.partial.json');

  it('writes the header on first claim and keeps it across appends', () => {
    const file = fresh();
    claimPartial(file, header);
    appendPartial(file, [sample('a', 0, 'hook')]);
    expect(() => claimPartial(file, header)).not.toThrow();
    expect(readPartial(file)).toHaveLength(1);
  });

  it.each([
    ['release', { ...header, release: false }],
    ['reps', { ...header, reps: 22 }],
    ['arms', { ...header, arms: ['hook'] }],
    ['commit', { ...header, commit: 'def5678' }],
    ['caseIds', { ...header, caseIds: ['a'] }],
  ])('refuses to resume when %s differs', (field, other) => {
    const file = fresh();
    claimPartial(file, header);
    expect(() => claimPartial(file, other)).toThrow(
      new RegExp(`different protocol \\(${field} differs`),
    );
  });

  it('refuses a headerless partial from before the header existed', () => {
    const file = fresh();
    writeFileSync(file, JSON.stringify([sample('a', 0, 'hook')]));
    expect(() => claimPartial(file, header)).toThrow(/no protocol header/);
  });
});
