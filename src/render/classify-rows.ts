import {
  createViewportTransform,
  OrbitClassifier,
  OrbitScratch,
  type OrbitOptions,
  type OrbitResult,
  type RenderQuality,
} from '../domain';
import { RenderCancelledError } from './cpu-renderer';
import type { DynamicsRenderRequest } from './renderer';
import type { BandArrays } from './row-bands';
import { shouldYieldToEventLoop, yieldMaskForQuality } from './yield-policy';

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

const writeOrbitResult = (
  band: BandArrays,
  width: number,
  y0: number,
  y1: number,
  x: number,
  y: number,
  stride: number,
  result: OrbitResult,
): void => {
  let status = 0;
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

  const limitY = Math.min(y1, y + stride);
  const limitX = Math.min(width, x + stride);
  for (let writeY = y; writeY < limitY; writeY += 1) {
    for (let writeX = x; writeX < limitX; writeX += 1) {
      const offset = (writeY - y0) * width + writeX;
      band.status[offset] = status;
      band.period[offset] = period;
      band.smoothIterationOrMultiplierMagnitude[offset] = primary;
      band.multiplierAngle[offset] = secondary;
    }
  }
};

export async function classifyRows(
  request: DynamicsRenderRequest,
  quality: RenderQuality,
  stride: number,
  y0: number,
  y1: number,
  signal: AbortSignal,
): Promise<BandArrays> {
  const { width } = request.size;
  const length = (y1 - y0) * width;
  const band: BandArrays = {
    status: new Uint8Array(length),
    period: new Uint32Array(length),
    smoothIterationOrMultiplierMagnitude: new Float64Array(length),
    multiplierAngle: new Float64Array(length),
  };
  const orbitOptions: Partial<OrbitOptions> = {
    maxIterations: quality.maxIterations,
    maxPeriod: quality.maxPeriod,
  };
  const classifier = new OrbitClassifier(orbitOptions, new OrbitScratch(quality.maxPeriod));
  const viewportTransform = createViewportTransform(request.viewport, request.size);
  const yieldRowMask = yieldMaskForQuality(quality.maxIterations);

  for (let y = y0; y < y1; y += stride) {
    throwIfAborted(signal);
    for (let x = 0; x < width; x += stride) {
      const sampleX = Math.min(width - 1, x + (stride - 1) / 2);
      const sampleY = Math.min(request.size.height - 1, y + (stride - 1) / 2);
      const point = viewportTransform.pixelToComplex(sampleX, sampleY);
      writeOrbitResult(band, width, y0, y1, x, y, stride, classifier.classify(point));
    }

    if (shouldYieldToEventLoop(y, stride, yieldRowMask)) {
      await yieldToWorkerEventLoop();
    }
  }

  throwIfAborted(signal);
  return band;
}
