/**
 * Per-pixel kernel dump (evidence aid, not a fixture): the stable-pass output
 * channels of classifyRows for every frozen-corpus case at the golden raster
 * (tools/golden-raster.ts), written as JSON so two builds can be
 * compared pixel by pixel. JSON numbers round-trip binary64 exactly.
 * Usage: npm run fixtures:pixel-dump -- <out.json> [--raster WxH] [--cases id,id]
 * --raster and --cases select another raster (the shipping 1024x640 for the
 * deep-view check) and a subset of the corpus.
 */
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import type { RasterSize } from '../src/domain';
import { classifyRows } from '../src/render/classify-rows';
import { loadCorpusCases, parseRaster, profileQuality } from './benchmark/judge/corpus';
import { GOLDEN_RASTER } from './golden-raster';

export interface PixelDumpCase {
  readonly packedStatusPeriod: number[];
  readonly smoothIterationOrMultiplierMagnitude: number[];
  readonly multiplierAngle: number[];
}

export interface PixelDump {
  readonly schemaVersion: 1;
  readonly raster: RasterSize;
  readonly commit: string;
  readonly cases: Record<string, PixelDumpCase>;
}

export const dumpPixels = async (
  raster: RasterSize = GOLDEN_RASTER,
  caseIds?: readonly string[],
): Promise<PixelDump> => {
  const cases: Record<string, PixelDumpCase> = {};
  for (const corpusCase of loadCorpusCases()) {
    if (caseIds !== undefined && !caseIds.includes(corpusCase.id)) continue;
    const quality = profileQuality(corpusCase.profile);
    const band = await classifyRows(
      { viewport: corpusCase.viewport, size: raster, quality },
      quality,
      1,
      0,
      raster.height,
      new AbortController().signal,
    );
    cases[corpusCase.id] = {
      packedStatusPeriod: Array.from(band.packedStatusPeriod),
      smoothIterationOrMultiplierMagnitude: Array.from(band.smoothIterationOrMultiplierMagnitude),
      multiplierAngle: Array.from(band.multiplierAngle),
    };
  }
  const commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  return { schemaVersion: 1, raster, commit, cases };
};

const main = async (): Promise<void> => {
  const args = process.argv.slice(2);
  const target = args[0];
  if (target === undefined) {
    process.stderr.write(
      'usage: npm run fixtures:pixel-dump -- <out.json> [--raster WxH] [--cases id,id]\n',
    );
    process.exit(2);
  }
  const option = (name: string): string | undefined => {
    const index = args.indexOf(name);
    return index === -1 ? undefined : args[index + 1];
  };
  const rasterText = option('--raster');
  const raster = rasterText === undefined ? GOLDEN_RASTER : parseRaster(rasterText);
  const caseIds = option('--cases')?.split(',');
  // Resolved from the repo root (npm runs scripts there).
  writeFileSync(
    path.resolve(process.cwd(), target),
    `${JSON.stringify(await dumpPixels(raster, caseIds))}\n`,
  );
};

if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('kernel_pixel_dump.js')
) {
  await main();
  // The yield scheduler's MessagePort keeps the event loop alive; exit explicitly as the other tools do.
  process.exit(0);
}
