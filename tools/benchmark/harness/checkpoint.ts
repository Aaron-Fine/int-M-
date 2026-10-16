/** Per-case checkpointing so an interrupted session resumes without repeats. */
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';

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

export const readPartial = (file: string): unknown[] =>
  existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as unknown[]) : [];

/** Atomic append: write a temporary file, then rename over the partial. */
export const appendPartial = (file: string, samples: readonly Cell[]): void => {
  const merged = mergeSamples(readPartial(file) as Cell[], samples);
  writeFileSync(`${file}.tmp`, JSON.stringify(merged));
  renameSync(`${file}.tmp`, file);
};
