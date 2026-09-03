/**
 * Type declarations for tools/benchmark/view-chain.mjs (consumed by the
 * type-aware lint and unit tests; the .mjs is the single source of truth).
 */

export interface ComplexPoint {
  readonly re: number;
  readonly im: number;
}

export interface ViewportLike {
  readonly center: ComplexPoint;
  readonly spanY: number;
}

export interface RasterSizeLike {
  readonly width: number;
  readonly height: number;
}

export interface PixelRectLike {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export interface ChainTarget {
  readonly re: number;
  readonly im: number;
  readonly spanY: number;
}

export type RegionChainStep =
  | {
      readonly kind: 'pan';
      readonly deltaPx: { readonly dx: number; readonly dy: number };
      readonly viewportAfter: ViewportLike;
    }
  | { readonly kind: 'region'; readonly rect: PixelRectLike; readonly viewportAfter: ViewportLike };

export interface RegionChain {
  readonly steps: readonly RegionChainStep[];
  readonly finalViewport: ViewportLike;
}

export declare const DEFAULT_START_VIEWPORT: ViewportLike;
export declare const MAX_VIEWPORT_SPAN_Y: number;
export declare const MIN_VIEWPORT_SPAN_Y: number;
export declare const MIN_REGION_SIZE_PX: number;

export declare const zoomViewportToRect: (
  viewport: ViewportLike,
  size: RasterSizeLike,
  rect: PixelRectLike,
) => ViewportLike;

export declare const panViewport: (
  viewport: ViewportLike,
  size: RasterSizeLike,
  deltaXPixels: number,
  deltaYPixels: number,
) => ViewportLike;

export declare const planRegionChain: (options: {
  readonly target: ChainTarget;
  readonly size: RasterSizeLike;
  readonly start?: ViewportLike;
  readonly minRectPx?: number;
  readonly maxSteps?: number;
}) => RegionChain;
