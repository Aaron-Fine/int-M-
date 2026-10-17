import { describe, expect, it } from 'vitest';

import {
  classifyPeriodThreeInto,
  createOrbitSample,
  createViewportTransform,
} from '../../../src/domain';
import {
  classifyRows,
  prepareRealColumns,
  preparedRowImaginary,
} from '../../../src/render/classify-rows';
import { packStatusPeriod } from '../../../src/render/packed-semantic';
import { GOLDEN_RASTER } from '../../../tools/generate_kernel_golden';
import { loadCorpusCases, profileQuality } from '../../../tools/benchmark/judge/corpus';
import { ddPeriodThreeCycle } from '../domain/dd-oracle';

/**
 * ADR 0007/0010: every pixel the analytic period-3 path answers on the golden
 * raster is checked against the dd period-3 cycle (no closed form). This is
 * a superset of the pixels the change moved: unresolved -> attracting p3, and
 * attracting p3 with the closed-form multiplier instead of the orbit product
 * (evidence/phase-2/2026-10-17-9c1471e-period-three-adjudication/).
 */
const EXPECTED_ANALYTIC_PIXELS: Readonly<Record<string, number>> = {
  'mi-easy-default-full': 96,
  'mi-hard-rabbit-boundary': 3120,
  'mi-fallback-weak-attraction': 16000,
};

/** |lambda_analytic - lambda_dd| bound; the error budget gives about 5e-14. */
const TOLERANCE = 1e-12;

describe('analytic period-3 pixels on the golden raster', () => {
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
      const word = packStatusPeriod(2, 3);
      let analytic = 0;
      for (let y = 0; y < GOLDEN_RASTER.height; y += 1) {
        const cIm = preparedRowImaginary(transform, GOLDEN_RASTER.height, 1, y);
        for (let x = 0; x < GOLDEN_RASTER.width; x += 1) {
          const cRe = columns[x] ?? Number.NaN;
          if (!classifyPeriodThreeInto(cRe, cIm, sample)) continue;
          analytic += 1;
          const o = y * GOLDEN_RASTER.width + x;
          // The kernel wrote exactly the analytic record.
          expect(band.packedStatusPeriod[o]).toBe(word);
          expect(band.smoothIterationOrMultiplierMagnitude[o]).toBe(sample.multiplierMagnitude);
          expect(band.multiplierAngle[o]).toBe(sample.multiplierAngle);
          const oracle = ddPeriodThreeCycle(cRe, cIm);
          if (oracle.status !== 'attracting-cycle' || oracle.cycle.primitive !== 3) {
            throw new Error(`dd did not certify period 3 at ${cRe} + ${cIm}i (${oracle.status})`);
          }
          const error = Math.hypot(
            sample.multiplierMagnitude * Math.cos(sample.multiplierAngle) -
              oracle.cycle.magnitude * Math.cos(oracle.cycle.angle),
            sample.multiplierMagnitude * Math.sin(sample.multiplierAngle) -
              oracle.cycle.magnitude * Math.sin(oracle.cycle.angle),
          );
          expect(error).toBeLessThanOrEqual(TOLERANCE);
        }
      }
      expect(analytic).toBe(EXPECTED_ANALYTIC_PIXELS[corpusCase.id] ?? 0);
    }, 60_000);
  }
});
