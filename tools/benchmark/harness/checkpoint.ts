/** Per-case checkpointing so an interrupted session resumes without repeats. */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

interface Cell {
  readonly caseId: string;
  readonly repetition: number;
  readonly arm: string;
}

const key = (cell: Cell): string => `${cell.caseId}\u001f${cell.repetition}\u001f${cell.arm}`;

export const mergeSamples = <T extends Cell>(
  existing: readonly T[],
  incoming: readonly T[],
): T[] => {
  const byKey = new Map(existing.map((sample) => [key(sample), sample]));
  for (const sample of incoming) byKey.set(key(sample), sample);
  return [...byKey.values()];
};

export const completedCases = (
  samples: readonly Cell[],
  caseIds: readonly string[],
  reps: number,
  arms: readonly string[],
): Set<string> => {
  const present = new Set(samples.map(key));
  return new Set(
    caseIds.filter((caseId) =>
      Array.from({ length: reps }, (_, repetition) => repetition).every((repetition) =>
        arms.every((arm) => present.has(key({ caseId, repetition, arm }))),
      ),
    ),
  );
};

/** Protocol facts a partial file was measured under; a resume must match them. */
export interface PartialHeader {
  readonly release: boolean;
  readonly reps: number;
  readonly arms: readonly string[];
  readonly commit: string;
  readonly caseIds: readonly string[];
}

interface PartialFile {
  readonly header?: PartialHeader;
  readonly samples: unknown[];
}

const readPartialFile = (file: string): PartialFile | undefined => {
  if (!existsSync(file)) return undefined;
  const parsed = JSON.parse(readFileSync(file, 'utf8')) as unknown;
  // Files written before the header existed were a bare sample array.
  return Array.isArray(parsed) ? { samples: parsed } : (parsed as PartialFile);
};

const writeAtomic = (file: string, content: PartialFile): void => {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(`${file}.tmp`, JSON.stringify(content));
  renameSync(`${file}.tmp`, file);
};

export const readPartial = (file: string): unknown[] => readPartialFile(file)?.samples ?? [];

/** Names the first protocol field that differs, or undefined when they agree. */
export const headerMismatch = (
  found: PartialHeader | undefined,
  expected: PartialHeader,
): string | undefined => {
  if (found === undefined) return 'it has no protocol header';
  const fields: (keyof PartialHeader)[] = ['release', 'reps', 'arms', 'commit', 'caseIds'];
  for (const field of fields) {
    if (JSON.stringify(found[field]) !== JSON.stringify(expected[field])) {
      return `${field} differs (partial ${JSON.stringify(found[field])}, this run ${JSON.stringify(expected[field])})`;
    }
  }
  return undefined;
};

/**
 * Starts or continues a partial file. A new file gets the header; an existing
 * one must carry a matching header, so a resume never merges samples taken
 * under a different protocol.
 */
export const claimPartial = (file: string, header: PartialHeader): void => {
  const existing = readPartialFile(file);
  if (existing === undefined) {
    writeAtomic(file, { header, samples: [] });
    return;
  }
  const mismatch = headerMismatch(existing.header, header);
  if (mismatch !== undefined) {
    throw new Error(
      `${file} was written under a different protocol (${mismatch}); remove it or rerun with the original flags`,
    );
  }
};

/** Atomic append: write a temporary file, then rename over the partial. */
export const appendPartial = (file: string, samples: readonly Cell[]): void => {
  const existing = readPartialFile(file);
  const merged = mergeSamples((existing?.samples ?? []) as Cell[], samples);
  writeAtomic(file, {
    ...(existing?.header === undefined ? {} : { header: existing.header }),
    samples: merged,
  });
};
