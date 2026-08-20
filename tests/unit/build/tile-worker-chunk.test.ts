import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = join(import.meta.dirname, '../../..');

describe('nested tile worker chunk', () => {
  it('build_emitsNestedTileWorkerChunk', () => {
    execFileSync('npm', ['run', 'build:assets'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });

    const assets = join(repoRoot, 'dist/assets');
    const names = readdirSync(assets);
    const renderWorker = names.find((name) => /^render\.worker-.*\.js$/.test(name));
    const tileWorkers = names.filter((name) => /^tile\.worker-.*\.js$/.test(name));

    expect(renderWorker).toEqual(expect.stringMatching(/^render\.worker-.*\.js$/));
    expect(tileWorkers.length).toBeGreaterThanOrEqual(1);

    const source = readFileSync(join(assets, renderWorker ?? ''), 'utf8');
    expect(tileWorkers.some((name) => source.includes(name))).toBe(true);
  }, 120_000);
});
