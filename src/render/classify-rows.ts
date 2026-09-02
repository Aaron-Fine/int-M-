import {
  createOrbitSample,
  createViewportTransform,
  OrbitClassifier,
  OrbitScratch,
  type ClassifierMode,
  type DifferentialStats,
  type MutableComplex,
  type OrbitOptions,
  type OrbitSample,
  type RenderQuality,
} from '../domain';
import { RenderCancelledError } from './render-cancelled-error';
import type { DynamicsRenderRequest, SemanticStageTiming } from './renderer';
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

const nowMs = (): number => performance.now();

export interface ClassifyRowsResult extends BandArrays {
  readonly timing: SemanticStageTiming;
  /**
   * Differential-mode disagreement record (classifierMode 'differential'
   * only): both kernels ran per pixel, the legacy answer filled the band
   * channels, and the divergences were counted here. Undefined otherwise.
   */
  readonly differential?: DifferentialStats;
}

/**
 * Copies one primitive classification record into the band channels. The
 * channel encoding is unchanged: smooth escape iteration or multiplier
 * magnitude in the primary Float64 channel, multiplier angle secondary, and
 * zero period/angle for non-attracting statuses.
 */
const writeSampleToBand = (
  band: BandArrays,
  width: number,
  y0: number,
  y1: number,
  x: number,
  y: number,
  stride: number,
  sample: Readonly<OrbitSample>,
): void => {
  const status = sample.status;
  const period = status === 2 ? sample.period : 0;
  const primary =
    status === 1 ? sample.smoothIteration : status === 2 ? sample.multiplierMagnitude : 0;
  const secondary = status === 2 ? sample.multiplierAngle : 0;

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
  // Versioned classifier mode (PR 4). Optional and last: every existing
  // call site (supervisor, tile workers, tests) keeps its exact behavior
  // with the 'legacy-scan' default, and no worker-protocol field changes —
  // the mode rides in the classifier options built here.
  classifierMode?: ClassifierMode,
): Promise<ClassifyRowsResult> {
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
    ...(classifierMode === undefined ? {} : { classifierMode }),
  };
  const classifier = new OrbitClassifier(orbitOptions, new OrbitScratch(quality.maxPeriod));
  // Per-band working state: the classification loop below allocates nothing
  // per pixel (plan workstream B) — scalars in, band channels out.
  const sample = createOrbitSample();
  const point: MutableComplex = { re: 0, im: 0 };
  const viewportTransform = createViewportTransform(request.viewport, request.size);
  const yieldRowMask = yieldMaskForQuality(quality.maxIterations);
  const wallStarted = nowMs();
  let yieldWaitMs = 0;
  let yieldCount = 0;

  for (let y = y0; y < y1; y += stride) {
    throwIfAborted(signal);
    for (let x = 0; x < width; x += stride) {
      const sampleX = Math.min(width - 1, x + (stride - 1) / 2);
      const sampleY = Math.min(request.size.height - 1, y + (stride - 1) / 2);
      viewportTransform.pixelToComplexInto(sampleX, sampleY, point);
      classifier.classifyInto(point.re, point.im, sample);
      writeSampleToBand(band, width, y0, y1, x, y, stride, sample);
    }

    if (shouldYieldToEventLoop(y, stride, yieldRowMask)) {
      const yieldStarted = nowMs();
      await yieldToWorkerEventLoop();
      yieldWaitMs += nowMs() - yieldStarted;
      yieldCount += 1;
    }
  }

  throwIfAborted(signal);
  // exactOptionalPropertyTypes: build the optional field via a narrowed
  // conditional spread so the key is absent (not undefined) in the default.
  const differentialStats = classifierMode === 'differential' ? classifier.differentialStats : null;
  return {
    ...band,
    timing: {
      classifyMs: nowMs() - wallStarted - yieldWaitMs,
      yieldWaitMs,
      yieldCount,
    },
    ...(differentialStats === null ? {} : { differential: differentialStats }),
  };
}
