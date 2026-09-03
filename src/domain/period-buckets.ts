/**
 * Detected-period buckets shared by the plan §8 opt-in diagnostics counters
 * (performance plan §8: "final classification totals and
 * systematic/opportunistic period buckets"). Bucket boundaries follow the
 * corpus strata: periods 1–4, 5–8, 9–12, and everything above the cataloged
 * range (13+ up to the quality budget's maxPeriod).
 */

export const PERIOD_BUCKET_COUNT = 4;

export const PERIOD_BUCKET_LABELS: readonly string[] = Object.freeze(['1-4', '5-8', '9-12', '13+']);

/**
 * Bucket index for a primitive period >= 1. Detected periods are always >= 1
 * at the counting sites (accepted attracting records only), so no guard for
 * non-positive periods is needed; the last bucket is open-ended.
 */
export const periodBucketIndex = (period: number): 0 | 1 | 2 | 3 =>
  period <= 4 ? 0 : period <= 8 ? 1 : period <= 12 ? 2 : 3;
