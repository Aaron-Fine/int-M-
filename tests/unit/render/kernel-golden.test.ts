import { describe, expect, it } from 'vitest';
import golden from '../../../fixtures/kernel-golden.v1.json';
import { GOLDEN_RASTER, goldenDigest } from '../../../tools/generate_kernel_golden';
import { loadCorpusCases, profileQuality } from '../../../tools/benchmark/judge/corpus';

const recorded: Record<string, string> = golden.cases;

describe('kernel golden fixture', () => {
  it('covers every corpus case at the golden raster', () => {
    expect(golden.raster).toEqual(GOLDEN_RASTER);
    expect(Object.keys(recorded).sort()).toEqual(
      loadCorpusCases()
        .map((c) => c.id)
        .sort(),
    );
  });

  for (const corpusCase of loadCorpusCases()) {
    it(`classifies ${corpusCase.id} bit for bit as recorded`, async () => {
      expect(await goldenDigest(corpusCase.viewport, profileQuality(corpusCase.profile))).toBe(
        recorded[corpusCase.id],
      );
    }, 60_000);
  }
});
