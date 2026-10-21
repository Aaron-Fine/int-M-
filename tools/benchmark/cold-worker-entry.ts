/**
 * Bundle entry for the cold-worker benchmark (tools/benchmark/cold-workers.ts).
 *
 * One file, two roles. Loaded as a module worker it is a tile worker: it
 * classifies the stable-pass bands it is sent with classifyRows, as
 * src/worker/tile-handler.ts does, and answers with the band's classify time
 * and a hash of its output. Imported by the page it exports coldSample, which
 * starts fresh workers from this same file, so every sample begins with cold
 * JIT state, the state every page load starts from, and hands them the
 * stable-pass bands in the tile pool's order (src/worker/tile-pool.ts: one
 * center-out band per worker, then the rest in row order as workers free up).
 *
 * Build one bundle per arm from that arm's checkout (copy this file in if the
 * checkout predates it):
 *   npx rolldown tools/benchmark/cold-worker-entry.ts --format esm \
 *     --platform browser -m --file <dir>/<arm>.js
 */
import { classifyRows } from '../../src/render/classify-rows';
import { orderRowBandsForDispatch, splitRowBands } from '../../src/render/row-bands';
import { loadCorpusCases, profileQuality } from './judge/corpus';

interface BandJob {
  readonly caseId: string;
  readonly width: number;
  readonly height: number;
  readonly y0: number;
  readonly y1: number;
  readonly band: number;
  /** Hash the output (off in timed samples: the hash would count in the wall time). */
  readonly hash: boolean;
}

interface BandResult {
  readonly band: number;
  readonly classifyMs: number;
  readonly hash: number;
}

/** One cold sample: wall time of the stable pass and the summed band times. */
export interface ColdSample {
  readonly wallMs: number;
  readonly classifySumMs: number;
  /** Per worker, the classify time of each band in the order it ran. */
  readonly bandsByWorker: readonly (readonly { band: number; classifyMs: number }[])[];
  /** FNV-1a over the band hashes in band order (bit identity across arms); 0 without `withHash`. */
  readonly hash: number;
}

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 16777619;

const hashBand = (result: Awaited<ReturnType<typeof classifyRows>>): number => {
  let h = FNV_OFFSET;
  const words = [
    result.packedStatusPeriod,
    new Uint32Array(result.smoothIterationOrMultiplierMagnitude.buffer),
    new Uint32Array(result.multiplierAngle.buffer),
  ];
  for (const array of words) {
    for (const word of array) h = Math.imul(h ^ word, FNV_PRIME);
  }
  return h >>> 0;
};

const classifyBand = async (job: BandJob): Promise<BandResult> => {
  const corpusCase = loadCorpusCases().find((c) => c.id === job.caseId);
  if (corpusCase === undefined) throw new RangeError(`unknown corpus case ${job.caseId}`);
  const quality = profileQuality(corpusCase.profile);
  const result = await classifyRows(
    { viewport: corpusCase.viewport, size: { width: job.width, height: job.height }, quality },
    quality,
    1,
    job.y0,
    job.y1,
    new AbortController().signal,
  );
  return {
    band: job.band,
    classifyMs: result.timing.classifyMs,
    hash: job.hash ? hashBand(result) : 0,
  };
};

/** Ids of every frozen-corpus case, in corpus order. */
export const caseIds = (): readonly string[] => loadCorpusCases().map((c) => c.id);

/** Starts `count` module workers from this file and waits until each is ready. */
const startWorkers = (count: number): Promise<Worker[]> =>
  Promise.all(
    Array.from(
      { length: count },
      () =>
        new Promise<Worker>((resolve, reject) => {
          const worker = new Worker(import.meta.url, { type: 'module' });
          worker.onerror = (event) => {
            reject(new Error(event.message));
          };
          worker.onmessage = () => {
            resolve(worker);
          };
        }),
    ),
  );

export const coldSample = async (
  caseId: string,
  width: number,
  height: number,
  workerCount: number,
  bandsPerWorker: number,
  withHash: boolean,
): Promise<ColdSample> => {
  const bands = splitRowBands(height, workerCount * bandsPerWorker);
  const order = orderRowBandsForDispatch(bands, height, workerCount);
  const workers = await startWorkers(workerCount);
  const hashes = new Array<number>(bands.length).fill(0);
  const bandsByWorker = workers.map(() => [] as { band: number; classifyMs: number }[]);
  let next = 0;
  const started = performance.now();
  await new Promise<void>((resolve) => {
    let done = 0;
    const post = (index: number): void => {
      const band = order[next];
      const range = band === undefined ? undefined : bands[band];
      if (band === undefined || range === undefined) return;
      next += 1;
      const job: BandJob = {
        caseId,
        width,
        height,
        y0: range.y0,
        y1: range.y1,
        band,
        hash: withHash,
      };
      workers[index]?.postMessage(job);
    };
    workers.forEach((worker, index) => {
      worker.onmessage = (event: MessageEvent<BandResult>) => {
        hashes[event.data.band] = event.data.hash;
        bandsByWorker[index]?.push({ band: event.data.band, classifyMs: event.data.classifyMs });
        done += 1;
        if (done === bands.length) resolve();
        else post(index);
      };
      post(index);
    });
  });
  const wallMs = performance.now() - started;
  for (const worker of workers) worker.terminate();
  let hash = FNV_OFFSET;
  for (const value of hashes) hash = Math.imul(hash ^ value, FNV_PRIME);
  const classifySumMs = bandsByWorker.flat().reduce((sum, entry) => sum + entry.classifyMs, 0);
  return { wallMs, classifySumMs, bandsByWorker, hash: withHash ? hash >>> 0 : 0 };
};

// Worker role: no `document` in a worker scope.
if (typeof document === 'undefined') {
  const scope = globalThis as unknown as {
    postMessage(message: unknown): void;
    addEventListener(type: 'message', listener: (event: MessageEvent<BandJob>) => void): void;
  };
  scope.addEventListener('message', (event) => {
    void classifyBand(event.data).then((result) => {
      scope.postMessage(result);
    });
  });
  scope.postMessage({ ready: true });
}
