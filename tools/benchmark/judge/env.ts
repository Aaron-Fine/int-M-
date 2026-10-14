/// <reference types="node" />
/** Environment capture for reproducibility (directional-evidence provenance). */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { arch, cpus, loadavg, platform, release, totalmem } from 'node:os';

export interface EnvironmentRecord {
  readonly capturedAt: string;
  readonly node: string;
  readonly v8: string;
  readonly platform: string;
  readonly platformRelease: string;
  readonly arch: string;
  readonly cpuModel: string;
  readonly logicalCpus: number;
  readonly totalMemoryBytes: number;
  readonly loadAverageAtStart: readonly number[];
  readonly gcExposed: boolean;
  readonly maxOldSpaceMb: number | undefined;
  readonly git: {
    readonly sha: string;
    readonly shortSha: string;
    readonly branch: string;
    readonly dirty: boolean;
    readonly dirtyFiles: readonly string[];
    /** SHA-256 of `git diff HEAD` (tracked changes), to tell dirty trees apart. */
    readonly trackedDiffSha256: string;
  };
}

const git = (args: readonly string[]): string => {
  try {
    return execFileSync('git', [...args], {
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
    }).trim();
  } catch {
    return 'unknown';
  }
};

const maxOldSpace = (): number | undefined => {
  const match = /--max-old-space-size=(\d+)/.exec(process.execArgv.join(' '));
  return match === null ? undefined : Number(match[1]);
};

export const captureEnvironment = (): EnvironmentRecord => {
  const status = git(['status', '--porcelain']);
  const dirtyFiles = status === '' || status === 'unknown' ? [] : status.split('\n');
  return {
    capturedAt: new Date().toISOString(),
    node: process.version,
    v8: process.versions.v8,
    platform: platform(),
    platformRelease: release(),
    arch: arch(),
    cpuModel: cpus()[0]?.model ?? 'unknown',
    logicalCpus: cpus().length,
    totalMemoryBytes: totalmem(),
    loadAverageAtStart: loadavg(),
    gcExposed: typeof (globalThis as { gc?: unknown }).gc === 'function',
    maxOldSpaceMb: maxOldSpace(),
    git: {
      sha: git(['rev-parse', 'HEAD']),
      shortSha: git(['rev-parse', '--short=7', 'HEAD']),
      branch: git(['rev-parse', '--abbrev-ref', 'HEAD']),
      dirty: dirtyFiles.length > 0,
      dirtyFiles: dirtyFiles.slice(0, 100),
      trackedDiffSha256: createHash('sha256')
        .update(git(['diff', 'HEAD']))
        .digest('hex'),
    },
  };
};
