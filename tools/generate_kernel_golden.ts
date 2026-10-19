/**
 * Golden kernel fixture: SHA-256 of the default classifier's output channels
 * for every frozen-corpus case at a small raster. The bit-for-bit regression
 * reference for the watched-lag kernel (ADR 0006/0007).
 * Usage: npm run fixtures:kernel-golden [-- --check]
 */
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import type { RenderQuality, Viewport } from '../src/domain';
import { classifyRows } from '../src/render/classify-rows';
import { loadCorpusCases, profileQuality } from './benchmark/judge/corpus';
import { GOLDEN_RASTER } from './golden-raster';

export { GOLDEN_RASTER };
// Resolved from the repo root (npm runs scripts there): the SSR bundle's import.meta.dirname is the build directory.
const FIXTURE = path.resolve(process.cwd(), 'fixtures/kernel-golden.v1.json');

const bytesOf = (view: ArrayBufferView): Uint8Array =>
  new Uint8Array(view.buffer, view.byteOffset, view.byteLength);

const channelsDigest = (band: {
  packedStatusPeriod: Uint32Array;
  smoothIterationOrMultiplierMagnitude: Float64Array;
  multiplierAngle: Float64Array;
}): string =>
  createHash('sha256')
    .update(bytesOf(band.packedStatusPeriod))
    .update(bytesOf(band.smoothIterationOrMultiplierMagnitude))
    .update(bytesOf(band.multiplierAngle))
    .digest('hex');

const classify = (viewport: Viewport, quality: RenderQuality) =>
  classifyRows(
    { viewport, size: GOLDEN_RASTER, quality },
    quality,
    1,
    0,
    GOLDEN_RASTER.height,
    new AbortController().signal,
  );

export const goldenDigest = async (viewport: Viewport, quality: RenderQuality): Promise<string> =>
  channelsDigest(await classify(viewport, quality));

const main = async (): Promise<void> => {
  const cases: Record<string, string> = {};
  for (const corpusCase of loadCorpusCases()) {
    const quality = profileQuality(corpusCase.profile);
    cases[corpusCase.id] = await goldenDigest(corpusCase.viewport, quality);
  }
  const commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  const fixture = {
    schemaVersion: 1,
    raster: GOLDEN_RASTER,
    kernel:
      'watched-lag triggered scan (ADR 0006) with the analytic period-3 (ADR 0010) and period-4 (ADR 0013) paths',
    generatedFrom: commit,
    cases,
  };
  if (process.argv.includes('--check')) {
    const current = JSON.parse(readFileSync(FIXTURE, 'utf8')) as { cases: Record<string, string> };
    if (JSON.stringify(current.cases) !== JSON.stringify(cases)) {
      process.stderr.write('kernel golden fixture is stale\n');
      process.exit(1);
    }
    return;
  }
  writeFileSync(FIXTURE, `${JSON.stringify(fixture, null, 2)}\n`);
};

if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('generate_kernel_golden.js')
) {
  await main();
  // The yield scheduler's MessagePort keeps the event loop alive; exit explicitly as the other tools do.
  process.exit(0);
}
