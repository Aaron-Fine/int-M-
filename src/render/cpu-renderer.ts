import {
  classifyOrbit,
  colorForAttracting,
  colorForEscaped,
  colorForUnresolved,
  modulateForMultiplierAngle,
  validateRasterSize,
  type Complex,
  type OrbitResult,
  type RenderQuality,
  type Rgba,
  type SemanticView,
} from '../domain';
import { classifyRows } from './classify-rows';
import { RenderCancelledError } from './render-cancelled-error';
import { unpackPeriod, unpackStatus } from './packed-semantic';
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
  const band = await classifyRows(
    request,
    quality,
    stride,
    0,
    request.size.height,
    signal,
    request.classifierMode,
    request.yieldMechanism,
  );
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

const textureUnresolved = (color: Rgba, x: number, y: number, stride: number): Rgba => {
  const cellSize = stride === 1 ? 4 : stride;
  const alternate = (Math.floor(x / cellSize) + Math.floor(y / cellSize)) % 2 === 0;
  const offset = alternate ? -12 : 12;
  return [color[0] + offset, color[1] + offset, color[2] + offset, color[3]];
};

const colorForSemanticPixel = (
  status: 0 | 1 | 2,
  period: number,
  smooth: number,
  angle: number,
  x: number,
  y: number,
  stride: number,
  view: SemanticView,
): Rgba => {
  switch (status) {
    case 1:
      return colorForEscaped(smooth, view);
    case 2: {
      const color = colorForAttracting(period, smooth, angle, view);
      if (view !== 'multiplier') return color;
      return modulateForMultiplierAngle(color, x, y, angle);
    }
    default:
      return textureUnresolved(colorForUnresolved(), x, y, stride);
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
        ? await pool.classifyStable(
            request,
            quality,
            signal,
            ...(request.classifierMode === undefined ? [] : [request.classifierMode]),
          )
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
    const { width } = frame.size;
    const rgba = new Uint8ClampedArray(width * frame.size.height * 4);
    // Bands partition the raster rows exactly, so iterating bands in order
    // covers every pixel once (packed status+period decode per pixel).
    for (const band of frame.bands) {
      const { packedStatusPeriod, smoothIterationOrMultiplierMagnitude, multiplierAngle } = band;
      for (let index = 0; index < packedStatusPeriod.length; index += 1) {
        const word = packedStatusPeriod[index];
        if (word === undefined) break;
        const status = unpackStatus(word);
        const smooth = smoothIterationOrMultiplierMagnitude[index] ?? 0;
        const angle = multiplierAngle[index] ?? 0;
        const pixel = (band.y0 + Math.floor(index / width)) * width + (index % width);
        const color = colorForSemanticPixel(
          status,
          unpackPeriod(word),
          smooth,
          angle,
          pixel % width,
          Math.floor(pixel / width),
          frame.sampleStride,
          view,
        );
        const offset = pixel * 4;
        rgba[offset] = color[0];
        rgba[offset + 1] = color[1];
        rgba[offset + 2] = color[2];
        rgba[offset + 3] = color[3];
      }
    }
    return {
      stage: frame.stage,
      size: frame.size,
      rgba,
      progress: frame.progress,
    };
  }
}
