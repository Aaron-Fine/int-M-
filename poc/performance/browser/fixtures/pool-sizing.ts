import type { DynamicsRenderRequest } from '../../../../src/render/renderer';
import { getQualityProfile } from '../../../../src/ui/view-state';
import type { RenderQuality } from '../../../../src/domain';
import { getCorpusCase } from './corpus-views';
import type { PoolSizingParams, PoolSizingResult, PoolSizingSample } from './microbench-api';
import { TileWorkerSet } from './pool-driver';

/**
 * Workstream K measurement (plan §5): wall time per pool size on a hard
 * corpus view. Sizes are measured in fixed ascending order; workers persist
 * across the warmup + measured reps of a size (warm pool, like the
 * production pool), and each size gets a fresh pool so spawn costs stay out
 * of the timed reps.
 */
export const runPoolSizing = async (params: PoolSizingParams): Promise<PoolSizingResult> => {
  const corpusCase = getCorpusCase(params.caseId);
  const quality = getQualityProfile(params.profileId).quality;
  const size = { width: params.edge, height: params.edge };
  const request: DynamicsRenderRequest = { viewport: corpusCase.viewport, size };

  const samples: PoolSizingSample[] = [];
  const spawnMsByWorkerCount: Record<string, number> = {};

  for (const workerCount of params.sizes) {
    const pool = new TileWorkerSet(workerCount);
    spawnMsByWorkerCount[String(workerCount)] = pool.spawn();
    for (let rep = 0; rep < params.warmupReps; rep += 1) {
      const run = await pool.classify({ request, quality });
      samples.push({ ...run, phase: 'warmup', rep });
    }
    for (let rep = 0; rep < params.measuredReps; rep += 1) {
      const run = await pool.classify({ request, quality });
      samples.push({ ...run, phase: 'measured', rep });
    }
    pool.dispose();
  }

  return {
    caseId: corpusCase.id,
    profileId: params.profileId,
    edge: params.edge,
    quality: {
      maxIterations: quality.maxIterations,
      maxPeriod: quality.maxPeriod,
      coarseStride: quality.coarseStride,
    },
    viewport: {
      centerRe: corpusCase.viewport.center.re,
      centerIm: corpusCase.viewport.center.im,
      spanY: corpusCase.viewport.spanY,
    },
    hardwareConcurrency: Number.isFinite(navigator.hardwareConcurrency)
      ? navigator.hardwareConcurrency
      : null,
    spawnMsByWorkerCount,
    samples,
  };
};

export type { RenderQuality };
