import { splitRowBands } from '../../../../src/render/row-bands';
import type { DynamicsRenderRequest } from '../../../../src/render/renderer';
import type { RenderQuality } from '../../../../src/domain';
import type {
  SupervisorToTileMessage,
  TileToSupervisorMessage,
} from '../../../../src/worker/tile-protocol';
import type { PoolBandSample } from './microbench-api';

/** One classify run through the driver, without the runner-set bookkeeping. */
export interface PoolRunSample {
  readonly workerCount: number;
  /** postMessage(first band) until every band was received and merged. */
  readonly wallMs: number;
  readonly mergeMs: number;
  readonly yieldWaitMs: number;
  readonly yieldCount: number;
  readonly bands: readonly PoolBandSample[];
}

/**
 * Parameterized tile-pool driver for workstream K (pool sizing).
 *
 * The production pool (`src/worker/tile-pool.ts`) hard-caps at
 * `clampTileWorkers` = 4 workers; this driver reuses the real
 * `src/worker/tile.worker.ts` module, the real band splitting
 * (`splitRowBands`), and the real tile message protocol with an arbitrary
 * worker count instead of modifying src/. Banding shape matches the
 * production static banding: exactly one band per worker per frame.
 * `src/` is untouched.
 */

interface RunRequest {
  readonly request: DynamicsRenderRequest;
  readonly quality: RenderQuality;
}

interface RunState {
  readonly generation: number;
  readonly startedAt: number;
  readonly expected: number;
  readonly bandCount: number;
  readonly frame: {
    readonly packedStatusPeriod: Uint32Array<ArrayBuffer>;
    readonly smoothIterationOrMultiplierMagnitude: Float64Array<ArrayBuffer>;
    readonly multiplierAngle: Float64Array<ArrayBuffer>;
    readonly size: { readonly width: number; readonly height: number };
  };
  readonly bands: PoolBandSample[];
  mergeMs: number;
  yieldWaitMs: number;
  yieldCount: number;
  received: number;
  resolve: (state: RunState) => void;
  reject: (error: Error) => void;
}

export class TileWorkerSet {
  readonly #workers: Worker[] = [];
  readonly #count: number;
  #generation = 0;
  #run: RunState | undefined;

  public constructor(count: number) {
    this.#count = count;
  }

  public get count(): number {
    return this.#count;
  }

  /**
   * Constructs the worker objects. Module fetch/compile continues
   * asynchronously and is absorbed by the warmup rep, mirroring the
   * production pool whose workers persist across frames.
   */
  public spawn(): number {
    const started = performance.now();
    for (let index = 0; index < this.#count; index += 1) {
      const worker = new Worker(new URL('../../../../src/worker/tile.worker.ts', import.meta.url), {
        type: 'module',
        name: `mi-poc-tile-${index}`,
      });
      worker.addEventListener('message', (event: MessageEvent<TileToSupervisorMessage>) => {
        this.#onMessage(event.data);
      });
      worker.addEventListener('messageerror', () => {
        this.#fail(new Error('worker messageerror (deserialization failed)'));
      });
      this.#workers.push(worker);
    }
    return performance.now() - started;
  }

  public async classify({ request, quality }: RunRequest): Promise<PoolRunSample> {
    const bands = splitRowBands(request.size.height, this.#count);
    const generation = ++this.#generation;
    const pixelCount = request.size.width * request.size.height;
    const state: RunState = {
      generation,
      startedAt: performance.now(),
      expected: bands.length,
      bandCount: bands.length,
      frame: {
        packedStatusPeriod: new Uint32Array(pixelCount),
        smoothIterationOrMultiplierMagnitude: new Float64Array(pixelCount),
        multiplierAngle: new Float64Array(pixelCount),
        size: request.size,
      },
      bands: [],
      mergeMs: 0,
      yieldWaitMs: 0,
      yieldCount: 0,
      received: 0,
      resolve: () => undefined,
      reject: () => undefined,
    };
    const promise = new Promise<RunState>((resolve, reject) => {
      state.resolve = resolve;
      state.reject = reject;
    });
    this.#run = state;

    for (let jobId = 0; jobId < bands.length; jobId += 1) {
      const worker = this.#workers[jobId];
      const band = bands[jobId];
      if (worker === undefined || band === undefined) {
        throw new Error(`worker or band missing for jobId ${jobId}`);
      }
      const message: SupervisorToTileMessage = {
        type: 'tile-classify',
        generation,
        jobId,
        viewport: request.viewport,
        size: request.size,
        y0: band.y0,
        y1: band.y1,
        quality,
      };
      worker.postMessage(message);
    }
    const settled = await promise;
    return {
      workerCount: this.#count,
      wallMs: performance.now() - settled.startedAt,
      mergeMs: settled.mergeMs,
      yieldWaitMs: settled.yieldWaitMs,
      yieldCount: settled.yieldCount,
      bands: settled.bands,
    };
  }

  public dispose(): void {
    for (const worker of this.#workers) {
      worker.terminate();
    }
    this.#workers.length = 0;
    this.#run = undefined;
  }

  #onMessage(message: TileToSupervisorMessage): void {
    const run = this.#run;
    if (run === undefined) return;
    if (message.generation !== run.generation) return;
    if (message.type === 'tile-error') {
      run.reject(new Error(`tile worker error: ${message.message}`));
      return;
    }
    if (message.type === 'tile-cancelled') return;
    const mergeStarted = performance.now();
    // Packed result: status+period share one Uint32 per pixel, so the merge
    // is one set() per channel (the production zero-copy path removes even
    // this copy; the driver keeps the merge for its mergeMs measurement).
    const offset = message.y0 * run.frame.size.width;
    run.frame.packedStatusPeriod.set(message.packedStatusPeriod, offset);
    run.frame.smoothIterationOrMultiplierMagnitude.set(
      message.smoothIterationOrMultiplierMagnitude,
      offset,
    );
    run.frame.multiplierAngle.set(message.multiplierAngle, offset);
    run.mergeMs += performance.now() - mergeStarted;
    run.yieldWaitMs = Math.max(run.yieldWaitMs, message.yieldWaitMs);
    run.yieldCount += message.yieldCount;
    run.bands.push({
      jobId: message.jobId,
      y0: message.y0,
      y1: message.y1,
      receivedAtMs: performance.now() - run.startedAt,
      yieldWaitMs: message.yieldWaitMs,
      yieldCount: message.yieldCount,
    });
    run.received += 1;
    if (run.received === run.expected) {
      this.#run = undefined;
      run.resolve(run);
    }
  }

  #fail(error: Error): void {
    const run = this.#run;
    if (run) {
      this.#run = undefined;
      run.reject(error);
    }
  }
}
