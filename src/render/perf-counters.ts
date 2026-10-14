import type { CheckpointMetrics } from '../domain';
import type { LegacyScanCounters } from '../domain';

/**
 * Flat integer counters of one classification band, plan §8 opt-in
 * diagnostics vocabulary ("final classification totals and
 * systematic/opportunistic period buckets; analytic/checkpoint path hits;
 * candidate proposals, verifier rejects by reason"). One preallocated record
 * per band (created only when the request opted in via
 * `?perf=1&perfCounters=1`), attached once to the band result and summed
 * once per frame — never per pixel.
 *
 * Status totals count classified cells (stride-folded cells on the coarse
 * pass, exact pixels on the stable pass). The detected-period buckets count
 * verifier-accepted detections by primitive period and proposal source
 * (systematic = the kernel's scheduled scan — the whole lag scan in
 * legacy-scan mode, the checkpoint walk schedule in checkpoint mode;
 * opportunistic = the checkpoint exhaustion scan). Analytic fast-path
 * acceptances are counted in analyticPathHits and are not part of the
 * period buckets, so attracting ≠ Σ buckets by construction.
 */

export interface MutablePerfCounters {
  /** Lag distance evaluations of the REPORTED kernel (see module doc). */
  lagComparisons: number;
  /** Candidate proposals: verifier calls (checkpoint) / proximity hits (legacy). */
  proposals: number;
  /** Analytic fast-path acceptances (plan §8 path hits). */
  analyticPathHits: number;
  rejectsNoClosure: number;
  rejectsNotAttracting: number;
  rejectsNonFinite: number;
  rejectsAmbiguous: number;
  /** Schedule context (checkpoint mode only; zero in legacy-scan mode). */
  checkpointRolls: number;
  reArms: number;
  systematic1to4: number;
  systematic5to8: number;
  systematic9to12: number;
  systematic13Plus: number;
  opportunistic1to4: number;
  opportunistic5to8: number;
  opportunistic9to12: number;
  opportunistic13Plus: number;
  /** Final classification totals for the band's classified cells. */
  escaped: number;
  attracting: number;
  unresolved: number;
}

export type PerfCounters = Readonly<MutablePerfCounters>;

export const createPerfCounters = (): MutablePerfCounters => ({
  lagComparisons: 0,
  proposals: 0,
  analyticPathHits: 0,
  rejectsNoClosure: 0,
  rejectsNotAttracting: 0,
  rejectsNonFinite: 0,
  rejectsAmbiguous: 0,
  checkpointRolls: 0,
  reArms: 0,
  systematic1to4: 0,
  systematic5to8: 0,
  systematic9to12: 0,
  systematic13Plus: 0,
  opportunistic1to4: 0,
  opportunistic5to8: 0,
  opportunistic9to12: 0,
  opportunistic13Plus: 0,
  escaped: 0,
  attracting: 0,
  unresolved: 0,
});

export const resetPerfCounters = (counters: MutablePerfCounters): void => {
  counters.lagComparisons = 0;
  counters.proposals = 0;
  counters.analyticPathHits = 0;
  counters.rejectsNoClosure = 0;
  counters.rejectsNotAttracting = 0;
  counters.rejectsNonFinite = 0;
  counters.rejectsAmbiguous = 0;
  counters.checkpointRolls = 0;
  counters.reArms = 0;
  counters.systematic1to4 = 0;
  counters.systematic5to8 = 0;
  counters.systematic9to12 = 0;
  counters.systematic13Plus = 0;
  counters.opportunistic1to4 = 0;
  counters.opportunistic5to8 = 0;
  counters.opportunistic9to12 = 0;
  counters.opportunistic13Plus = 0;
  counters.escaped = 0;
  counters.attracting = 0;
  counters.unresolved = 0;
};

