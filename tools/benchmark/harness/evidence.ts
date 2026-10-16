/** Evidence directory writer (evidence/phase-2/README.md contract). */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '../../..');

export const writeEvidence = (
  outDir: string,
  parts: {
    engine: string;
    environment: Record<string, unknown>;
    raw: unknown;
    summarySections: readonly string[];
  },
): void => {
  mkdirSync(outDir, { recursive: true });
  const environmentPath = path.join(outDir, 'environment.json');
  const existing = existsSync(environmentPath)
    ? (JSON.parse(readFileSync(environmentPath, 'utf8')) as Record<string, unknown>)
    : undefined;
  const capture = spawnSync(
    'node',
    [
      path.join(repoRoot, 'tools/benchmark/capture-environment.mjs'),
      '--out',
      environmentPath,
      '--note',
      'Release session (tools/benchmark/run-release.ts).',
    ],
    { cwd: repoRoot, stdio: 'inherit' },
  );
  if (capture.status !== 0) throw new Error('capture-environment.mjs failed');
  const captured = JSON.parse(readFileSync(environmentPath, 'utf8')) as Record<string, unknown>;
  const browsers = {
    ...((existing?.['browsers'] as object | undefined) ?? {}),
    [parts.engine]: parts.environment,
  };
  writeFileSync(environmentPath, `${JSON.stringify({ ...captured, browsers }, null, 2)}\n`);

  const rawPath = path.join(outDir, 'raw-observations.json');
  const rawExisting = existsSync(rawPath)
    ? (JSON.parse(readFileSync(rawPath, 'utf8')) as { byEngine?: Record<string, unknown> })
    : {};
  writeFileSync(
    rawPath,
    `${JSON.stringify({ schemaVersion: 1, byEngine: { ...(rawExisting.byEngine ?? {}), [parts.engine]: parts.raw } }, null, 2)}\n`,
  );

  const summaryPath = path.join(outDir, 'summary.md');
  const kept = existsSync(summaryPath)
    ? readFileSync(summaryPath, 'utf8')
        .split(/(?=^## )/m)
        .filter((section) => !section.startsWith(`## ${parts.engine}`))
    : ['# Release evidence session\n\n'];
  writeFileSync(summaryPath, `${[...kept, ...parts.summarySections].join('\n')}\n`);

  const formatted = spawnSync('npx', ['prettier', '--write', outDir], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (formatted.status !== 0) {
    throw new Error(`npx prettier --write failed: ${formatted.stderr}`);
  }
  const manifest = spawnSync(
    'node',
    [path.join(repoRoot, 'tools/benchmark/manifest.mjs'), outDir],
    { cwd: repoRoot, stdio: 'inherit' },
  );
  if (manifest.status !== 0) throw new Error('manifest emission failed');
};
