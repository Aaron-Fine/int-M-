import {
  classifyOrbit,
  colorForAttracting,
  colorForEscaped,
  colorForUnresolved,
  createViewportTransform,
  OrbitClassifier,
  OrbitScratch,
  validateRasterSize,
  type Complex,
  type OrbitOptions,
  type OrbitResult,
  type RenderQuality,
  type Rgba,
  type SemanticView,
} from '../domain';
import {
  resolveRenderQuality,
  type DynamicsRenderRequest,
  type RasterFrame,
  type Renderer,
  type RenderStage,
  type SemanticFrame,
  type SemanticFrameConsumer,
  type SemanticStatusCode,
} from './renderer';
import { shouldYieldToEventLoop, yieldMaskForQuality } from './yield-policy';

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

const yieldToWorkerEventLoop = async (): Promise<void> => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
};

const nowMs = (): number => performance.now();

const writeSemanticBlock = (
  frame: SemanticFrame,
  x: number,
  y: number,
  stride: number,
  result: OrbitResult,
): void => {
  let status: SemanticStatusCode = 0;
  let period = 0;
  let primary = 0;
  let secondary = 0;

  if (result.status === 'escaped') {
    status = 1;
    primary = result.smoothIteration;
  } else if (result.status === 'attracting-cycle') {
    status = 2;
    period = result.period;
    primary = result.multiplierMagnitude;
    secondary = result.multiplierAngle;
  }

  const limitY = Math.min(frame.size.height, y + stride);
  const limitX = Math.min(frame.size.width, x + stride);
  for (let writeY = y; writeY < limitY; writeY += 1) {
    for (let writeX = x; writeX < limitX; writeX += 1) {
      const offset = writeY * frame.size.width + writeX;
      frame.status[offset] = status;
      frame.period[offset] = period;
      frame.smoothIterationOrMultiplierMagnitude[offset] = primary;
      frame.multiplierAngle[offset] = secondary;
    }
  }
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

const stageSemantics = async (
  request: DynamicsRenderRequest,
  quality: RenderQuality,
  stride: number,
  stage: RenderStage,
  signal: AbortSignal,
): Promise<SemanticFrame> => {
  const { width, height } = request.size;
  const pixelCount = width * height;
  const frame: SemanticFrame = {
    stage,
    size: request.size,
    sampleStride: stride,
    status: new Uint8Array(pixelCount),
    period: new Uint32Array(pixelCount),
    smoothIterationOrMultiplierMagnitude: new Float64Array(pixelCount),
    multiplierAngle: new Float64Array(pixelCount),
    progress: stage === 'coarse' ? 0.2 : 1,
  };
  const orbitOptions: Partial<OrbitOptions> = {
    maxIterations: quality.maxIterations,
    maxPeriod: quality.maxPeriod,
  };
  const orbitScratch = new OrbitScratch(quality.maxPeriod);
  const classifier = new OrbitClassifier(orbitOptions, orbitScratch);
  const viewportTransform = createViewportTransform(request.viewport, request.size);
  const yieldRowMask = yieldMaskForQuality(quality.maxIterations);
  const wallStarted = nowMs();
  let yieldWaitMs = 0;
  let yieldCount = 0;

  for (let y = 0; y < height; y += stride) {
    throwIfAborted(signal);
    for (let x = 0; x < width; x += stride) {
      const sampleX = Math.min(width - 1, x + (stride - 1) / 2);
      const sampleY = Math.min(height - 1, y + (stride - 1) / 2);
      const point = viewportTransform.pixelToComplex(sampleX, sampleY);
      writeSemanticBlock(frame, x, y, stride, classifier.classify(point));
    }

    // Browser messages, including cancel, cannot be processed during a long
    // synchronous loop. Yield often enough to preserve the cancellation SLO.
    if (shouldYieldToEventLoop(y, stride, yieldRowMask)) {
      const yieldStarted = nowMs();
      await yieldToWorkerEventLoop();
      yieldWaitMs += nowMs() - yieldStarted;
      yieldCount += 1;
    }
  }

  throwIfAborted(signal);
  return {
    ...frame,
    timing: {
      classifyMs: nowMs() - wallStarted - yieldWaitMs,
      yieldWaitMs,
      yieldCount,
    },
  };
};

export class CpuRenderer implements Renderer {
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

    const coarse = await stageSemantics(request, coarseQuality, coarseStride, 'coarse', signal);
    await onFrame(coarse);
    throwIfAborted(signal);

    const stable = await stageSemantics(request, quality, 1, 'stable', signal);
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
