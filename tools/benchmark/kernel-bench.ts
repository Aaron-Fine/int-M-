/**
 * Quick serial kernel bench (development aid, not evidence): classifyRows over
 * the frozen corpus at a reduced raster, variants interleaved round-robin.
 * Usage: npm run kernel-bench -- [raster WxH] [reps] [variant ids...]
 */
import { classifyRows, type ClassifyRowsOptions } from '../../src/render/classify-rows';
import type { ClassifierMode } from '../../src/domain';
import { loadCorpusCases, profileQuality, parseRaster } from './judge/corpus';

interface Variant {
  readonly id: string;
  readonly mode?: ClassifierMode;
  readonly options: ClassifyRowsOptions;
}

const VARIANTS: readonly Variant[] = [
  // The reference scan, scalar row path.
  { id: 'legacy', mode: 'legacy-scan', options: {} },
  // The production default path (triggered scan + two-lane row kernel).
  { id: 'triggered', options: {} },
];

const args = process.argv.slice(2);
const size = parseRaster(args[0] ?? '384x240');
const reps = Number(args[1] ?? '5');
const chosen = args.length > 2 ? VARIANTS.filter((v) => args.slice(2).includes(v.id)) : VARIANTS;
const cases = loadCorpusCases();
const signal = new AbortController().signal;

const times = new Map<string, Map<string, number[]>>();
for (const c of cases) times.set(c.id, new Map(chosen.map((v) => [v.id, []])));

for (let rep = 0; rep <= reps; rep += 1) {
  for (const c of cases) {
    const quality = profileQuality(c.profile);
    const request = { viewport: c.viewport, size, quality };
    const order = rep % 2 === 0 ? chosen : [...chosen].reverse();
    for (const v of order) {
      const t0 = performance.now();
      await classifyRows(
        request,
        quality,
        1,
        0,
        size.height,
        signal,
        v.mode,
        undefined,
        undefined,
        v.options,
      );
      const dt = performance.now() - t0;
      if (rep > 0) times.get(c.id)?.get(v.id)?.push(dt);
    }
  }
}
const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? Number.NaN;
};
const base = chosen[0]?.id ?? '';
const logSums = new Map<string, number>(chosen.map((v) => [v.id, 0]));
const header = ['case'.padEnd(34), ...chosen.map((v) => v.id.padStart(16))].join('');
process.stdout.write(`${header}\n`);
for (const c of cases) {
  const row = times.get(c.id);
  const b = median(row?.get(base) ?? []);
  const cells = chosen.map((v) => {
    const m = median(row?.get(v.id) ?? []);
    logSums.set(v.id, (logSums.get(v.id) ?? 0) + Math.log(b / m));
    return `${m.toFixed(1)}(${(b / m).toFixed(2)}x)`.padStart(16);
  });
  process.stdout.write(`${c.id.padEnd(34)}${cells.join('')}\n`);
}
const geo = chosen.map((v) =>
  `${Math.exp((logSums.get(v.id) ?? 0) / cases.length).toFixed(3)}x`.padStart(16),
);
process.stdout.write(`${'geomean vs '.concat(base).padEnd(34)}${geo.join('')}\n`);
process.exit(0);
