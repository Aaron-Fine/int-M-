import { describe, expect, it } from 'vitest';

import {
  classifyPeriodFourInto,
  createOrbitSample,
  createViewportTransform,
  type PeriodFourCertificate,
} from '../../../src/domain';
import {
  classifyRows,
  prepareRealColumns,
  preparedRowImaginary,
} from '../../../src/render/classify-rows';
import { packStatusPeriod } from '../../../src/render/packed-semantic';
import { GOLDEN_RASTER } from '../../../tools/generate_kernel_golden';
import { loadCorpusCases, profileQuality } from '../../../tools/benchmark/judge/corpus';
import { ddPeriodFourCycle } from '../domain/dd-oracle';

/**
 * ADR 0007/0013: every pixel the analytic period-4 path answers on the golden
 * raster is checked against the dd period-4 cycle (no cubic). This is the set
 * of pixels the change moved: unresolved -> attracting p4, and attracting p4
 * with the certified multiplier instead of the orbit product
 * (evidence/phase-2/2026-10-17-cf414cc-period-four-adjudication/).
 */
const EXPECTED_ANALYTIC_PIXELS: Readonly<Record<string, number>> = {
  'mi-easy-default-full': 32,
  'mi-hard-supplied-126x': 2084,
  'mi-hard-supplied-609x': 677,
  'mi-hard-supplied-13x': 1642,
  'mi-scale-6mx-basilica-rim': 8000,
};

/**
 * |lambda_analytic - lambda_dd| may not exceed the certificate's allowance
 * plus this (dd rounding and dd Newton error). Measured on this raster:
 * largest error 3.5e-12, largest ratio 4.5e-3, largest allowance 5.6e-9
 * (different pixels).
 */
const DD_TOLERANCE = 1e-12;

describe('analytic period-4 pixels on the golden raster', () => {
  for (const corpusCase of loadCorpusCases()) {
    it(`are dd-certified in ${corpusCase.id}`, async () => {
      const quality = profileQuality(corpusCase.profile);
      const band = await classifyRows(
        { viewport: corpusCase.viewport, size: GOLDEN_RASTER, quality },
        quality,
        1,
        0,
        GOLDEN_RASTER.height,
        new AbortController().signal,
      );
      const transform = createViewportTransform(corpusCase.viewport, GOLDEN_RASTER);
      const columns = new Float64Array(GOLDEN_RASTER.width);
      prepareRealColumns(transform, GOLDEN_RASTER.width, 1, columns);
      const sample = createOrbitSample();
      const certificate = {} as PeriodFourCertificate;
      const word = packStatusPeriod(2, 4);
      let analytic = 0;
      for (let y = 0; y < GOLDEN_RASTER.height; y += 1) {
        const cIm = preparedRowImaginary(transform, GOLDEN_RASTER.height, 1, y);
        for (let x = 0; x < GOLDEN_RASTER.width; x += 1) {
          const cRe = columns[x] ?? Number.NaN;
          if (!classifyPeriodFourInto(cRe, cIm, sample, certificate)) continue;
          analytic += 1;
          const o = y * GOLDEN_RASTER.width + x;
          // The kernel wrote exactly the analytic record.
          expect(band.packedStatusPeriod[o]).toBe(word);
          expect(band.smoothIterationOrMultiplierMagnitude[o]).toBe(sample.multiplierMagnitude);
          expect(band.multiplierAngle[o]).toBe(sample.multiplierAngle);
          const oracle = ddPeriodFourCycle(cRe, cIm);
          if (oracle.status !== 'attracting-cycle' || oracle.cycle.primitive !== 4) {
            throw new Error(`dd did not certify period 4 at ${cRe} + ${cIm}i (${oracle.status})`);
          }
          const error = Math.hypot(
            sample.multiplierMagnitude * Math.cos(sample.multiplierAngle) -
              oracle.cycle.magnitude * Math.cos(oracle.cycle.angle),
            sample.multiplierMagnitude * Math.sin(sample.multiplierAngle) -
              oracle.cycle.magnitude * Math.sin(oracle.cycle.angle),
          );
          expect(error).toBeLessThanOrEqual(certificate.allowance + DD_TOLERANCE);
        }
      }
      expect(analytic).toBe(EXPECTED_ANALYTIC_PIXELS[corpusCase.id] ?? 0);
    }, 60_000);
  }
});
