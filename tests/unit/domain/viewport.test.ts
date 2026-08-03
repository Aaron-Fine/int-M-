import { describe, expect, it } from 'vitest';

import {
  DEFAULT_VIEWPORT,
  MAX_MAGNIFICATION,
  MAX_VIEWPORT_SPAN_Y,
  MIN_VIEWPORT_SPAN_Y,
  clampViewport,
  complexToPixel,
  panViewport,
  pixelToComplex,
  zoomViewportAt,
  zoomViewportToRect,
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

  it('derives the reliable minimum span from the declared magnification ceiling', () => {
    expect(DEFAULT_VIEWPORT.spanY / MIN_VIEWPORT_SPAN_Y).toBe(MAX_MAGNIFICATION);
  });

  it('clamps zoom to the deliberate product bounds', () => {
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

  it('fits a box selection while preserving the viewport aspect ratio', () => {
    const selected = zoomViewportToRect(
      DEFAULT_VIEWPORT,
      { width: 800, height: 500 },
      {
        x1: 200,
        y1: 100,
        x2: 600,
        y2: 300,
      },
    );

    expect(selected.center.re).toBeCloseTo(-0.75);
    expect(selected.center.im).toBeCloseTo(0.25);
    expect(selected.spanY).toBeCloseTo(1.25);
  });

  it('normalizes a reverse-direction box selection', () => {
    const forward = zoomViewportToRect(
      DEFAULT_VIEWPORT,
      { width: 800, height: 500 },
      {
        x1: 200,
        y1: 100,
        x2: 600,
        y2: 300,
      },
    );
    const reverse = zoomViewportToRect(
      DEFAULT_VIEWPORT,
      { width: 800, height: 500 },
      {
        x1: 600,
        y1: 300,
        x2: 200,
        y2: 100,
      },
    );

    expect(reverse).toEqual(forward);
  });

  it('clamps box selections to the raster boundary', () => {
    const selected = zoomViewportToRect(
      DEFAULT_VIEWPORT,
      { width: 800, height: 500 },
      {
        x1: -100,
        y1: 125,
        x2: 400,
        y2: 375,
      },
    );

    expect(selected.center.re).toBeCloseTo(-1.75);
    expect(selected.center.im).toBeCloseTo(0);
    expect(selected.spanY).toBeCloseTo(1.25);
  });

  it('keeps the existing center when already at the reliable minimum span', () => {
    const minimum = {
      center: { re: -0.12, im: 0.74 },
      spanY: MIN_VIEWPORT_SPAN_Y,
    };
    expect(
      zoomViewportToRect(
        minimum,
        { width: 800, height: 500 },
        {
          x1: 300,
          y1: 200,
          x2: 500,
          y2: 300,
        },
      ),
    ).toEqual(minimum);
  });

  it('rejects degenerate box selections', () => {
    expect(() =>
      zoomViewportToRect(
        DEFAULT_VIEWPORT,
        { width: 800, height: 500 },
        {
          x1: 100,
          y1: 100,
          x2: 100,
          y2: 200,
        },
      ),
    ).toThrow(/positive width and height/);
  });
});
