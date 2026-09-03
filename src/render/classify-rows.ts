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
import { packStatusPeriod, unpackStatus } from './packed-semantic';
import {
  createPerfCounters,
  perfCountersFromCheckpointMetrics,
  type MutablePerfCounters,
  type PerfCounters,
} from './perf-counters';
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
  /**
   * Opt-in diagnostics counters (plan §8, `?perf=1&perfCounters=1` only):
   * one preallocated record per band. Undefined — and never allocated —
   * unless the caller opted in.
   */
  readonly counters?: PerfCounters;
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
  // Opt-in diagnostics counters (plan §8). Absent — never even allocated —
  // unless the caller opted in; with it, the classifier selects the
  // instrumented kernel variant OUTSIDE the raster loop below.
  perfCounters?: boolean,
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
  // One preallocated counters record per band, created only on opt-in; the
  // legacy/differential kernels write their fields into it directly (it is a
  // structural superset of the kernel sink), while checkpoint mode reads the
  // kernel's own metrics below.
  const counters: MutablePerfCounters | undefined =
    perfCounters === true ? createPerfCounters() : undefined;
  const orbitOptions: Partial<OrbitOptions> = {
    maxIterations: quality.maxIterations,
    maxPeriod: quality.maxPeriod,
    ...(classifierMode === undefined ? {} : { classifierMode }),
  };
  const classifier = new OrbitClassifier(
    orbitOptions,
    new OrbitScratch(quality.maxPeriod),
    ...(counters === undefined ? [] : [counters]),
  );
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
  const countersResult =
    counters === undefined
      ? undefined
      : assembleCounters(counters, classifier, classifierMode, band, width, stride, y0, y1);
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
    ...(countersResult === undefined ? {} : { counters: countersResult }),
  };
}

/**
 * Opt-in counters assembly (plan §8), run once per band after classification.
 * Status totals come from one pass over the band's written cells; the
 * reported kernel's counters were either written into the sink directly
 * (legacy/differential instrumented scan) or live in the checkpoint kernel's
 * own preallocated record.
 */
const assembleCounters = (
  counters: MutablePerfCounters,
  classifier: OrbitClassifier,
  classifierMode: ClassifierMode | undefined,
  band: BandOutputBuffers,
  width: number,
  stride: number,
  y0: number,
  y1: number,
): PerfCounters => {
  // Status totals over the classified cells: block origins of the sampled
  // grid (stride-folded cells on the coarse pass, every pixel at stride 1).
  // Unwritten words are never read (a zero word is not a valid status).
  const packed = band.packedStatusPeriod;
  for (let y = y0; y < y1; y += stride) {
    const rowOffset = (y - y0) * width;
    for (let x = 0; x < width; x += stride) {
      const word = packed[rowOffset + x];
      if (word === undefined) continue;
      const status = unpackStatus(word);
      if (status === 1) counters.escaped += 1;
      else if (status === 2) counters.attracting += 1;
      else counters.unresolved += 1;
    }
  }
  const checkpointMetrics = classifier.checkpointMetrics;
  if (classifierMode === 'checkpoint' && checkpointMetrics !== null) {
    // Checkpoint mode: the schedule's counters live in its own record (the
    // legacy sink above is untouched); map them into the flat vocabulary.
    const mapped = perfCountersFromCheckpointMetrics(checkpointMetrics);
    mapped.escaped = counters.escaped;
    mapped.attracting = counters.attracting;
    mapped.unresolved = counters.unresolved;
    return mapped;
  }
  // Legacy-scan / differential: the instrumented scan wrote the reported
  // kernel's counters straight into the sink. Checkpoint-side metrics
  // accumulated by the differential's second kernel are intentionally
  // NOT merged (they would mix the two kernels' comparison totals).
  return counters;
};
