/**
 * Bundle entry for the fallback-overhead microbenchmark
 * (tools/benchmark/fallback-overhead.ts). Built once per arm, each bundle
 * carrying its own copy of the classifier, so two builds can be timed
 * interleaved in one Node process.
 */
import type { RasterSize } from '../../src/domain';
import { classifyRows } from '../../src/render/classify-rows';
import { loadCorpusCases, profileQuality } from './judge/corpus';

/** Ids of every frozen-corpus case, in corpus order. */
export const corpusCaseIds = (): readonly string[] => loadCorpusCases().map((c) => c.id);

/** Wall time in ms of one stable-pass classification of a corpus case. */
export const timeCase = async (caseId: string, size: RasterSize): Promise<number> => {
  const corpusCase = loadCorpusCases().find((candidate) => candidate.id === caseId);
  if (corpusCase === undefined) throw new RangeError(`unknown corpus case ${caseId}`);
  const quality = profileQuality(corpusCase.profile);
  const signal = new AbortController().signal;
  const started = performance.now();
  await classifyRows(
    { viewport: corpusCase.viewport, size, quality },
    quality,
    1,
    0,
    size.height,
    signal,
  );
  return performance.now() - started;
};
