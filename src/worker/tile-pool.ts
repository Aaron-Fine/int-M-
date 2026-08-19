import { classifyRows } from '../render/classify-rows';
import { RenderCancelledError } from '../render';
import { copyBandIntoFrame, splitRowBands } from '../render/row-bands';
import type { DynamicsRenderRequest, SemanticFrame } from '../render';
import type { RenderQuality } from '../domain';
import type {
  SupervisorToTileMessage,
  TileMessageEvent,
  TileResultMessage,
  TileToSupervisorMessage,
  TileWorkerHandle,
} from './tile-protocol';

export function clampTileWorkers(value: number | undefined): number {
  const n = value ?? 0;
  return Math.min(4, Math.max(1, n > 0 ? n : 1));
}

export interface TilePoolOptions {
  readonly workerCount: number;
  readonly factory: () => TileWorkerHandle;
}

export interface TilePool {
  readonly size: number;
  classifyStable(
    request: DynamicsRenderRequest,
    quality: RenderQuality,
    signal: AbortSignal,
  ): Promise<SemanticFrame>;
  dispose(): void;
}

const throwIfAborted = (signal: AbortSignal): void => {
  if (signal.aborted) throw new RenderCancelledError();
};

const emptyStableFrame = (request: DynamicsRenderRequest): SemanticFrame => {
  const pixelCount = request.size.width * request.size.height;
  return {
    stage: 'stable',
    size: request.size,
    sampleStride: 1,
    status: new Uint8Array(pixelCount),
    period: new Uint32Array(pixelCount),
    smoothIterationOrMultiplierMagnitude: new Float64Array(pixelCount),
    multiplierAngle: new Float64Array(pixelCount),
    progress: 1,
  };
};

const frameFromBand = (
  request: DynamicsRenderRequest,
  band: Awaited<ReturnType<typeof classifyRows>>,
): SemanticFrame => ({
  stage: 'stable',
  size: request.size,
  sampleStride: 1,
  status: band.status as Uint8Array<ArrayBuffer>,
  period: band.period as Uint32Array<ArrayBuffer>,
  smoothIterationOrMultiplierMagnitude:
    band.smoothIterationOrMultiplierMagnitude as Float64Array<ArrayBuffer>,
  multiplierAngle: band.multiplierAngle as Float64Array<ArrayBuffer>,
  progress: 1,
});

interface ActiveJob {
  readonly generation: number;
  readonly signal: AbortSignal;
  readonly onAbort: () => void;
  readonly expectedJobs: number;
  readonly received: Map<number, TileResultMessage>;
  readonly frame: SemanticFrame;
  settled: boolean;
  resolve: (frame: SemanticFrame) => void;
  reject: (error: unknown) => void;
}

class TilePoolImpl implements TilePool {
  readonly #factory: () => TileWorkerHandle;
  readonly #workerCount: number;
  readonly #onWorkerMessage = (event: TileMessageEvent): void => {
    this.#handleWorkerMessage(event.data);
  };
  #generation = 0;
  #workers: TileWorkerHandle[] | undefined;
  #active: ActiveJob | undefined;
  #running: Promise<SemanticFrame> | undefined;

  public constructor(options: TilePoolOptions) {
    this.#factory = options.factory;
    this.#workerCount = clampTileWorkers(options.workerCount);
  }

  public get size(): number {
    return this.#workerCount;
  }

  public async classifyStable(
    request: DynamicsRenderRequest,
    quality: RenderQuality,
    signal: AbortSignal,
  ): Promise<SemanticFrame> {
    throwIfAborted(signal);

    const previous = this.#running;
    const needsDrain = this.#active !== undefined;
    if (needsDrain) {
      this.#cancelActive();
    }
    if (needsDrain && previous !== undefined) {
      await previous.catch(() => undefined);
    }
    throwIfAborted(signal);

    const run =
      this.#workerCount === 1
        ? this.#classifyInProcess(request, quality, signal)
        : this.#classifyTiled(request, quality, signal);
    this.#running = run;
    return run;
  }

  public dispose(): void {
    this.#cancelActive();
    for (const worker of this.#workers ?? []) {
      worker.removeEventListener('message', this.#onWorkerMessage);
      worker.terminate();
    }
    this.#workers = undefined;
  }

  async #classifyInProcess(
    request: DynamicsRenderRequest,
    quality: RenderQuality,
    signal: AbortSignal,
  ): Promise<SemanticFrame> {
    const band = await classifyRows(request, quality, 1, 0, request.size.height, signal);
    throwIfAborted(signal);
    return frameFromBand(request, band);
  }

  #classifyTiled(
    request: DynamicsRenderRequest,
    quality: RenderQuality,
    signal: AbortSignal,
  ): Promise<SemanticFrame> {
    const workers = this.#ensureWorkers();
    const bands = splitRowBands(request.size.height, workers.length);
    const generation = ++this.#generation;
    const frame = emptyStableFrame(request);

    const promise = new Promise<SemanticFrame>((resolve, reject) => {
      const active: ActiveJob = {
        generation,
        signal,
        onAbort: () => {
          this.#cancelActive();
        },
        expectedJobs: bands.length,
        received: new Map(),
        frame,
        settled: false,
        resolve,
        reject,
      };
      this.#active = active;
      signal.addEventListener('abort', active.onAbort, { once: true });
      if (signal.aborted) {
        this.#cancelActive();
        return;
      }

      for (let jobId = 0; jobId < bands.length; jobId += 1) {
        if (active.settled) break;
        const band = bands[jobId];
        const worker = workers[jobId];
        if (band === undefined || worker === undefined) break;
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
    });

    return promise;
  }

  #ensureWorkers(): TileWorkerHandle[] {
    if (this.#workers === undefined) {
      const workers: TileWorkerHandle[] = [];
      for (let i = 0; i < this.#workerCount; i += 1) {
        const worker = this.#factory();
        worker.addEventListener('message', this.#onWorkerMessage);
        workers.push(worker);
      }
      this.#workers = workers;
    }
    return this.#workers;
  }

  #handleWorkerMessage(message: TileToSupervisorMessage): void {
    const active = this.#active;
    if (active === undefined || active.settled) return;
    if (message.generation !== active.generation) return;

    if (message.type === 'tile-error') {
      this.#failActive(new Error(message.message));
      return;
    }

    copyBandIntoFrame(active.frame, message);
    active.received.set(message.jobId, message);
    if (active.received.size === active.expectedJobs) {
      this.#finishActive((job) => {
        job.resolve(job.frame);
      });
    }
  }

  #cancelActive(): void {
    this.#finishActive((active) => {
      this.#generation += 1;
      for (const worker of this.#workers ?? []) {
        worker.postMessage({ type: 'tile-cancel', generation: active.generation });
      }
      active.reject(new RenderCancelledError());
    });
  }

  #failActive(error: Error): void {
    this.#finishActive((active) => {
      for (const worker of this.#workers ?? []) {
        worker.postMessage({ type: 'tile-cancel', generation: active.generation });
      }
      active.reject(error);
    });
  }

  #finishActive(settle: (active: ActiveJob) => void): void {
    const active = this.#active;
    if (active === undefined || active.settled) return;
    active.settled = true;
    active.signal.removeEventListener('abort', active.onAbort);
    this.#active = undefined;
    settle(active);
  }
}

export function createTilePool(options: TilePoolOptions): TilePool {
  return new TilePoolImpl(options);
}
