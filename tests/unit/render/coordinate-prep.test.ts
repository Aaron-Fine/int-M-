import { describe, expect, it } from 'vitest';

import {
  createViewportTransform,
  DEFAULT_VIEWPORT,
  type RasterSize,
  type RenderQuality,
  type Viewport,
} from '../../../src/domain';
import { prepareRealColumns, preparedRowImaginary } from '../../../src/render/classify-rows';
import { CpuRenderer, type DynamicsRenderRequest, type SemanticFrame } from '../../../src/render';

const QUALITY: RenderQuality = { maxIterations: 128, maxPeriod: 16, coarseStride: 4 };

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

  it('coordinatePrep_stableFrameUnchangedWhenEnabled', async () => {
    const renderer = new CpuRenderer();
    const stableFor = async (request: DynamicsRenderRequest): Promise<SemanticFrame> => {
      let stable: SemanticFrame | undefined;
      await renderer.render(request, new AbortController().signal, (frame) => {
        if (frame.stage === 'stable') stable = frame;
      });
      if (stable === undefined) throw new Error('no stable frame');
      return stable;
    };
    for (const viewport of VIEWPORTS) {
      const base = { viewport, size: { width: 19, height: 11 }, quality: QUALITY };
      const off = await stableFor(base);
      const on = await stableFor({ ...base, preparedCoordinates: true });
      for (let index = 0; index < off.bands.length; index += 1) {
        const offBand = off.bands[index];
        const onBand = on.bands[index];
        expect(onBand?.packedStatusPeriod).toEqual(offBand?.packedStatusPeriod);
        expect(onBand?.smoothIterationOrMultiplierMagnitude).toEqual(
          offBand?.smoothIterationOrMultiplierMagnitude,
        );
        expect(onBand?.multiplierAngle).toEqual(offBand?.multiplierAngle);
      }
    }
  });
});
