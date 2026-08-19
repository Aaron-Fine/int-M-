import {
  classifyOrbit,
  colorForAttracting,
  colorForEscaped,
  colorForUnresolved,
  validateRasterSize,
  type Complex,
  type OrbitResult,
  type RenderQuality,
  type Rgba,
  type SemanticView,
} from '../domain';
import type { TilePool } from '../worker/tile-pool';
import { classifyRows } from './classify-rows';
import {
  resolveRenderQuality,
  type DynamicsRenderRequest,
  type RasterFrame,
  type Renderer,
  type RenderStage,
  type SemanticFrame,
  type SemanticFrameConsumer,
} from './renderer';

export class RenderCancelledError extends Error {
  public constructor() {
    super('render cancelled');
    this.name = 'RenderCancelledError';
  }
}

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
  return {
    stage,
    size: request.size,
    sampleStride: stride,
    status: band.status as Uint8Array<ArrayBuffer>,
    period: band.period as Uint32Array<ArrayBuffer>,
    smoothIterationOrMultiplierMagnitude:
      band.smoothIterationOrMultiplierMagnitude as Float64Array<ArrayBuffer>,
    multiplierAngle: band.multiplierAngle as Float64Array<ArrayBuffer>,
    progress: stage === 'coarse' ? 0.2 : 1,
    timing: band.timing,
  };
};

const textureUnresolved = (color: Rgba, x: number, y: number, stride: number): Rgba => {
  const cellSize = stride === 1 ? 4 : stride;
  const alternate = (Math.floor(x / cellSize) + Math.floor(y / cellSize)) % 2 === 0;
  const offset = alternate ? -12 : 12;
  return [color[0] + offset, color[1] + offset, color[2] + offset, color[3]];
};

const colorForSemanticPixel = (frame: SemanticFrame, offset: number, view: SemanticView): Rgba => {
  switch (frame.status[offset]) {
    case 1:
      return colorForEscaped(frame.smoothIterationOrMultiplierMagnitude[offset] ?? 0, view);
    case 2:
      return colorForAttracting(
        frame.period[offset] ?? 0,
        frame.smoothIterationOrMultiplierMagnitude[offset] ?? 0,
        frame.multiplierAngle[offset] ?? 0,
        view,
      );
    default: {
      const x = offset % frame.size.width;
      const y = Math.floor(offset / frame.size.width);
      return textureUnresolved(colorForUnresolved(), x, y, frame.sampleStride);
    }
  }
};

export class CpuRenderer implements Renderer {
  public constructor(private readonly tilePool?: TilePool) {}

  public async render(
    request: DynamicsRenderRequest,
    signal: AbortSignal,
    onFrame: SemanticFrameConsumer,
  ): Promise<void> {
    validateRasterSize(request.size);
    const quality = resolveRenderQuality(request.quality);
    const coarseStride = Math.max(2, quality.coarseStride);
    const coarseQuality: RenderQuality = {
      maxIterations: Math.min(quality.maxIterations, 256),
      maxPeriod: Math.min(quality.maxPeriod, 16),
      coarseStride,
    };

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

  public inspect(point: Complex, quality?: Partial<RenderQuality>): OrbitResult {
    const resolved = resolveRenderQuality(quality);
    return classifyOrbit(point, {
      maxIterations: resolved.maxIterations,
      maxPeriod: resolved.maxPeriod,
    });
  }

  public colorize(frame: SemanticFrame, view: SemanticView): RasterFrame {
    const rgba = new Uint8ClampedArray(frame.size.width * frame.size.height * 4);
    for (let pixel = 0; pixel < frame.status.length; pixel += 1) {
      const color = colorForSemanticPixel(frame, pixel, view);
      const offset = pixel * 4;
      rgba[offset] = color[0];
      rgba[offset + 1] = color[1];
      rgba[offset + 2] = color[2];
      rgba[offset + 3] = color[3];
    }
    return {
      stage: frame.stage,
      size: frame.size,
      rgba,
      progress: frame.progress,
    };
  }
}
