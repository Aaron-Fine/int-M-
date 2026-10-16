/**
 * Quick serial kernel bench (development aid, not evidence): classifyRows
 * (production kernel) over the frozen corpus at a reduced raster.
 * Usage: npm run kernel-bench -- [raster WxH] [reps]
 */
import { classifyRows } from '../../src/render/classify-rows';
import { loadCorpusCases, profileQuality, parseRaster } from './judge/corpus';

const args = process.argv.slice(2);
const size = parseRaster(args[0] ?? '384x240');
const reps = Number(args[1] ?? '5');
const cases = loadCorpusCases();
const signal = new AbortController().signal;

const times = new Map<string, number[]>();
for (const c of cases) times.set(c.id, []);

for (let rep = 0; rep <= reps; rep += 1) {
  for (const c of cases) {
    const quality = profileQuality(c.profile);
    const request = { viewport: c.viewport, size, quality };
    const t0 = performance.now();
    await classifyRows(request, quality, 1, 0, size.height, signal);
    const dt = performance.now() - t0;
    if (rep > 0) times.get(c.id)?.push(dt);
  }
}
const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? Number.NaN;
};
process.stdout.write(`${'case'.padEnd(34)}${'median ms'.padStart(12)}\n`);
for (const c of cases) {
  process.stdout.write(
    `${c.id.padEnd(34)}${median(times.get(c.id) ?? [])
      .toFixed(1)
      .padStart(12)}\n`,
  );
}
process.exit(0);
