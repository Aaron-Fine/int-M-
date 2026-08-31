import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = join(import.meta.dirname, '../../..');
const runCapture = () =>
  spawnSync('node', [join(repoRoot, 'tools/benchmark/capture-environment.mjs')], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
const runManifest = (args, cwd) =>
  spawnSync('node', [join(repoRoot, 'tools/benchmark/manifest.mjs'), ...args], {
    cwd,
    encoding: 'utf8',
  });

describe('capture-environment', () => {
  it('environment_fillsNodeFactsAndLeavesBrowserFieldsNull', () => {
    const result = runCapture();
    expect(result.status).toEqual(0);
    const environment = JSON.parse(result.stdout);

    expect(environment.schemaVersion).toEqual(1);
    expect(Number.isNaN(Date.parse(environment.capturedAt))).toBe(false);
    expect(environment.cpu.model).toEqual(expect.any(String));
    expect(environment.cpu.model.length).toBeGreaterThan(0);
    expect(environment.cpu.cores).toBeGreaterThanOrEqual(1);
    expect(environment.memoryTotalBytes).toBeGreaterThan(0);
    expect(environment.os.kernel).toEqual(expect.any(String));
    expect(environment.os.kernel.length).toBeGreaterThan(0);

    // Browser-only facts are explicit placeholders until a browser run fills them.
    expect(environment.browser).toEqual({
      build: null,
      engine: null,
      headed: null,
      powerMode: null,
      devicePixelRatio: null,
      viewport: null,
    });
    expect(environment.render).toEqual({ workerCount: null, backend: null });

    expect(environment.revisions.catalog).toMatch(/^[0-9a-f]{64}$/);
    expect(environment.revisions.verifier).toMatch(/^[0-9a-f]{64}$/);
    expect(environment.revisions.build === null || typeof environment.revisions.build === 'string').toBe(
      true,
    );
    expect(environment.harness.version).toEqual(expect.any(String));
    expect(environment.notes.join(' ')).toContain('placeholders');
  });

  it('environment_writesToFileWhenOutIsGiven', () => {
    const workDir = mkdtempSync(join(tmpdir(), 'mi-env-'));
    const outPath = join(workDir, 'environment.json');
    try {
      const result = spawnSync(
        'node',
        [join(repoRoot, 'tools/benchmark/capture-environment.mjs'), '--out', outPath],
        { cwd: repoRoot, encoding: 'utf8' },
      );
      expect(result.status).toEqual(0);
      const environment = JSON.parse(readFileSync(outPath, 'utf8'));
      expect(environment.schemaVersion).toEqual(1);
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  });
});

describe('manifest', () => {
  const makeEvidenceDir = () => {
    const dir = mkdtempSync(join(tmpdir(), 'mi-manifest-'));
    writeFileSync(join(dir, 'summary.md'), '# summary\n');
    writeFileSync(join(dir, 'raw-observations.json'), '{"samples":[1,2,3]}\n');
    mkdirSync(join(dir, 'nested'));
    writeFileSync(join(dir, 'nested', 'environment.json'), '{"schemaVersion":1}\n');
    return dir;
  };

  it('manifest_emitsSortedSha256LinesAndVerifiesClean', () => {
    const dir = makeEvidenceDir();
    try {
      const emit = runManifest([dir]);
      expect(emit.status).toEqual(0);
      const manifest = readFileSync(join(dir, 'manifest.sha256'), 'utf8');
      const lines = manifest.trim().split('\n');
      expect(lines).toHaveLength(3);
      const paths = lines.map((line) => line.slice(line.indexOf('  ') + 2));
      expect(paths).toEqual([...paths].sort());
      expect(paths).toEqual(['nested/environment.json', 'raw-observations.json', 'summary.md']);
      for (const line of lines) expect(line).toMatch(/^[0-9a-f]{64}  /);

      const verify = runManifest(['--check', dir]);
      expect(verify.status).toEqual(0);
      expect(verify.stdout).toContain('3 files verified');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('manifest_check_detectsTampering', () => {
    const dir = makeEvidenceDir();
    try {
      expect(runManifest([dir]).status).toEqual(0);

      // Tamper with an existing file.
      writeFileSync(join(dir, 'summary.md'), '# tampered\n');
      expect(runManifest(['--check', dir]).status).not.toEqual(0);

      // Restore, then add an unmanifested extra file.
      writeFileSync(join(dir, 'summary.md'), '# summary\n');
      writeFileSync(join(dir, 'smuggled.txt'), 'extra\n');
      expect(runManifest(['--check', dir]).status).not.toEqual(0);

      // Remove a manifested file.
      rmSync(join(dir, 'smuggled.txt'));
      rmSync(join(dir, 'nested', 'environment.json'));
      expect(runManifest(['--check', dir]).status).not.toEqual(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('manifest_check_failsWhenNoManifestExists', () => {
    const dir = makeEvidenceDir();
    try {
      expect(runManifest(['--check', dir]).status).not.toEqual(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('validate-corpus-cli', () => {
  it('validator_cli_exitsZeroForShippedCorpusAndNonZeroForInvalidInput', () => {
    const valid = execFileSync(
      'node',
      [join(repoRoot, 'tools/benchmark/validate-corpus-cli.mjs')],
      { cwd: repoRoot, encoding: 'utf8' },
    );
    expect(valid).toContain('valid');

    const invalid = spawnSync(
      'node',
      [join(repoRoot, 'tools/benchmark/validate-corpus-cli.mjs'), '/nonexistent/corpus.json'],
      { cwd: repoRoot, encoding: 'utf8' },
    );
    expect(invalid.status).toEqual(1);
  });
});
