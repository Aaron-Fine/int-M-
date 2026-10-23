/**
 * Cold-worker benchmark: the stable pass of a corpus view in fresh tile
 * workers, in a headless browser. Directional evidence, not a release
 * measurement.
 *
 * Every page load starts the tile workers cold, so the stable pass the
 * release harness times runs while the engines are still deciding what to
 * compile. Code that first runs late in a worker's life (a branch taken for
 * the first time after the optimizing compile) costs bailouts, invalidations
 * and recompiles there that a warm benchmark (tools/benchmark/fallback-overhead.ts)
 * never sees (ADR 0010 amendment of 2026-10-20). This tool times that cold
 * state alone: per sample, `--workers` fresh module workers classify the
 * view's `--workers` × `--bands-per-worker` stable bands in the tile pool's
 * dispatch order. Arms run interleaved, the order rotating every repetition;
 * repetition 0 only checks that every arm produces the same output (hash).
 *
 * Usage:
 *   node tools/benchmark/cold-workers.ts --engine firefox|chromium \
 *     --arm base=<bundle.js> --arm candidate=<bundle.js> [--arm ...] \
 *     [--cases id,id] [--reps N] [--raster WxH] [--workers 4] \
 *     [--bands-per-worker 8] [--out file.json]
 * Each bundle is built from tools/benchmark/cold-worker-entry.ts (see its
 * header). The first arm is the reference of the paired ratios. Runs only on
 * the bundled Playwright browsers, headless.
 */
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { chromium, firefox } from '@playwright/test';

interface Sample {
  readonly wallMs: number;
  readonly classifySumMs: number;
  readonly bandsByWorker: readonly (readonly { band: number; classifyMs: number }[])[];
  readonly hash: number;
}

const { values } = parseArgs({
  options: {
    engine: { type: 'string', default: 'firefox' },
    arm: { type: 'string', multiple: true, default: [] },
    cases: { type: 'string', default: 'mi-easy-default-full,mi-easy-exterior-heavy' },
    reps: { type: 'string', default: '21' },
    raster: { type: 'string', default: '1024x640' },
    workers: { type: 'string', default: '4' },
    'bands-per-worker': { type: 'string', default: '8' },
    out: { type: 'string' },
  },
});

const die = (message: string): never => {
  process.stderr.write(`${message}\n`);
  process.exit(2);
};

const engine =
  values.engine === 'chromium' || values.engine === 'firefox'
    ? values.engine
    : die('--engine must be chromium or firefox');
const arms = values.arm.map((spec) => {
  const [name, file] = spec.split('=');
  if (name === undefined || file === undefined || !/^[\w-]+$/.test(name)) {
    return die(`--arm must look like name=bundle.js, got "${spec}"`);
  }
  return { name, file: path.resolve(file) };
});
if (arms.length === 0) die('give at least one --arm name=bundle.js');
const cases = values.cases.split(',');
const reps = Number(values.reps);
const rasterMatch = /^(\d+)x(\d+)$/.exec(values.raster);
if (rasterMatch === null) die('--raster must look like 1024x640');
const width = Number(rasterMatch?.[1]);
const height = Number(rasterMatch?.[2]);
const workerCount = Number(values.workers);
const bandsPerWorker = Number(values['bands-per-worker']);

