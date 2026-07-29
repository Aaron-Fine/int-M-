import { describe, expect, it } from 'vitest';

import {
  DEFAULT_VIEWPORT,
  MAX_VIEWPORT_SPAN_Y,
  MIN_VIEWPORT_SPAN_Y,
  clampViewport,
  complexToPixel,
  panViewport,
  pixelToComplex,
  zoomViewportAt,
} from '../../../src/domain';

describe('viewport mapping', () => {
  it('maps the center pixel to the viewport center', () => {
    expect(pixelToComplex(DEFAULT_VIEWPORT, { width: 5, height: 5 }, 2, 2)).toEqual(
      DEFAULT_VIEWPORT.center,
    );
  });

  it('uses square pixels and an upward imaginary axis', () => {
    const topLeft = pixelToComplex(DEFAULT_VIEWPORT, { width: 4, height: 2 }, 0, 0);
    const bottomRight = pixelToComplex(DEFAULT_VIEWPORT, { width: 4, height: 2 }, 3, 1);

    expect(topLeft).toEqual({ re: -2.625, im: 0.625 });
    expect(bottomRight).toEqual({ re: 1.125, im: -0.625 });
  });

  it('clamps zoom to the deliberate binary64 bounds', () => {
    expect(clampViewport({ center: { re: 0, im: 0 }, spanY: 1e-30 }).spanY).toBe(
      MIN_VIEWPORT_SPAN_Y,
    );
    expect(clampViewport({ center: { re: 0, im: 0 }, spanY: 100 }).spanY).toBe(MAX_VIEWPORT_SPAN_Y);
  });

  it('keeps the pointer anchor fixed while zooming', () => {
    const size = { width: 800, height: 600 };
    const anchor = { x: 173, y: 414 };
    const before = pixelToComplex(DEFAULT_VIEWPORT, size, anchor.x, anchor.y);
    const zoomed = zoomViewportAt(DEFAULT_VIEWPORT, size, anchor.x, anchor.y, 0.5);
    const after = pixelToComplex(zoomed, size, anchor.x, anchor.y);

    expect(after.re).toBeCloseTo(before.re, 14);
    expect(after.im).toBeCloseTo(before.im, 14);
  });

  it('round-trips between pixel and complex coordinates', () => {
    const size = { width: 800, height: 600 };
    const point = pixelToComplex(DEFAULT_VIEWPORT, size, 173, 414);
    const pixel = complexToPixel(DEFAULT_VIEWPORT, size, point);

    expect(pixel.x).toBeCloseTo(173, 12);
    expect(pixel.y).toBeCloseTo(414, 12);
  });

  it('pans opposite a screen-space drag', () => {
    const panned = panViewport(DEFAULT_VIEWPORT, { width: 400, height: 200 }, 10, 20);

    expect(panned.center.re).toBeCloseTo(-0.875);
    expect(panned.center.im).toBeCloseTo(0.25);
  });
});
