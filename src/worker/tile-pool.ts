import { classifyRows } from '../render/classify-rows';
import { RenderCancelledError } from '../render/render-cancelled-error';
import { copyBandIntoFrame, splitRowBands } from '../render/row-bands';
import type { DynamicsRenderRequest, SemanticFrame, TilePool } from '../render/renderer';
import type { ClassifierMode, RenderQuality } from '../domain';
import type {
  SupervisorToTileMessage,
  TileMessageEvent,
  TileResultMessage,
  TileToSupervisorMessage,
  TileWorkerHandle,
} from './tile-protocol';

export type { TilePool };

const CHILD_DRAIN_TIMEOUT_MS = 250;

export function clampTileWorkers(value: number | undefined): number {
  const n = value ?? 0;
  return Math.min(4, Math.max(1, n > 0 ? n : 1));
}

export interface TilePoolOptions {
  readonly workerCount: number;
  readonly factory: () => TileWorkerHandle;
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
  readonly startedAt: number;
  settled: boolean;
  resolve: (frame: SemanticFrame) => void;
  reject: (error: unknown) => void;
}

interface ChildDrain {
  readonly generation: number;
  readonly remaining: Set<number>;
  readonly promise: Promise<void>;
  resolve: () => void;
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
  #drain: ChildDrain | undefined;

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
    classifierMode?: ClassifierMode,
  ): Promise<SemanticFrame> {
    throwIfAborted(signal);
    if (this.#active !== undefined) {
      this.#cancelActive();
    }
    if (this.#drain !== undefined) {
      await this.#awaitChildDrain();
    }
    throwIfAborted(signal);

    return this.#workerCount === 1
      ? this.#classifyInProcess(request, quality, signal, classifierMode)
      : this.#classifyTiled(request, quality, signal, classifierMode);
  }

  public dispose(): void {
    this.#cancelActive();
    this.#resetWorkers();
    this.#resolveDrain();
  }

  async #classifyInProcess(
    request: DynamicsRenderRequest,
    quality: RenderQuality,
    signal: AbortSignal,
    classifierMode?: ClassifierMode,
  ): Promise<SemanticFrame> {
    const band = await classifyRows(
      request,
      quality,
      1,
      0,
      request.size.height,
      signal,
      classifierMode,
    );
    throwIfAborted(signal);
    return frameFromBand(request, band);
  }

  #classifyTiled(
    request: DynamicsRenderRequest,
    quality: RenderQuality,
    signal: AbortSignal,
    classifierMode?: ClassifierMode,
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
        startedAt: performance.now(),
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

      const postedJobIds: number[] = [];
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
          ...(classifierMode === undefined ? {} : { classifierMode }),
        };
        worker.postMessage(message);
        postedJobIds.push(jobId);
      }
      if (postedJobIds.length > 0) this.#beginDrain(generation, postedJobIds);
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
    this.#settleChild(message.generation, message.jobId);
    const active = this.#active;
    if (active === undefined || active.settled) return;
    if (message.generation !== active.generation) return;

    if (message.type === 'tile-error') {
      this.#failActive(new Error(message.message));
      return;
    }
    if (message.type === 'tile-cancelled') {
      return;
    }

    copyBandIntoFrame(active.frame, message);
    active.received.set(message.jobId, message);
    if (active.received.size === active.expectedJobs) {
      this.#finishActive((job) => {
        const results = [...job.received.values()];
        job.resolve({
          ...job.frame,
          timing: {
            classifyMs: performance.now() - job.startedAt,
            yieldWaitMs: Math.max(0, ...results.map((result) => result.yieldWaitMs)),
            yieldCount: results.reduce((sum, result) => sum + result.yieldCount, 0),
          },
        });
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

  #beginDrain(generation: number, jobIds: readonly number[]): void {
    let resolveFn = (): void => undefined;
    const promise = new Promise<void>((resolve) => {
      resolveFn = resolve;
    });
    this.#drain = {
      generation,
      remaining: new Set(jobIds),
      promise,
      resolve: resolveFn,
    };
  }

  #settleChild(generation: number, jobId: number): void {
    const drain = this.#drain;
    if (drain?.generation !== generation) return;
    drain.remaining.delete(jobId);
    if (drain.remaining.size === 0) this.#resolveDrain();
  }

  #resolveDrain(): void {
    const drain = this.#drain;
    if (drain === undefined) return;
    this.#drain = undefined;
    drain.resolve();
  }

  async #awaitChildDrain(): Promise<void> {
    const drain = this.#drain;
    if (drain === undefined) return;
    await Promise.race([
      drain.promise,
      new Promise<void>((resolve) => {
        setTimeout(resolve, CHILD_DRAIN_TIMEOUT_MS);
      }),
    ]);
    if (this.#drain === drain && drain.remaining.size > 0) {
      this.#resetWorkers();
      this.#resolveDrain();
    }
  }

  #resetWorkers(): void {
    for (const worker of this.#workers ?? []) {
      worker.removeEventListener('message', this.#onWorkerMessage);
      worker.terminate();
    }
    this.#workers = undefined;
  }
}

export function createTilePool(options: TilePoolOptions): TilePool {
  return new TilePoolImpl(options);
}
