import type { Complex, RasterSize, Viewport } from './types';

export const DEFAULT_VIEWPORT: Viewport = Object.freeze({
  center: Object.freeze({ re: -0.75, im: 0 }),
  spanY: 2.5,
});

/**
 * The CPU baseline intentionally stops before binary64 precision becomes a
 * misleading representation of adjacent screen pixels.
 */
export const MIN_VIEWPORT_SPAN_Y = 1e-10;
export const MAX_VIEWPORT_SPAN_Y = 4;

const requireFinitePositive = (value: number, name: string): void => {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a finite positive number`);
  }
};

export const validateRasterSize = (size: RasterSize): void => {
  requireFinitePositive(size.width, 'width');
  requireFinitePositive(size.height, 'height');
  if (!Number.isInteger(size.width) || !Number.isInteger(size.height)) {
    throw new RangeError('raster dimensions must be integers');
  }
};

export const clampViewport = (viewport: Viewport): Viewport => {
  if (!Number.isFinite(viewport.center.re) || !Number.isFinite(viewport.center.im)) {
    throw new RangeError('viewport center must be finite');
  }
  if (!Number.isFinite(viewport.spanY) || viewport.spanY <= 0) {
    throw new RangeError('viewport spanY must be a finite positive number');
  }

  return {
    center: viewport.center,
    spanY: Math.min(MAX_VIEWPORT_SPAN_Y, Math.max(MIN_VIEWPORT_SPAN_Y, viewport.spanY)),
  };
};

export interface ViewportTransform {
  readonly viewport: Viewport;
  readonly size: RasterSize;
  readonly unitsPerPixel: number;
  pixelToComplex(pixelX: number, pixelY: number): Complex;
}

/** Validates and prepares the canonical mapping once for raster hot paths. */
export const createViewportTransform = (
  viewport: Viewport,
  size: RasterSize,
): ViewportTransform => {
  validateRasterSize(size);
  const bounded = clampViewport(viewport);
  const unitsPerPixel = bounded.spanY / size.height;
  return {
    viewport: bounded,
    size,
    unitsPerPixel,
    pixelToComplex: (pixelX, pixelY) => ({
      re: bounded.center.re + (pixelX + 0.5 - size.width / 2) * unitsPerPixel,
      im: bounded.center.im - (pixelY + 0.5 - size.height / 2) * unitsPerPixel,
    }),
  };
};

/**
 * Maps the center of a raster pixel to the complex plane. Imaginary values
 * increase upward while raster y values increase downward.
 */
export const pixelToComplex = (
  viewport: Viewport,
  size: RasterSize,
  pixelX: number,
  pixelY: number,
): Complex => createViewportTransform(viewport, size).pixelToComplex(pixelX, pixelY);

export const complexToPixel = (
  viewport: Viewport,
  size: RasterSize,
  point: Complex,
): { readonly x: number; readonly y: number } => {
  validateRasterSize(size);
  const bounded = clampViewport(viewport);
  const unitsPerPixel = bounded.spanY / size.height;
  return {
    x: (point.re - bounded.center.re) / unitsPerPixel + size.width / 2 - 0.5,
    y: (bounded.center.im - point.im) / unitsPerPixel + size.height / 2 - 0.5,
  };
};

/**
 * Moves the viewed region with a screen-space drag. Dragging content right
 * moves the viewport center left; dragging content down moves it upward.
 */
export const panViewport = (
  viewport: Viewport,
  size: RasterSize,
  deltaXPixels: number,
  deltaYPixels: number,
): Viewport => {
  validateRasterSize(size);
  const bounded = clampViewport(viewport);
  const unitsPerPixel = bounded.spanY / size.height;
  return {
    center: {
      re: bounded.center.re - deltaXPixels * unitsPerPixel,
      im: bounded.center.im + deltaYPixels * unitsPerPixel,
    },
    spanY: bounded.spanY,
  };
};

export const zoomViewportAt = (
  viewport: Viewport,
  size: RasterSize,
  pixelX: number,
  pixelY: number,
  factor: number,
): Viewport => {
  requireFinitePositive(factor, 'zoom factor');
  const anchorBefore = pixelToComplex(viewport, size, pixelX, pixelY);
  const spanY = Math.min(
    MAX_VIEWPORT_SPAN_Y,
    Math.max(MIN_VIEWPORT_SPAN_Y, viewport.spanY * factor),
  );
  const next: Viewport = { center: viewport.center, spanY };
  const anchorAfter = pixelToComplex(next, size, pixelX, pixelY);
  return {
    center: {
      re: viewport.center.re + anchorBefore.re - anchorAfter.re,
      im: viewport.center.im + anchorBefore.im - anchorAfter.im,
    },
    spanY,
  };
};

export interface PixelRect {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

/**
 * Fits a screen-space selection inside the next viewport while preserving
 * square complex-plane pixels. The longer selected fraction determines the
 * zoom so the entire box remains visible at any canvas aspect ratio.
 */
export const zoomViewportToRect = (
  viewport: Viewport,
  size: RasterSize,
  rect: PixelRect,
): Viewport => {
  validateRasterSize(size);
  for (const [name, value] of Object.entries(rect)) {
    if (!Number.isFinite(value)) {
      throw new RangeError(`${name} must be finite`);
    }
  }

  const left = Math.max(0, Math.min(size.width, Math.min(rect.x1, rect.x2)));
  const right = Math.max(0, Math.min(size.width, Math.max(rect.x1, rect.x2)));
  const top = Math.max(0, Math.min(size.height, Math.min(rect.y1, rect.y2)));
  const bottom = Math.max(0, Math.min(size.height, Math.max(rect.y1, rect.y2)));
  const width = right - left;
  const height = bottom - top;
  if (width <= 0 || height <= 0) {
    throw new RangeError('zoom rectangle must have positive width and height');
  }

  const bounded = clampViewport(viewport);
  const factor = Math.max(width / size.width, height / size.height);
  const spanY = Math.max(MIN_VIEWPORT_SPAN_Y, bounded.spanY * factor);
  if (spanY === bounded.spanY) return bounded;

  const spanX = bounded.spanY * (size.width / size.height);
  return {
    center: {
      re: bounded.center.re + ((left + right) / 2 / size.width - 0.5) * spanX,
      im: bounded.center.im - ((top + bottom) / 2 / size.height - 0.5) * bounded.spanY,
    },
    spanY,
  };
};
