import type {
  Complex,
  OrbitResult,
  RasterSize,
  RenderQuality,
  SemanticView,
  Viewport,
} from '../domain';

export type RenderStage = 'coarse' | 'stable';

export interface RasterFrame {
  readonly stage: RenderStage;
  readonly size: RasterSize;
  /** Complete row-major RGBA raster, including for the coarse preview. */
  readonly rgba: Uint8ClampedArray<ArrayBuffer>;
  readonly progress: number;
}

export interface RasterRenderRequest {
  readonly viewport: Viewport;
  readonly size: RasterSize;
  readonly semanticView: SemanticView;
  readonly quality?: Partial<RenderQuality>;
}

export type FrameConsumer = (frame: RasterFrame) => void | Promise<void>;

/**
 * Deliberately renderer-neutral boundary. A future WebGPU implementation can
 * satisfy this contract without changing worker/UI messages.
 */
export interface Renderer {
  render(request: RasterRenderRequest, signal: AbortSignal, onFrame: FrameConsumer): Promise<void>;

  inspect(point: Complex, quality?: Partial<RenderQuality>): OrbitResult;
}
