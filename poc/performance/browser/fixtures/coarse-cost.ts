import { classifyRows } from '../../../../src/render/classify-rows';
import { getQualityProfile } from '../../../../src/ui/view-state';
import type { DynamicsRenderRequest } from '../../../../src/render/renderer';
import type { RenderQuality } from '../../../../src/domain';
import { getCorpusCase } from './corpus-views';
import type {
  CoarseCostParams,
  CoarseCostResult,
  CoarseRowSample,
  StableRowSample,
} from './microbench-api';

/**
 * Workstream N input (plan §5): cost-weighted static banding splits stable
 * bands by equal estimated cost derived from the already-computed coarse
 * pass (escape iterations, unresolved fraction). This measurement asks
 * whether that estimate actually predicts stable-pass compute: it runs the
 * production coarse pass (real classifyRows with CpuRenderer's coarse
 * quality), records per-coarse-row statistics, then times the stable pass
 * row by row with the same real classifier code path.
 *
 * The estimated-cost model uses ONLY what the coarse semantic frame carries
 * (what workstream N would see in production): escape iterations for escaped
 * pixels, the coarse iteration budget for everything else. The spec-side
 * analysis (tests/coarse-cost.spec.ts) aggregates rows into bands, computes
 * estimate-vs-actual correlation, and compares equal-height vs equal-cost
 * banding skew.
 */

export const runCoarseCost = async (params: CoarseCostParams): Promise<CoarseCostResult> => {
  const corpusCase = getCorpusCase(params.caseId);
  const quality = getQualityProfile(params.profileId).quality;
  const size = { width: params.edge, height: params.edge };
  const request: DynamicsRenderRequest = { viewport: corpusCase.viewport, size };
  const signal = new AbortController().signal;

  // The coarse pass exactly as CpuRenderer.render derives it (plan §12).
  const coarseStride = Math.max(2, quality.coarseStride);
  const coarseQuality: RenderQuality = {
    maxIterations: Math.min(quality.maxIterations, 256),
    maxPeriod: Math.min(quality.maxPeriod, 16),
    coarseStride,
  };
  const coarse = await classifyRows(request, coarseQuality, coarseStride, 0, params.edge, signal);

  // Per-coarse-row aggregates from the coarse frame at block origins (each
  // stride-sized block carries its sample's classification).
  const coarseRows: CoarseRowSample[] = [];
  for (let y = 0; y < params.edge; y += coarseStride) {
    let escaped = 0;
    let attracting = 0;
    let unresolved = 0;
    let escapeIterationSum = 0;
    for (let x = 0; x < params.edge; x += coarseStride) {
      const offset = y * params.edge + x;
      const status = coarse.status[offset] ?? 0;
      if (status === 1) {
        escaped += 1;
        escapeIterationSum += coarse.smoothIterationOrMultiplierMagnitude[offset] ?? 0;
      } else if (status === 2) {
        attracting += 1;
      } else {
        unresolved += 1;
      }
    }
    const pixels = escaped + attracting + unresolved;
    if (pixels === 0) throw new Error(`coarse row ${y} sampled no pixels`);
    coarseRows.push({
      y,
      pixels,
      escaped,
      attracting,
      unresolved,
      unresolvedFraction: unresolved / pixels,
      meanEscapeIteration: escaped > 0 ? escapeIterationSum / escaped : 0,
      estimatedCostUnits:
        (escapeIterationSum + (attracting + unresolved) * coarseQuality.maxIterations) / pixels,
    });
  }

  // Warmup stable rows (untimed) so JIT/IC warmup does not land in row 0.
  const warmupRows = Math.min(params.warmupRows, params.edge);
  if (warmupRows > 0) {
    await classifyRows(request, quality, 1, 0, warmupRows, signal);
  }

  // Stable pass row by row: per-row classifyMs is compute only (yield waits
  // are recorded separately), so per-band compute time is the sum over rows.
  const stableRows: StableRowSample[] = [];
  for (let y = 0; y < params.edge; y += 1) {
    const row = await classifyRows(request, quality, 1, y, y + 1, signal);
    stableRows.push({
      y,
      classifyMs: row.timing.classifyMs,
      yieldWaitMs: row.timing.yieldWaitMs,
      yieldCount: row.timing.yieldCount,
    });
  }

  return {
    caseId: corpusCase.id,
    profileId: params.profileId,
    edge: params.edge,
    warmupRows,
    coarseStride,
    coarseQuality: {
      maxIterations: coarseQuality.maxIterations,
      maxPeriod: coarseQuality.maxPeriod,
    },
    stableQuality: {
      maxIterations: quality.maxIterations,
      maxPeriod: quality.maxPeriod,
    },
    viewport: {
      centerRe: corpusCase.viewport.center.re,
      centerIm: corpusCase.viewport.center.im,
      spanY: corpusCase.viewport.spanY,
    },
    coarseRows,
    stableRows,
  };
};
