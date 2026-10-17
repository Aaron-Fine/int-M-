/** `--compare` argument parsing and served-build resolution (pure; no browser). */
import path from 'node:path';
import type { ArmSpec } from './passes/corpus.ts';

export interface CompareDist {
  name: string;
  dir: string;
}
export interface Compare {
  arm: ArmSpec;
  dist?: CompareDist;
}

/** Key of the cross-origin-isolated build in `Session.baseUrls`; not usable as a compare name. */
const RESERVED_ARM_NAME = 'isolated';

/** Parses `name=<query>` or `name=dist:<dir>`; a relative dir resolves against `cwd`. */
export const parseCompare = (spec: string, cwd: string): Compare => {
  const eq = spec.indexOf('=');
  if (eq < 1 || eq === spec.length - 1) {
    throw new Error(`--compare expects name=<query>|name=dist:<dir>: ${spec}`);
  }
  const name = spec.slice(0, eq);
  const value = spec.slice(eq + 1);
  if (name === RESERVED_ARM_NAME) {
    throw new Error(`--compare name "${name}" is reserved for the memory pass's isolated build`);
  }
  if (value.startsWith('dist:')) {
    const dir = path.resolve(cwd, value.slice('dist:'.length));
    return { arm: { name, hook: true, dist: name }, dist: { name, dir } };
  }
  return { arm: { name, hook: true, query: value } };
};

/** The directory `vite preview` serves for a resolved config. */
export const servedRoot = (config: {
  readonly root: string;
  readonly build: { readonly outDir: string };
}): string => path.resolve(config.root, config.build.outDir);

/** Throws unless the served directory is the one the compare arm names. */
export const assertServes = (
  name: string,
  config: { readonly root: string; readonly build: { readonly outDir: string } },
  dir: string,
): void => {
  const served = servedRoot(config);
  if (served !== path.resolve(dir)) {
    throw new Error(
      `compare arm ${name} would serve ${served}, not ${dir}; refusing to compare against the wrong build`,
    );
  }
};
