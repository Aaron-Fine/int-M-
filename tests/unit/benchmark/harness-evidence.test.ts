import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
