import type {
  ClassifierMode,
  Complex,
  DifferentialStats,
  OrbitResult,
  RasterSize,
  RenderQuality,
  SemanticView,
  Viewport,
} from '../domain';
import type { PerfCounters } from './perf-counters';
import type { YieldMechanism } from './yield-scheduler';

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
  /**
   * Stable-band dispatch order (renderer-path detail, plan §5). Absent means
   * the default center-out order; 'legacy' is the diagnostic top-to-bottom
   * arm used by the paired evidence harness. The order affects only the
   * stable-pass dispatch schedule, never the semantic result.
   */
  readonly bandOrder?: BandOrder;
  /**
   * Row-yield mechanism (renderer-path detail, plan §5). Absent means the
   * default MessageChannel port yield; 'timeout' is the diagnostic arm that
   * keeps the nested setTimeout(0) yields (4 ms nested-timer clamp) for
   * paired evidence.
   */
  readonly yieldMechanism?: YieldMechanism;
  /**
   * Stable-frame output path (renderer-path detail, plan §5). Absent means
   * the default zero-copy path: the supervisor pre-slices per-band
   * transferable views the tile workers classify into directly, and the
   * merge is a no-op. 'legacy-merge' is the diagnostic arm where workers
   * allocate their own output and the supervisor copies band results.
   */
  readonly frameOutput?: FrameOutput;
  /**
   * Opt-in diagnostics counters (plan §8, `?perf=1&perfCounters=1` wiring).
   * Absent on the default path: no counters object is allocated anywhere and
   * no counter field appears on any message.
   */
  readonly perfCounters?: boolean;
}

/**
 * Stable-band dispatch order. 'center-out' presents mid-screen semantic work
 * first at identical throughput; 'legacy' is the pre-bundle top-to-bottom
 * order kept as a measurement arm.
 */
export type BandOrder = 'center-out' | 'legacy';

/**
 * Stable-frame output path. 'zero-copy' is the default; 'legacy-merge' is
 * kept as the paired-evidence measurement arm for the copy cost the
 * zero-copy path removes.
 */
export type FrameOutput = 'zero-copy' | 'legacy-merge';

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
   * stable semantic frame. ~0 on the zero-copy path (band views are already
   * in place), the copy cost on the legacy-merge measurement arm.
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
  /**
   * Opt-in diagnostics counters (plan §8): the frame's per-band counters
   * summed once. Absent unless the request opted in via perfCounters.
   */
  readonly counters?: PerfCounters;
  /**
   * Differential-mode disagreement record (classifierMode 'differential'):
   * per-band stats summed once. Absent in every other mode.
   */
  readonly differential?: DifferentialStats;
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
    perfCounters?: boolean,
  ): Promise<SemanticFrame>;
  dispose(): void;
}
