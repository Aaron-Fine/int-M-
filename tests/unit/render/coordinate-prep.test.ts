import { describe, expect, it } from 'vitest';

import {
  createViewportTransform,
  DEFAULT_VIEWPORT,
  type RasterSize,
  type Viewport,
} from '../../../src/domain';
import { prepareRealColumns, preparedRowImaginary } from '../../../src/render/classify-rows';

const VIEWPORTS: readonly Viewport[] = [
  DEFAULT_VIEWPORT,
  { center: { re: -0.5, im: 0 }, spanY: 3 },
  { center: { re: -0.743643887037151, im: 0.13182590420533 }, spanY: 1e-6 },
  { center: { re: -1.7490177, im: 0 }, spanY: 2e-9 },
];

const SIZES: readonly RasterSize[] = [
  { width: 17, height: 13 },
  { width: 8, height: 8 },
];

const STRIDES: readonly number[] = [1, 2, 3, 5];

// Prepared coordinates are the production row path; they must equal the
// canonical per-pixel transform bit for bit.
describe('prepared coordinates', () => {
  it('coordinatePrep_realColumnsMatchPerPixelTransform', () => {
    for (const viewport of VIEWPORTS) {
      for (const size of SIZES) {
        const transform = createViewportTransform(viewport, size);
        const point = { re: 0, im: 0 };
        for (const stride of STRIDES) {
          const columns = new Float64Array(size.width);
          prepareRealColumns(transform, size.width, stride, columns);
          for (let x = 0; x < size.width; x += stride) {
            const sampleX = Math.min(size.width - 1, x + (stride - 1) / 2);
            transform.pixelToComplexInto(sampleX, 0, point);
            expect(Object.is(columns[x], point.re)).toBe(true);
          }
        }
      }
    }
  });

  it('coordinatePrep_imaginaryRowsMatchPerPixelTransform', () => {
    for (const viewport of VIEWPORTS) {
      for (const size of SIZES) {
        const transform = createViewportTransform(viewport, size);
        const point = { re: 0, im: 0 };
        for (const stride of STRIDES) {
          for (let y = 0; y < size.height; y += stride) {
            const sampleY = Math.min(size.height - 1, y + (stride - 1) / 2);
            transform.pixelToComplexInto(0, sampleY, point);
            const prepared = preparedRowImaginary(transform, size.height, stride, y);
            expect(Object.is(prepared, point.im)).toBe(true);
          }
        }
      }
    }
  });
});
