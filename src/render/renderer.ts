import type {
  ClassifierMode,
  Complex,
  OrbitResult,
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
}

export interface DynamicsRenderRequest {
  readonly viewport: Viewport;
  readonly size: RasterSize;
  readonly quality?: Partial<RenderQuality>;
  /**
   * Versioned classifier mode (Stage A opt-in wiring). Absent on the default
   * path; the semantic cache key scopes cached frames by mode when present.
   */
  readonly classifierMode?: ClassifierMode;
}

export type SemanticStatusCode = 0 | 1 | 2;

export interface SemanticStageTiming {
  readonly classifyMs: number;
  readonly yieldWaitMs: number;
  readonly yieldCount: number;
}

export interface SemanticFrame {
  readonly stage: RenderStage;
  readonly size: RasterSize;
  readonly sampleStride: number;
  /** 0 unresolved, 1 escaped, 2 attracting cycle. */
  readonly status: Uint8Array<ArrayBuffer>;
  readonly period: Uint32Array<ArrayBuffer>;
  /** Smooth escape iteration or multiplier magnitude, selected by status. */
  readonly smoothIterationOrMultiplierMagnitude: Float64Array<ArrayBuffer>;
  /** Multiplier angle for attracting-cycle samples. */
  readonly multiplierAngle: Float64Array<ArrayBuffer>;
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
    classifierMode?: ClassifierMode,
  ): Promise<SemanticFrame>;
  dispose(): void;
}
