import {
  classifyOrbit,
  colorForOrbit,
  createViewportTransform,
  OrbitClassifier,
  OrbitScratch,
  validateRasterSize,
  type Complex,
  type OrbitOptions,
  type OrbitResult,
  type RenderQuality,
} from '../domain';
import type {
  FrameConsumer,
  RasterFrame,
  RasterRenderRequest,
  RenderStage,
  Renderer,
} from './renderer';

export const DEFAULT_RENDER_QUALITY: RenderQuality = Object.freeze({
  maxIterations: 512,
  maxPeriod: 32,
  coarseStride: 8,
});

export class RenderCancelledError extends Error {
  public constructor() {
    super('render cancelled');
    this.name = 'RenderCancelledError';
  }
}

const resolveQuality = (quality: Partial<RenderQuality> | undefined): RenderQuality => {
  const resolved = { ...DEFAULT_RENDER_QUALITY, ...quality };
  if (
    !Number.isInteger(resolved.maxIterations) ||
    resolved.maxIterations < 1 ||
    !Number.isInteger(resolved.maxPeriod) ||
    resolved.maxPeriod < 1 ||
    !Number.isInteger(resolved.coarseStride) ||
    resolved.coarseStride < 1
  ) {
    throw new RangeError('render quality values must be positive integers');
  }
  return resolved;
};

const throwIfAborted = (signal: AbortSignal): void => {
  if (signal.aborted) {
    throw new RenderCancelledError();
  }
};

const yieldToWorkerEventLoop = async (): Promise<void> => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
};

const writeBlock = (
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  stride: number,
  color: readonly [number, number, number, number],
): void => {
  const limitY = Math.min(height, y + stride);
  const limitX = Math.min(width, x + stride);
  for (let writeY = y; writeY < limitY; writeY += 1) {
    for (let writeX = x; writeX < limitX; writeX += 1) {
      const offset = (writeY * width + writeX) * 4;
      rgba[offset] = color[0];
      rgba[offset + 1] = color[1];
      rgba[offset + 2] = color[2];
      rgba[offset + 3] = color[3];
    }
  }
};

const textureUnresolved = (
  color: readonly [number, number, number, number],
  x: number,
  y: number,
  stride: number,
): readonly [number, number, number, number] => {
  const cellSize = stride === 1 ? 4 : stride;
  const alternate = (Math.floor(x / cellSize) + Math.floor(y / cellSize)) % 2 === 0;
  const offset = alternate ? -12 : 12;
  return [color[0] + offset, color[1] + offset, color[2] + offset, color[3]];
};

const stageRaster = async (
  request: RasterRenderRequest,
  quality: RenderQuality,
  stride: number,
  stage: RenderStage,
  signal: AbortSignal,
): Promise<RasterFrame> => {
  const { width, height } = request.size;
  const rgba = new Uint8ClampedArray(width * height * 4);
  const orbitOptions: Partial<OrbitOptions> = {
    maxIterations: quality.maxIterations,
    maxPeriod: quality.maxPeriod,
  };
  const orbitScratch = new OrbitScratch(quality.maxPeriod);
  const classifier = new OrbitClassifier(orbitOptions, orbitScratch);
  const viewportTransform = createViewportTransform(request.viewport, request.size);
  const yieldRowMask = quality.maxIterations > DEFAULT_RENDER_QUALITY.maxIterations ? 1 : 7;

  for (let y = 0; y < height; y += stride) {
    throwIfAborted(signal);
    for (let x = 0; x < width; x += stride) {
      const sampleX = Math.min(width - 1, x + (stride - 1) / 2);
      const sampleY = Math.min(height - 1, y + (stride - 1) / 2);
      const point = viewportTransform.pixelToComplex(sampleX, sampleY);
      const result = classifier.classify(point);
      const semanticColor = colorForOrbit(result, request.semanticView);
      const color =
        result.status === 'unresolved'
          ? textureUnresolved(semanticColor, x, y, stride)
          : semanticColor;
      writeBlock(rgba, width, height, x, y, stride, color);
    }

    // Browser messages, including cancel, cannot be processed during a long
    // synchronous loop. Yield often enough to preserve the cancellation SLO.
    if ((Math.floor(y / stride) & yieldRowMask) === yieldRowMask) {
      await yieldToWorkerEventLoop();
    }
  }

  throwIfAborted(signal);
  return {
    stage,
    size: request.size,
    rgba,
    progress: stage === 'coarse' ? 0.2 : 1,
  };
};

export class CpuRenderer implements Renderer {
  public async render(
    request: RasterRenderRequest,
    signal: AbortSignal,
    onFrame: FrameConsumer,
  ): Promise<void> {
    validateRasterSize(request.size);
    const quality = resolveQuality(request.quality);
    const coarseStride = Math.max(2, quality.coarseStride);
    const coarseQuality: RenderQuality = {
      maxIterations: Math.min(quality.maxIterations, 256),
      maxPeriod: Math.min(quality.maxPeriod, 16),
      coarseStride,
    };

    const coarse = await stageRaster(request, coarseQuality, coarseStride, 'coarse', signal);
    await onFrame(coarse);
    throwIfAborted(signal);

    const stable = await stageRaster(request, quality, 1, 'stable', signal);
    await onFrame(stable);
  }

  public inspect(point: Complex, quality?: Partial<RenderQuality>): OrbitResult {
    const resolved = resolveQuality(quality);
    return classifyOrbit(point, {
      maxIterations: resolved.maxIterations,
      maxPeriod: resolved.maxPeriod,
    });
  }
}
