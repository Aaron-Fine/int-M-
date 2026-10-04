import {
  createViewportTransform,
  OrbitClassifier,
  type RasterOrbitSample,
  type RenderQuality,
} from '../domain';
import { RenderCancelledError } from './render-cancelled-error';
import type { DynamicsRenderRequest, SemanticStageTiming } from './renderer';
import { copyConjugateRow, type BandArrays } from './row-bands';
import { shouldYieldToEventLoop, yieldMaskForQuality } from './yield-policy';

const throwIfAborted = (signal: AbortSignal): void => {
  if (signal.aborted) throw new RenderCancelledError();
};

const yieldToWorkerEventLoop = async (): Promise<void> => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
};

export interface ClassifyRowsResult extends BandArrays {
  readonly timing: SemanticStageTiming;
}

const writeSample = (
  band: BandArrays,
  width: number,
  y0: number,
  y1: number,
  x: number,
  y: number,
  stride: number,
  sample: Readonly<RasterOrbitSample>,
  conjugate: boolean,
): void => {
  const limitY = Math.min(y1, y + stride);
  const limitX = Math.min(width, x + stride);
  for (let writeY = y; writeY < limitY; writeY += 1) {
    for (let writeX = x; writeX < limitX; writeX += 1) {
      const offset = (writeY - y0) * width + writeX;
      band.status[offset] = sample.status;
      band.period[offset] = sample.period;
      band.smoothIterationOrMultiplierMagnitude[offset] =
        sample.smoothIterationOrMultiplierMagnitude;
      band.multiplierUnitRe[offset] = sample.multiplierUnitRe;
      const im = conjugate ? -sample.multiplierUnitIm : sample.multiplierUnitIm;
      band.multiplierUnitIm[offset] = im === 0 ? 0 : im;
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
): Promise<ClassifyRowsResult> {
  const { width, height } = request.size;
  const length = (y1 - y0) * width;
  const band: BandArrays = {
    status: new Uint8Array(length),
    period: new Uint32Array(length),
    smoothIterationOrMultiplierMagnitude: new Float64Array(length),
    multiplierUnitRe: new Float32Array(length),
    multiplierUnitIm: new Float32Array(length),
  };
  const classifier = new OrbitClassifier({
    maxIterations: quality.maxIterations,
    maxPeriod: quality.maxPeriod,
    cycleDetection: quality.cycleDetection ?? 'scan',
  });
  const { viewport, unitsPerPixel } = createViewportTransform(request.viewport, request.size);
  const symmetric = stride === 1 && viewport.center.im === 0;
  // Preserve the canonical formula, avoiding cumulative addition drift at deep zoom.
  const realCoordinates = new Float64Array(width);
  for (let x = 0; x < width; x += stride) {
    const sampleX = Math.min(width - 1, x + (stride - 1) / 2);
    realCoordinates[x] = viewport.center.re + (sampleX + 0.5 - width / 2) * unitsPerPixel;
  }
  const yieldRowMask = yieldMaskForQuality(quality.maxIterations);
  const wallStarted = performance.now();
  let yieldWaitMs = 0;
  let yieldCount = 0;

  for (let y = y0; y < y1; y += stride) {
    throwIfAborted(signal);
    const mirrorY = height - 1 - y;
    if (symmetric && mirrorY >= y0 && mirrorY < y) {
      copyConjugateRow(band, (mirrorY - y0) * width, (y - y0) * width, width);
    } else {
      // Canonical upper-half sampling makes arbitrary band slices bit-identical
      // to a full symmetric frame, even when its paired row is in another band.
      const sampleY = symmetric ? Math.min(y, mirrorY) : Math.min(height - 1, y + (stride - 1) / 2);
      const cIm = viewport.center.im - (sampleY + 0.5 - height / 2) * unitsPerPixel;
      for (let x = 0; x < width; x += stride) {
        writeSample(
          band,
          width,
          y0,
          y1,
          x,
          y,
          stride,
          classifier.classifyRaster(realCoordinates[x] ?? Number.NaN, cIm),
          symmetric && y > mirrorY,
        );
      }
    }
    if (shouldYieldToEventLoop(y, stride, yieldRowMask)) {
      const yieldStarted = performance.now();
      await yieldToWorkerEventLoop();
      yieldWaitMs += performance.now() - yieldStarted;
      yieldCount += 1;
    }
  }
  throwIfAborted(signal);
  return {
    ...band,
    timing: { classifyMs: performance.now() - wallStarted - yieldWaitMs, yieldWaitMs, yieldCount },
  };
}
