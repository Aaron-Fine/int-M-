/**
 * Bundle entry for the fallback-overhead microbenchmark
 * (tools/benchmark/fallback-overhead.ts). Built once per arm, each bundle
 * carrying its own copy of the classifier, so two builds can be timed
 * interleaved in one Node process.
 */
import type { RasterSize } from '../../src/domain';
import { classifyRows } from '../../src/render/classify-rows';
import { coarseRenderQuality } from '../../src/render/cpu-renderer';
import { loadCorpusCases, profileQuality } from './judge/corpus';

/** Ids of every frozen-corpus case, in corpus order. */
export const corpusCaseIds = (): readonly string[] => loadCorpusCases().map((c) => c.id);

/**
 * Wall time in ms of one classification pass of a corpus case: the stable
 * pass (stride 1, the two-lane row kernel) by default, or a coarse pass
 * (stride > 1, the scalar kernel).
 */
export const timeCase = async (caseId: string, size: RasterSize, stride = 1): Promise<number> => {
  const corpusCase = loadCorpusCases().find((candidate) => candidate.id === caseId);
  if (corpusCase === undefined) throw new RangeError(`unknown corpus case ${caseId}`);
  const profile = profileQuality(corpusCase.profile);
  // A coarse pass runs at the renderer's coarse budget (cpu-renderer.ts),
  // with the stride passed in; the stable pass runs the profile unchanged.
  const quality = stride > 1 ? coarseRenderQuality({ ...profile, coarseStride: stride }) : profile;
  const signal = new AbortController().signal;
  const started = performance.now();
  await classifyRows(
    { viewport: corpusCase.viewport, size, quality },
    quality,
    stride,
    0,
    size.height,
    signal,
  );
  return performance.now() - started;
};