/** Adds `from` into `into` (used to aggregate per-band counters per frame). */
export const accumulatePerfCounters = (into: MutablePerfCounters, from: PerfCounters): void => {
  into.lagComparisons += from.lagComparisons;
  into.proposals += from.proposals;
  into.analyticPathHits += from.analyticPathHits;
  into.rejectsNoClosure += from.rejectsNoClosure;
  into.rejectsNotAttracting += from.rejectsNotAttracting;
  into.rejectsNonFinite += from.rejectsNonFinite;
  into.rejectsAmbiguous += from.rejectsAmbiguous;
  into.checkpointRolls += from.checkpointRolls;
  into.reArms += from.reArms;
  into.systematic1to4 += from.systematic1to4;
  into.systematic5to8 += from.systematic5to8;
  into.systematic9to12 += from.systematic9to12;
  into.systematic13Plus += from.systematic13Plus;
  into.opportunistic1to4 += from.opportunistic1to4;
  into.opportunistic5to8 += from.opportunistic5to8;
  into.opportunistic9to12 += from.opportunistic9to12;
  into.opportunistic13Plus += from.opportunistic13Plus;
  into.escaped += from.escaped;
  into.attracting += from.attracting;
  into.unresolved += from.unresolved;
};

export const sumPerfCounters = (sources: readonly PerfCounters[]): PerfCounters => {
  const total = createPerfCounters();
  for (const source of sources) accumulatePerfCounters(total, source);
  return total;
};

/**
 * Copies the checkpoint kernel's counter record into the flat vocabulary.
 * The checkpoint schedule's proposals are its verifier calls and its
 * ambiguous verdicts split into the shared reject classes.
 */
export const perfCountersFromCheckpointMetrics = (
  metrics: CheckpointMetrics,
): MutablePerfCounters => ({
  lagComparisons: metrics.lagComparisons,
  proposals: metrics.verifierCalls,
  analyticPathHits: metrics.analyticHits,
  rejectsNoClosure: metrics.rejectedNoClosure,
  rejectsNotAttracting: metrics.rejectedNotAttracting,
  rejectsNonFinite: metrics.rejectedNonFinite,
  rejectsAmbiguous: metrics.verifierAmbiguous,
  checkpointRolls: metrics.checkpointRolls,
  reArms: metrics.reArms,
  systematic1to4: metrics.systematic1to4,
  systematic5to8: metrics.systematic5to8,
  systematic9to12: metrics.systematic9to12,
  systematic13Plus: metrics.systematic13Plus,
  opportunistic1to4: metrics.opportunistic1to4,
  opportunistic5to8: metrics.opportunistic5to8,
  opportunistic9to12: metrics.opportunistic9to12,
  opportunistic13Plus: metrics.opportunistic13Plus,
  escaped: 0,
  attracting: 0,
  unresolved: 0,
});

/**
 * The legacy-scan instrumented kernel writes its sink fields directly; the
 * sink is the same MutablePerfCounters object (LegacyScanCounters is a
 * structural subset), so this only copies for readability at call sites that
 * hold a LegacyScanCounters.
 */
export const perfCountersFromLegacyScanCounters = (
  counters: LegacyScanCounters,
): MutablePerfCounters => ({
  lagComparisons: counters.lagComparisons,
  proposals: counters.proposals,
  analyticPathHits: counters.analyticPathHits,
  rejectsNoClosure: counters.rejectsNoClosure,
  rejectsNotAttracting: counters.rejectsNotAttracting,
  rejectsNonFinite: counters.rejectsNonFinite,
  rejectsAmbiguous: counters.rejectsAmbiguous,
  checkpointRolls: 0,
  reArms: 0,
  systematic1to4: counters.systematic1to4,
  systematic5to8: counters.systematic5to8,
  systematic9to12: counters.systematic9to12,
  systematic13Plus: counters.systematic13Plus,
  opportunistic1to4: 0,
  opportunistic5to8: 0,
  opportunistic9to12: 0,
  opportunistic13Plus: 0,
  escaped: 0,
  attracting: 0,
  unresolved: 0,
});
