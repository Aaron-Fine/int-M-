import {
  buildPeriodKey,
  classifyOrbit,
  validateRasterSize,
  type Complex,
  type OrbitResult,
  type RenderQuality,
  type SemanticView,
} from '../domain';
import { classifyRows } from './classify-rows';
import { COARSE_BASE_ITERATIONS } from './coarse-budget';
import { colorizeFrame, periodHistogram, validIsolatedPeriod } from './colorize';
import { RenderCancelledError } from './render-cancelled-error';
import {
  resolveRenderQuality,
  type DynamicsRenderRequest,
  type RasterFrame,
  type Renderer,
  type RenderStage,
  type SemanticBand,
  type SemanticFrame,
  type SemanticFrameConsumer,
  type TilePool,
} from './renderer';

export { RenderCancelledError };

const throwIfAborted = (signal: AbortSignal): void => {
  if (signal.aborted) {
    throw new RenderCancelledError();
  }
};

const classifyFull = async (
  request: DynamicsRenderRequest,
  quality: RenderQuality,
  stride: number,
  stage: RenderStage,
  signal: AbortSignal,
): Promise<SemanticFrame> => {
  const band = await classifyRows(request, quality, stride, 0, request.size.height, signal);

  throwIfAborted(signal);
  const semanticBand: SemanticBand = {
    y0: 0,
    y1: request.size.height,
    packedStatusPeriod: band.packedStatusPeriod,
    smoothIterationOrMultiplierMagnitude: band.smoothIterationOrMultiplierMagnitude,
    multiplierAngle: band.multiplierAngle,
  };
  return {
    stage,
    size: request.size,
    sampleStride: stride,
    bands: [semanticBand],
    progress: stage === 'coarse' ? 0.2 : 1,
    timing: band.timing,
  };
};

/**
 * The quality the coarse pass runs at: the stride floored at 2, the iteration
 * budget capped at COARSE_BASE_ITERATIONS and the period cap at 16.
 */
export const coarseRenderQuality = (quality: RenderQuality): RenderQuality => ({
  maxIterations: Math.min(quality.maxIterations, COARSE_BASE_ITERATIONS),
  maxPeriod: Math.min(quality.maxPeriod, 16),
  coarseStride: Math.max(2, quality.coarseStride),
});

export class CpuRenderer implements Renderer {
  public constructor(private readonly tilePool?: TilePool) {}

  public async render(
    request: DynamicsRenderRequest,
    signal: AbortSignal,
    onFrame: SemanticFrameConsumer,
  ): Promise<void> {
    validateRasterSize(request.size);
    const quality = resolveRenderQuality(request.quality);
    const coarseQuality = coarseRenderQuality(quality);
    const coarseStride = coarseQuality.coarseStride;

    const coarse = await classifyFull(request, coarseQuality, coarseStride, 'coarse', signal);
    throwIfAborted(signal);
    await onFrame(coarse);
    throwIfAborted(signal);

    const pool = this.tilePool;
    const stable =
      pool !== undefined && pool.size > 1
        ? await pool.classifyStable(request, quality, signal)
        : await classifyFull(request, quality, 1, 'stable', signal);
    throwIfAborted(signal);
    await onFrame(stable);
  }

  public async quiesce(): Promise<void> {
    await this.tilePool?.quiesce?.();
  }

  public inspect(point: Complex, quality?: Partial<RenderQuality>): OrbitResult {
    const resolved = resolveRenderQuality(quality);
    return classifyOrbit(point, {
      maxIterations: resolved.maxIterations,
      maxPeriod: resolved.maxPeriod,
    });
  }

  public colorize(frame: SemanticFrame, view: SemanticView, isolatedPeriod?: number): RasterFrame {
    // The period view ranks this frame's own histogram (PLAN §8, Q1), so a
    // recolor of a cached frame reproduces the key without reclassifying.
    const periodKey = view === 'period' ? buildPeriodKey(periodHistogram(frame)) : undefined;
    const isolated = periodKey === undefined ? undefined : validIsolatedPeriod(isolatedPeriod);
    const rgba = colorizeFrame(frame, view, periodKey, isolated);
    return {
      stage: frame.stage,
      size: frame.size,
      rgba,
      progress: frame.progress,
      ...(periodKey === undefined ? {} : { periodKey }),
      ...(isolated === undefined ? {} : { isolatedPeriod: isolated }),
    };
  }
}