// Serve the bundles cross-origin isolated (fine-grained timers in Firefox).
const root = mkdtempSync(path.join(os.tmpdir(), 'cold-workers-'));
// Also runs on process.exit and after a thrown error.
process.on('exit', () => {
  rmSync(root, { recursive: true, force: true });
});
for (const arm of arms) copyFileSync(arm.file, path.join(root, `${arm.name}.js`));
writeFileSync(
  path.join(root, 'index.html'),
  '<!doctype html><meta charset="utf-8"><title>cold</title>',
);
const server: Server = createServer((request, response) => {
  const name =
    path.basename(new URL(request.url ?? '/', 'http://localhost').pathname) || 'index.html';
  let body: Buffer;
  try {
    body = readFileSync(path.join(root, name));
  } catch {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, {
    'content-type': name.endsWith('.js') ? 'text/javascript' : 'text/html',
    'cache-control': 'no-store',
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-embedder-policy': 'require-corp',
    'cross-origin-resource-policy': 'same-origin',
  });
  response.end(body);
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
const port = typeof address === 'object' && address !== null ? address.port : die('no port');

const load = os.loadavg()[0] ?? 0;
if (load > 1.5)
  process.stderr.write(`warning: 1-minute load average ${load.toFixed(2)}; expect noise\n`);

const browser = await (engine === 'firefox' ? firefox : chromium).launch({ headless: true });
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${String(port)}/index.html`);
const result = await page.evaluate(
  async (input) => {
    interface Module {
      coldSample(
        caseId: string,
        w: number,
        h: number,
        workers: number,
        bandsPerWorker: number,
        withHash: boolean,
      ): Promise<Sample>;
    }
    const modules: Record<string, Module> = {};
    for (const name of input.arms) modules[name] = (await import(`/${name}.js`)) as Module;
    const samples: Record<string, Record<string, Sample[]>> = {};
    const hashes: Record<string, Record<string, number>> = {};
    for (let rep = 0; rep <= input.reps; rep += 1) {
      for (const caseId of input.cases) {
        const caseSamples = (samples[caseId] ??= {});
        const caseHashes = (hashes[caseId] ??= {});
        for (let slot = 0; slot < input.arms.length; slot += 1) {
          const name = input.arms[(rep + slot) % input.arms.length] ?? '';
          const module = modules[name];
          if (module === undefined) throw new Error(`arm ${name} not loaded`);
          const sample = await module.coldSample(
            caseId,
            input.width,
            input.height,
            input.workerCount,
            input.bandsPerWorker,
            rep === 0,
          );
          if (rep === 0) caseHashes[name] = sample.hash;
          else (caseSamples[name] ??= []).push(sample);
        }
      }
    }
    return {
      samples,
      hashes,
      userAgent: navigator.userAgent,
      isolated: (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated === true,
    };
  },
  { arms: arms.map((a) => a.name), cases, reps, width, height, workerCount, bandsPerWorker },
);
await browser.close();
server.close();

const median = (xs: readonly number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 === 1 ? (s[(n - 1) / 2] ?? Number.NaN) : ((s[n / 2 - 1] ?? 0) + (s[n / 2] ?? 0)) / 2;
};
const reference = arms[0]?.name ?? '';
const rows = cases.flatMap((caseId) =>
  (['wallMs', 'classifySumMs'] as const).map((metric) => {
    const bySample = (name: string): number[] =>
      (result.samples[caseId]?.[name] ?? []).map((sample) => sample[metric]);
    const base = bySample(reference);
    return {
      caseId,
      metric,
      arms: arms.map((arm) => {
        const xs = bySample(arm.name);
        // Paired median log-ratio against the first arm (same repetition).
        const ratio = Math.exp(median(xs.map((x, i) => Math.log(x / (base[i] ?? Number.NaN)))));
        return { name: arm.name, medianMs: median(xs), ratioToReference: ratio };
      }),
    };
  }),
);
for (const row of rows) {
  const cells = row.arms
    .map(
      (a) =>
        `${a.name} ${a.medianMs.toFixed(1)} ms (${((a.ratioToReference - 1) * 100).toFixed(1)}%)`,
    )
    .join('  ');
  process.stdout.write(`${engine} ${row.caseId.padEnd(30)} ${row.metric.padEnd(13)} ${cells}\n`);
}
let outputDiffers = false;
for (const caseId of cases) {
  const distinct = new Set(Object.values(result.hashes[caseId] ?? {}));
  if (distinct.size !== 1) outputDiffers = true;
  process.stdout.write(
    `${caseId}: ${distinct.size === 1 ? 'identical output in every arm' : 'OUTPUT DIFFERS between arms'}\n`,
  );
}
if (values.out !== undefined) {
  writeFileSync(
    values.out,
    `${JSON.stringify({ engine, load, reps, raster: values.raster, workerCount, bandsPerWorker, userAgent: result.userAgent, crossOriginIsolated: result.isolated, arms, rows, hashes: result.hashes, samples: result.samples }, null, 2)}\n`,
  );
}
process.exit(outputDiffers ? 1 : 0);
