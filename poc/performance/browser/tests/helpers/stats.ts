const median = (values: readonly number[]): number => {
  if (values.length === 0) throw new RangeError('median of empty list');
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? 0)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
};

export interface SummaryStats {
  readonly n: number;
  readonly median: number;
  readonly min: number;
  readonly max: number;
  readonly mean: number;
}

export const summarize = (values: readonly number[]): SummaryStats => ({
  n: values.length,
  median: median(values),
  min: Math.min(...values),
  max: Math.max(...values),
  mean: values.reduce((sum, value) => sum + value, 0) / values.length,
});

export { median };
