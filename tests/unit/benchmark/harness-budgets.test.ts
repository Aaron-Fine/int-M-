import { describe, expect, it } from 'vitest';
import { evaluateBudget } from '../../../tools/benchmark/harness/budgets.ts';

describe('frozen latency budgets', () => {
  it('passes at the threshold and fails just above it', () => {
    expect(evaluateBudget('Easy', 100, 250)).toEqual({
      coarse: 'pass',
      stable: 'pass',
      stableBudgetMs: 250,
    });
    expect(evaluateBudget('Easy', 100.1, 250.1)).toEqual({
      coarse: 'fail',
      stable: 'fail',
      stableBudgetMs: 250,
    });
  });

  it('uses the class budget', () => {
    expect(evaluateBudget('Hard known', 50, 600).stable).toBe('pass');
    expect(evaluateBudget('Fallback', 50, 1500).stable).toBe('pass');
    expect(evaluateBudget('Scale', 50, 1500.5).stable).toBe('fail');
  });

  it('reports n/a for missing medians and rejects unknown classes', () => {
    expect(evaluateBudget('Easy', undefined, undefined)).toEqual({
      coarse: 'n/a',
      stable: 'n/a',
      stableBudgetMs: 250,
    });
    expect(() => evaluateBudget('Catalog', 1, 1)).toThrow(/no stable budget/);
  });
});
