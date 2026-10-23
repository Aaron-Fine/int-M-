import { describe, expect, it } from 'vitest';
import golden from '../../../fixtures/colorized-golden.v1.json';
import kernelGolden from '../../../fixtures/kernel-golden.v1.json';
import {
  colorizedGoldenCases,
  computeColorizedGoldens,
  GOLDEN_RASTER,
} from '../../../tools/generate_colorized_golden';

const recorded: Record<string, unknown> = golden.cases;

/**
 * Image-regression gate (MI-VER-UX-006, Q6): the colorized RGBA bytes of every
 * semantic view are pinned by hash. A failure here with the kernel golden
 * passing is a palette or colorizer change; regenerate only per
 * fixtures/README.md#golden-fixture-policy.
 */
describe('colorized-buffer goldens', () => {
  it('uses the kernel golden raster and covers every case', () => {
    expect(golden.raster).toEqual(GOLDEN_RASTER);
    expect(kernelGolden.raster).toEqual(GOLDEN_RASTER);
    expect(Object.keys(recorded).sort()).toEqual(
      colorizedGoldenCases()
        .map((goldenCase) => goldenCase.id)
        .sort(),
    );
  });

  it('colorizes every case byte for byte as recorded', async () => {
    const computed = await computeColorizedGoldens();
    for (const [id, record] of Object.entries(computed)) {
      expect(record, id).toEqual(recorded[id]);
    }
  }, 60_000);
});
