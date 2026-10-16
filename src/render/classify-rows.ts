import {
  createOrbitSample,
  createViewportTransform,
  OrbitClassifier,
  OrbitScratch,
  mirrorSourceOf,
  type ConjugateMirrorPlan,
  type OrbitOptions,
  type OrbitSample,
  type RenderQuality,
  type ViewportTransform,
} from '../domain';
import { RenderCancelledError } from './render-cancelled-error';
import { TriggeredRowKernel } from './triggered-rows';
import { packStatusPeriod } from './packed-semantic';
import type { DynamicsRenderRequest, SemanticBand, SemanticStageTiming } from './renderer';
import { shouldYieldToEventLoop, yieldMaskForQuality } from './yield-policy';
import { defaultRowYieldScheduler } from './yield-scheduler';

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

/**
 * Prepared real coordinates: entry x holds
 * the real part of the sampled column for the grid column x, using the exact
 * pixel-center expression of createViewportTransform.pixelToComplexInto with
 * the same operation order. Only grid columns (multiples of stride) are read.
 */
export const prepareRealColumns = (
  transform: ViewportTransform,
  width: number,
  stride: number,
  out: Float64Array,
): void => {
  const { center } = transform.viewport;
  const { unitsPerPixel } = transform;
  for (let x = 0; x < width; x += stride) {
    const sampleX = Math.min(width - 1, x + (stride - 1) / 2);
    out[x] = center.re + (sampleX + 0.5 - width / 2) * unitsPerPixel;
  }
};

/**
 * Prepared imaginary coordinate of the sampled row for grid row y: the exact
 * pixel-center expression of pixelToComplexInto, evaluated once per row.
 */
export const preparedRowImaginary = (
  transform: ViewportTransform,
  height: number,
  stride: number,
  y: number,
): number => {
  const sampleY = Math.min(height - 1, y + (stride - 1) / 2);
  return transform.viewport.center.im - (sampleY + 0.5 - height / 2) * transform.unitsPerPixel;
};

const assertMirrorStride = (plan: ConjugateMirrorPlan | undefined, stride: number): void => {
  if (plan !== undefined && stride !== 1) {
    throw new RangeError('conjugate mirroring requires stride 1');
  }
};

/** True when the plan assigns row y a source row (it is copied, not classified). */
const isMirroredRow = (plan: ConjugateMirrorPlan | undefined, y: number): boolean =>
  plan !== undefined && mirrorSourceOf(plan, y) >= 0;

interface RowLayout {
  readonly width: number;
  readonly height: number;
  readonly y0: number;
  readonly y1: number;
  readonly y: number;
  readonly stride: number;
}

/**
 * Classifies one sampled row into the band with the scalar classifier: the
 * real part comes from the prepared per-column table and the imaginary part
 * is computed once for the row.
 */
const classifyRowInto = (
  classifier: OrbitClassifier,
  sample: OrbitSample,
  band: BandOutputBuffers,
  layout: RowLayout,
  transform: ViewportTransform,
  realColumns: Float64Array,
): void => {
  const { width, height, y0, y1, y, stride } = layout;
  const cIm = preparedRowImaginary(transform, height, stride, y);
  for (let x = 0; x < width; x += stride) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- in-bounds: x < width = realColumns.length
    classifier.classifyInto(realColumns[x]!, cIm, sample);
    writeSampleToBand(band, width, y0, y1, x, y, stride, sample);
  }
};

/**
 * Classifies rows [y0, y1) at the given stride. Stride 1 (the stable pass)
 * uses the two-lane triggered row kernel; coarser strides use the scalar
 * OrbitClassifier. The optional mirror plan leaves mirrored rows unwritten:
 * the caller fills them with applyConjugateMirror after every band returns.
 */
export async function classifyRows(
  request: DynamicsRenderRequest,
  quality: RenderQuality,
  stride: number,
  y0: number,
  y1: number,
  signal: AbortSignal,
  // Pre-sliced output buffers (zero-copy detail): when present the band is
  // classified directly into them and nothing is allocated per call.
  output?: BandOutputBuffers,
  mirrorPlan?: ConjugateMirrorPlan,
): Promise<ClassifyRowsResult> {
  assertMirrorStride(mirrorPlan, stride);
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
  };
  const classifier = new OrbitClassifier(orbitOptions, new OrbitScratch(quality.maxPeriod));
  const rowKernel = stride === 1 ? new TriggeredRowKernel(orbitOptions) : undefined;
  // Per-band working state: the classification loop below allocates nothing
  // per pixel (plan workstream B) — scalars in, band channels out.
  const sample = createOrbitSample();
  const viewportTransform = createViewportTransform(request.viewport, request.size);
  // Prepared coordinates: real parts once per column, one imaginary value per
  // sampled row (bit-identical to the per-pixel viewport transform).
  const realColumns = new Float64Array(width);
  prepareRealColumns(viewportTransform, width, stride, realColumns);
  const yieldRowMask = yieldMaskForQuality(quality.maxIterations);
  const rowYields = defaultRowYieldScheduler();
  const wallStarted = nowMs();
  let yieldWaitMs = 0;
  let yieldCount = 0;

  for (let y = y0; y < y1; y += stride) {
    throwIfAborted(signal);
    // Mirrored rows are copied later; skipping them also skips their yield.
    if (isMirroredRow(mirrorPlan, y)) continue;
    if (rowKernel !== undefined) {
      rowKernel.classifyRow(
        realColumns,
        preparedRowImaginary(viewportTransform, request.size.height, stride, y),
        width,
        band,
        (y - y0) * width,
      );
    } else {
      classifyRowInto(
        classifier,
        sample,
        band,
        { width, height: request.size.height, y0, y1, y, stride },
        viewportTransform,
        realColumns,
      );
    }

    if (shouldYieldToEventLoop(y, stride, yieldRowMask)) {
      const yieldStarted = nowMs();
      // MessageChannel port yield: no 4 ms nested-timer clamp, so
      // cancellation preempts between kernels promptly.
      await rowYields.yieldToEventLoop();
      yieldWaitMs += nowMs() - yieldStarted;
      yieldCount += 1;
    }
  }

  throwIfAborted(signal);
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
  };
}
