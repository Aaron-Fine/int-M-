/**
 * Per-pixel kernel dump (evidence aid, not a fixture): the stable-pass output
 * channels of classifyRows for every frozen-corpus case at the golden raster
 * (tools/generate_kernel_golden.ts), written as JSON so two builds can be
 * compared pixel by pixel. JSON numbers round-trip binary64 exactly.
 * Usage: npm run fixtures:pixel-dump -- <out.json>
 */
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { classifyRows } from '../src/render/classify-rows';
import { loadCorpusCases, profileQuality } from './benchmark/judge/corpus';

export const DUMP_RASTER = { width: 160, height: 100 } as const;

export interface PixelDumpCase {
  readonly packedStatusPeriod: number[];
  readonly smoothIterationOrMultiplierMagnitude: number[];
  readonly multiplierAngle: number[];
}

export interface PixelDump {
  readonly schemaVersion: 1;
  readonly raster: typeof DUMP_RASTER;
  readonly commit: string;
  readonly cases: Record<string, PixelDumpCase>;
}

export const dumpPixels = async (): Promise<PixelDump> => {
  const cases: Record<string, PixelDumpCase> = {};
  for (const corpusCase of loadCorpusCases()) {
    const quality = profileQuality(corpusCase.profile);
    const band = await classifyRows(
      { viewport: corpusCase.viewport, size: DUMP_RASTER, quality },
      quality,
      1,
      0,
      DUMP_RASTER.height,
      new AbortController().signal,
    );
    cases[corpusCase.id] = {
      packedStatusPeriod: Array.from(band.packedStatusPeriod),
      smoothIterationOrMultiplierMagnitude: Array.from(band.smoothIterationOrMultiplierMagnitude),
      multiplierAngle: Array.from(band.multiplierAngle),
    };
  }
  const commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  return { schemaVersion: 1, raster: DUMP_RASTER, commit, cases };
};

const main = async (): Promise<void> => {
  const target = process.argv[2];
  if (target === undefined) {
    process.stderr.write('usage: npm run fixtures:pixel-dump -- <out.json>\n');
    process.exit(2);
  }
  // Resolved from the repo root (npm runs scripts there).
  writeFileSync(path.resolve(process.cwd(), target), `${JSON.stringify(await dumpPixels())}\n`);
};

if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('kernel_pixel_dump.js')
) {
  await main();
  // The yield scheduler's MessagePort keeps the event loop alive; exit explicitly as the other tools do.
  process.exit(0);
}
