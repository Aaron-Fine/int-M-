import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { writeEvidence } from '../../../tools/benchmark/harness/evidence.ts';

vi.mock('node:child_process', () => ({ spawnSync: vi.fn() }));

interface SpawnResult {
  status: number | null;
  stderr: string;
}

const parts = {
  engine: 'chromium',
  environment: {},
  raw: {},
  summaryHeader: '# Directional evidence session\n\nLabel: directional.',
  summarySections: ['## chromium\n'],
};

describe('writeEvidence exit-status checks', () => {
  let outDir: string;

  beforeEach(() => {
    outDir = mkdtempSync(path.join(os.tmpdir(), 'harness-evidence-'));
    vi.mocked(spawnSync).mockReset();
  });

  afterEach(() => {
    rmSync(outDir, { recursive: true, force: true });
  });

  it('throws naming capture-environment.mjs when it exits non-zero', () => {
    vi.mocked(spawnSync).mockImplementation(
      () => ({ status: 1, stderr: '' }) as unknown as ReturnType<typeof spawnSync>,
    );
    expect(() => writeEvidence(outDir, parts)).toThrow('capture-environment.mjs failed');
  });

  it('throws including prettier stderr when formatting exits non-zero', () => {
    vi.mocked(spawnSync).mockImplementation(((command: string, args: string[]) => {
      if (command === 'npx') {
        return { status: 1, stderr: 'prettier exploded' } satisfies SpawnResult;
      }
      const outIndex = args.indexOf('--out');
      const target = args[outIndex + 1];
      if (outIndex !== -1 && target !== undefined) writeFileSync(target, '{}');
      return { status: 0, stderr: '' } satisfies SpawnResult;
    }) as unknown as typeof spawnSync);
    expect(() => writeEvidence(outDir, parts)).toThrow(/prettier[\s\S]*prettier exploded/);
  });
});

describe('writeEvidence merge and replace', () => {
  let outDir: string;

  beforeEach(() => {
    outDir = mkdtempSync(path.join(os.tmpdir(), 'harness-evidence-'));
    vi.mocked(spawnSync).mockReset();
    vi.mocked(spawnSync).mockImplementation(((_command: string, args: string[]) => {
      const outIndex = args.indexOf('--out');
      const target = args[outIndex + 1];
      if (outIndex !== -1 && target !== undefined) writeFileSync(target, '{}');
      return { status: 0, stderr: '' };
    }) as unknown as typeof spawnSync);
  });

  afterEach(() => {
    rmSync(outDir, { recursive: true, force: true });
  });

  const read = (name: string) => readFileSync(path.join(outDir, name), 'utf8');

  it('keeps the other engine and replaces only the rewritten engine', () => {
    writeEvidence(outDir, {
      ...parts,
      engine: 'chromium',
      environment: { reps: 2 },
      raw: { reps: 2 },
      summarySections: ['## chromium — budgets\n\nold'],
    });
    writeEvidence(outDir, {
      ...parts,
      engine: 'firefox',
      environment: { reps: 2 },
      raw: { reps: 2 },
      summarySections: ['## firefox — budgets\n\nfirefox'],
    });
    writeEvidence(outDir, {
      ...parts,
      engine: 'chromium',
      environment: { reps: 23 },
      raw: { reps: 23 },
      summaryHeader: '# Release evidence session\n\nLabel: release.',
      summarySections: ['## chromium — budgets\n\nnew'],
    });
    const raw = JSON.parse(read('raw-observations.json')) as {
      byEngine: Record<string, { reps: number }>;
    };
    expect(raw.byEngine['chromium']?.reps).toBe(23);
    expect(raw.byEngine['firefox']?.reps).toBe(2);
    const environment = JSON.parse(read('environment.json')) as {
      browsers: Record<string, { reps: number }>;
    };
    expect(environment.browsers['chromium']?.reps).toBe(23);
    expect(environment.browsers['firefox']?.reps).toBe(2);
    const summary = read('summary.md');
    expect(summary.startsWith('# Release evidence session\n\nLabel: release.')).toBe(true);
    expect(summary).toContain('new');
    expect(summary).not.toContain('old');
    expect(summary).toContain('firefox');
    expect(summary.match(/^# /gm)).toHaveLength(1);
  });
});
