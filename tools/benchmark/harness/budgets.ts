/** Frozen latency budgets (warm medians, both browsers) and their evaluation. */
import { readFileSync } from 'node:fs';
import path from 'node:path';

interface BudgetFile {
  readonly revision: string;
  readonly coarseMedianMs: number;
  readonly stableMedianMsByClass: Readonly<Record<string, number>>;
}

export const BUDGETS: BudgetFile = JSON.parse(
  readFileSync(path.join(import.meta.dirname, 'budgets.v1.json'), 'utf8'),
) as BudgetFile;

type Verdict = 'pass' | 'fail' | 'n/a';
const verdict = (value: number | undefined, limit: number): Verdict =>
  value === undefined ? 'n/a' : value <= limit ? 'pass' : 'fail';

export const evaluateBudget = (
  caseClass: string,
  coarseMedianMs: number | undefined,
  stableMedianMs: number | undefined,
): { coarse: Verdict; stable: Verdict; stableBudgetMs: number } => {
  const stableBudgetMs = BUDGETS.stableMedianMsByClass[caseClass];
  if (stableBudgetMs === undefined) throw new RangeError(`no stable budget for class ${caseClass}`);
  return {
    coarse: verdict(coarseMedianMs, BUDGETS.coarseMedianMs),
    stable: verdict(stableMedianMs, stableBudgetMs),
    stableBudgetMs,
  };
};
