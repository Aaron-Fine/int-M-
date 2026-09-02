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

const meanOf = (values: readonly number[]): number =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

/** Pearson product-moment correlation; NaN when either side is constant. */
export const pearson = (xs: readonly number[], ys: readonly number[]): number => {
  if (xs.length !== ys.length || xs.length < 2) {
    throw new RangeError('correlation needs two equal-length samples of at least 2');
  }
  const mx = meanOf(xs);
  const my = meanOf(ys);
  let covariance = 0;
  let varianceX = 0;
  let varianceY = 0;
  for (let index = 0; index < xs.length; index += 1) {
    const dx = (xs[index] ?? 0) - mx;
    const dy = (ys[index] ?? 0) - my;
    covariance += dx * dy;
    varianceX += dx * dx;
    varianceY += dy * dy;
  }
  if (varianceX === 0 || varianceY === 0) return Number.NaN;
  return covariance / Math.sqrt(varianceX * varianceY);
};

/** Average ranks (ties share the mean rank), for Spearman's rank correlation. */
const ranks = (values: readonly number[]): number[] => {
  const order = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const result = new Array<number>(values.length).fill(0);
  let start = 0;
  while (start < order.length) {
    let end = start;
    while (end + 1 < order.length && (order[end + 1]?.value ?? 0) === (order[start]?.value ?? 0)) {
      end += 1;
    }
    const averageRank = (start + end) / 2 + 1;
    for (let position = start; position <= end; position += 1) {
      const index = order[position]?.index;
      if (index !== undefined) result[index] = averageRank;
    }
    start = end + 1;
  }
  return result;
};

/** Spearman rank correlation (Pearson over average ranks); NaN on ties-only input. */
export const spearman = (xs: readonly number[], ys: readonly number[]): number =>
  pearson(ranks(xs), ranks(ys));
