/**
 * Paired timing runner. Strictly sequential, one process, one render at a time.
 * Design per case and candidate: one untimed warmup render per arm, then R
 * repetitions; each repetition renders ABBA (odd repetitions BAAB) so linear
 * drift cancels; the repetition's value for an arm is the mean of its two
 * renders and the paired ratio is baseline/candidate. A final untimed pass
 * collects counters.
 */
import type { RasterSize } from '../../../src/domain';
import type { Candidate, CaseRenderSpec } from '../candidates/types';
import { makeSpec, rasterLabel, type CorpusCase } from './corpus';
import {
  aggregateTiming,
  mean,
  median,
  pairedRatios,
  summarizeRatios,
  type AggregateTiming,
  type CaseTimingSummary,
} from './stats';

export interface PerfRunOptions {
  readonly cases: readonly CorpusCase[];
  readonly raster: RasterSize;
  readonly reps: number;
  readonly warmups: number;
  readonly log: (message: string) => void;
}

export interface CaseTiming {
  readonly caseId: string;
  readonly raster: string;
  readonly baselineMs: readonly number[];
  readonly candidateMs: readonly number[];
  readonly summary: CaseTimingSummary;
  readonly medianBaselineMs: number;
  readonly medianCandidateMs: number;
  readonly baselineCounters: Readonly<Record<string, number>>;
  readonly candidateCounters: Readonly<Record<string, number>>;
}

export interface CandidateTiming {
  readonly id: string;
  readonly cases: readonly CaseTiming[];
  readonly aggregate: AggregateTiming | undefined;
  /** Set when the candidate threw during timing; its cases are then incomplete. */
  readonly error: string | undefined;
}

const gc = (): void => {
  const collect = (globalThis as { gc?: () => void }).gc;
  collect?.();
};

const timeRender = async (arm: Candidate, spec: CaseRenderSpec): Promise<number> => {
  gc();
  const started = performance.now();
  const frame = await arm.render(spec);
  const elapsed = performance.now() - started;
  // Keep the frame alive until after the clock stops.
  if (frame.size.width !== spec.size.width) throw new Error('candidate returned the wrong size');
  return elapsed;
};

/** ABBA on even repetitions, BAAB on odd; returns mean ms per arm. */
const pairedRepetition = async (
  baseline: Candidate,
  candidate: Candidate,
  spec: CaseRenderSpec,
  rep: number,
): Promise<{ baselineMs: number; candidateMs: number }> => {
  const order =
    rep % 2 === 0
      ? [baseline, candidate, candidate, baseline]
      : [candidate, baseline, baseline, candidate];
  const times = new Map<Candidate, number[]>([
    [baseline, []],
    [candidate, []],
  ]);
  for (const arm of order) times.get(arm)?.push(await timeRender(arm, spec));
  return {
    baselineMs: mean(times.get(baseline) ?? []),
    candidateMs: mean(times.get(candidate) ?? []),
  };
};

const collectCounters = async (
  arm: Candidate,
  spec: CaseRenderSpec,
): Promise<Record<string, number>> => {
  arm.reset?.();
  await arm.render({ ...spec, collectCounters: true });
  return { ...arm.counters?.() };
};

const timeCase = async (
  baseline: Candidate,
  candidate: Candidate,
  corpusCase: CorpusCase,
  options: PerfRunOptions,
): Promise<CaseTiming> => {
  const spec = makeSpec(corpusCase, options.raster, { diagnostics: false, collectCounters: false });
  const baselineMs: number[] = [];
  const candidateMs: number[] = [];
  baseline.reset?.();
  candidate.reset?.();
  for (let w = 0; w < options.warmups; w += 1) {
    await timeRender(baseline, spec);
    await timeRender(candidate, spec);
  }
  for (let rep = 0; rep < options.reps; rep += 1) {
    const pair = await pairedRepetition(baseline, candidate, spec, rep);
    baselineMs.push(pair.baselineMs);
    candidateMs.push(pair.candidateMs);
  }
  const summary = summarizeRatios(pairedRatios(baselineMs, candidateMs));
  return {
    caseId: corpusCase.id,
    raster: rasterLabel(options.raster),
    baselineMs,
    candidateMs,
    summary,
    medianBaselineMs: median(baselineMs),
    medianCandidateMs: median(candidateMs),
    baselineCounters: await collectCounters(baseline, spec),
    candidateCounters: await collectCounters(candidate, spec),
  };
};

export const runPerf = async (
  baseline: Candidate,
  candidates: readonly Candidate[],
  options: PerfRunOptions,
): Promise<readonly CandidateTiming[]> => {
  const byCandidate = new Map<string, CaseTiming[]>(candidates.map((c) => [c.id, []]));
  const failures = new Map<string, string>();
  for (const corpusCase of options.cases) {
    for (const candidate of candidates) {
      if (failures.has(candidate.id)) continue;
      options.log(
        `perf ${corpusCase.id} @ ${rasterLabel(options.raster)}: ${candidate.id} x${options.reps}`,
      );
      try {
        const timing = await timeCase(baseline, candidate, corpusCase, options);
        byCandidate.get(candidate.id)?.push(timing);
        options.log(
          `  median ratio ${timing.summary.medianRatio.toFixed(3)} (baseline ${timing.medianBaselineMs.toFixed(1)} ms, candidate ${timing.medianCandidateMs.toFixed(1)} ms)`,
        );
      } catch (error: unknown) {
        failures.set(candidate.id, error instanceof Error ? error.message : String(error));
      }
    }
  }
  return candidates.map((candidate) => {
    const cases = byCandidate.get(candidate.id) ?? [];
    return {
      id: candidate.id,
      cases,
      error: failures.get(candidate.id),
      aggregate:
        cases.length === 0 || failures.has(candidate.id)
          ? undefined
          : aggregateTiming(
              cases.map((entry) => ({ caseId: entry.caseId, summary: entry.summary })),
            ),
    };
  });
};
