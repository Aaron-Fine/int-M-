import type {
  Complex,
  OrbitResult,
  PeriodKey,
  RasterSize,
  RenderQuality,
  SemanticView,
  Viewport,
} from '../domain';

export type RenderStage = 'coarse' | 'stable';

export const DEFAULT_RENDER_QUALITY: RenderQuality = Object.freeze({
  maxIterations: 512,
  maxPeriod: 32,
  coarseStride: 8,
});

export const resolveRenderQuality = (
  quality: Partial<RenderQuality> | undefined,
): RenderQuality => {
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

export interface RasterFrame {
  readonly stage: RenderStage;
  readonly size: RasterSize;
  /** Complete row-major RGBA raster, including for the coarse preview. */
  readonly rgba: Uint8ClampedArray<ArrayBuffer>;
  readonly progress: number;
  /** Period view only: the period-to-color mapping this raster was drawn with. */
  readonly periodKey?: PeriodKey;
}

export interface DynamicsRenderRequest {
  readonly viewport: Viewport;
  readonly size: RasterSize;
  readonly quality?: Partial<RenderQuality>;
}

export type SemanticStatusCode = 0 | 1 | 2;

export interface SemanticStageTiming {
  readonly classifyMs: number;
  readonly yieldWaitMs: number;
  readonly yieldCount: number;
  /**
   * Tiled stable pass only: elapsed milliseconds from stable dispatch start
   * to each band's completion, indexed by band index (row order). Band-level
   * observability only (plan §8); absent on single-band paths.
   */
  readonly bandsElapsedMs?: readonly number[];
  /**
   * Tiled stable pass only: supervisor-side merge/assembly cost of the
   * stable semantic frame. Small, since band views are already in place.
   */
  readonly mergeCpuMs?: number;
}

/**
 * One row band of the semantic frame (renderer-path zero-copy detail, plan
 * §5). The band's storage is owned by whoever classifies it — the supervisor
 * pre-slices stable frames into per-band transferable views handed to tile
 * workers, so band results never need a merge memcpy. Bands partition the
 * raster rows: [y0, y1) exclusive, covering [0, height) exactly, no gaps or
 * overlap, sorted by y0.
 */
export interface SemanticBand {
  readonly y0: number;
  readonly y1: number;
  /** Packed status (high 8 bits) + primitive period (low 24 bits). */
  readonly packedStatusPeriod: Uint32Array<ArrayBuffer>;
  /** Smooth escape iteration or multiplier magnitude, selected by status. */
  readonly smoothIterationOrMultiplierMagnitude: Float64Array<ArrayBuffer>;
  /** Multiplier angle for attracting-cycle samples. */
  readonly multiplierAngle: Float64Array<ArrayBuffer>;
}

export interface SemanticFrame {
  readonly stage: RenderStage;
  readonly size: RasterSize;
  readonly sampleStride: number;
  /** Row bands partitioning [0, height); each band covers (y1 - y0) * width pixels. */
  readonly bands: readonly SemanticBand[];
  readonly progress: number;
  readonly timing?: SemanticStageTiming;
}

export type SemanticFrameConsumer = (frame: SemanticFrame) => void | Promise<void>;

/**
 * Deliberately renderer-neutral boundary. A future WebGPU implementation can
 * satisfy this contract without changing worker/UI messages.
 */
export interface Renderer {
  render(
    request: DynamicsRenderRequest,
    signal: AbortSignal,
    onFrame: SemanticFrameConsumer,
  ): Promise<void>;

  inspect(point: Complex, quality?: Partial<RenderQuality>): OrbitResult;

  colorize(frame: SemanticFrame, view: SemanticView): RasterFrame;

  /**
   * Resolves once no work of a cancelled render is still running anywhere,
   * nested tile workers included (or the pool has been reset). Optional: a
   * renderer without nested workers is quiescent once `render` settles.
   */
  quiesce?(): Promise<void>;
}

/**
 * Optional stable-classify fan-out injected into `CpuRenderer`.
 * Construction and nested Workers stay in the worker package.
 */
export interface TilePool {
  readonly size: number;
  classifyStable(
    request: DynamicsRenderRequest,
    quality: RenderQuality,
    signal: AbortSignal,
  ): Promise<SemanticFrame>;
  /**
   * Resolves once every child of a cancelled job has stopped, resetting the
   * pool when children miss the drain deadline.
   */
  quiesce?(): Promise<void>;
  dispose(): void;
}
