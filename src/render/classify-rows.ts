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
import { packStatusPeriod } from './packed-semantic';
import type { DynamicsRenderRequest, SemanticBand, SemanticStageTiming } from './renderer';
import { shouldYieldToEventLoop, yieldMaskForQuality } from './yield-policy';
import {
  createYieldScheduler,
  defaultRowYieldScheduler,
  type YieldMechanism,
} from './yield-scheduler';

const throwIfAborted = (signal: AbortSignal): void => {
  if (signal.aborted) {
    throw new RenderCancelledError();
  }
};

const nowMs = (): number => performance.now();

/**
 * Pre-sliced output buffers a caller (tile worker via the supervisor's
 * zero-copy band views) can hand to classifyRows, eliminating the per-band
 * output allocations. Lengths must match the band exactly.
 */
export interface BandOutputBuffers {
  readonly packedStatusPeriod: Uint32Array<ArrayBuffer>;
  readonly smoothIterationOrMultiplierMagnitude: Float64Array<ArrayBuffer>;
  readonly multiplierAngle: Float64Array<ArrayBuffer>;
}

export interface ClassifyRowsResult extends SemanticBand {
  readonly timing: SemanticStageTiming;
  /**
   * Differential-mode disagreement record (classifierMode 'differential'
   * only): both kernels ran per pixel, the legacy answer filled the band
   * channels, and the divergences were counted here. Undefined otherwise.
   */
  readonly differential?: DifferentialStats;
}

/**
 * Writes one primitive classification record into the band storage. The
 * channel encoding is packed (poc-packed-1.0.0): status and primitive period
 * share one Uint32; the smooth escape iteration or multiplier magnitude and
 * the multiplier angle keep their Float64 channels; period/angle are zero
 * for non-attracting statuses.
 */
const writeSampleToBand = (
  band: BandOutputBuffers,
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
  const word = packStatusPeriod(status, period);

  const limitY = Math.min(y1, y + stride);
  const limitX = Math.min(width, x + stride);
  for (let writeY = y; writeY < limitY; writeY += 1) {
    for (let writeX = x; writeX < limitX; writeX += 1) {
      const offset = (writeY - y0) * width + writeX;
      band.packedStatusPeriod[offset] = word;
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
  // Versioned classifier mode (PR 4). Optional: every existing call site
  // keeps its exact behavior with the 'legacy-scan' default.
  classifierMode?: ClassifierMode,
  // Yield mechanism (renderer-path detail): 'message-channel' replaces the
  // nested setTimeout(0) row yields whose budget was largely the 4 ms
  // nested-timer clamp; 'timeout' is the paired-evidence measurement arm.
  yieldMechanism?: YieldMechanism,
  // Pre-sliced output buffers (zero-copy detail): when present the band is
  // classified directly into them and nothing is allocated per call.
  output?: BandOutputBuffers,
): Promise<ClassifyRowsResult> {
  const { width } = request.size;
  const length = (y1 - y0) * width;
  const band: BandOutputBuffers = output ?? {
    packedStatusPeriod: new Uint32Array(length),
    smoothIterationOrMultiplierMagnitude: new Float64Array(length),
    multiplierAngle: new Float64Array(length),
  };
  if (
    band.packedStatusPeriod.length !== length ||
    band.smoothIterationOrMultiplierMagnitude.length !== length ||
    band.multiplierAngle.length !== length
  ) {
    throw new RangeError('band output buffers must match the band size');
  }
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
  // The 'timeout' arm is the paired-evidence measurement arm; it is created
  // per call because its pending set must not outlive the band.
  const rowYields =
    yieldMechanism === 'timeout'
      ? createYieldScheduler({ mechanism: 'timeout' })
      : defaultRowYieldScheduler();
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
      // MessageChannel port yield by default: no 4 ms nested-timer clamp, so
      // cancellation preempts between kernels on the same (or sooner)
      // schedule as the previous setTimeout(0) yields.
      await rowYields.yieldToEventLoop();
      yieldWaitMs += nowMs() - yieldStarted;
      yieldCount += 1;
    }
  }

  throwIfAborted(signal);
  // exactOptionalPropertyTypes: build the optional fields via narrowed
  // conditional spreads so keys are absent (not undefined) in the default.
  const differentialStats = classifierMode === 'differential' ? classifier.differentialStats : null;
  return {
    y0,
    y1,
    packedStatusPeriod: band.packedStatusPeriod,
    smoothIterationOrMultiplierMagnitude: band.smoothIterationOrMultiplierMagnitude,
    multiplierAngle: band.multiplierAngle,
    timing: {
      classifyMs: nowMs() - wallStarted - yieldWaitMs,
      yieldWaitMs,
      yieldCount,
    },
    ...(differentialStats === null ? {} : { differential: differentialStats }),
  };
}
