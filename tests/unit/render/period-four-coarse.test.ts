import { describe, expect, it } from 'vitest';

import {
  classifyPeriodFourInto,
  createOrbitSample,
  createViewportTransform,
} from '../../../src/domain';
import {
  classifyRows,
  prepareRealColumns,
  preparedRowImaginary,
} from '../../../src/render/classify-rows';
import { packStatusPeriod } from '../../../src/render/packed-semantic';

/**
 * The coarse pass (stride > 1, scalar classifier) and the stable pass
 * (stride 1, two-lane row kernel) both answer period-4 pixels with the
 * certified cubic solve (ADR 0013): same record at the same parameter. The
 * view lies inside the 1/2 satellite of the period-2 bulb, on the real axis.
 * The row kernel's real-primitive window is set on the axis rows but holds no
 * column of this view; the gate-edge test in triggered-rows.test.ts covers it.
 */
const VIEW = { center: { re: -1.310702641336833, im: 0 }, spanY: 0.02 };
const SIZE = { width: 96, height: 64 };
const QUALITY = { maxIterations: 256, maxPeriod: 16, coarseStride: 8 };

describe('period-4 fast path in the coarse and stable passes', () => {
  for (const stride of [8, 1]) {
    it(`writes the analytic record at every sampled period-4 pixel (stride ${stride})`, async () => {
      const band = await classifyRows(
        { viewport: VIEW, size: SIZE, quality: QUALITY },
        QUALITY,
        stride,
        0,
        SIZE.height,
        new AbortController().signal,
      );
      const transform = createViewportTransform(VIEW, SIZE);
      const columns = new Float64Array(SIZE.width);
      prepareRealColumns(transform, SIZE.width, stride, columns);
      const sample = createOrbitSample();
      let analytic = 0;
      for (let y = 0; y < SIZE.height; y += stride) {
        const cIm = preparedRowImaginary(transform, SIZE.height, stride, y);
        for (let x = 0; x < SIZE.width; x += stride) {
          const o = y * SIZE.width + x;
          expect(classifyPeriodFourInto(columns[x] ?? Number.NaN, cIm, sample)).toBe(true);
          analytic += 1;
          expect(band.packedStatusPeriod[o]).toBe(packStatusPeriod(2, 4));
          expect(band.smoothIterationOrMultiplierMagnitude[o]).toBe(sample.multiplierMagnitude);
          expect(band.multiplierAngle[o]).toBe(sample.multiplierAngle);
        }
      }
      expect(analytic).toBe((SIZE.width / stride) * (SIZE.height / stride));
    });
  }
});
