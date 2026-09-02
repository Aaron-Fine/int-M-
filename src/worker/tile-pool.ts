import { classifyRows } from '../render/classify-rows';
import { RenderCancelledError } from '../render/render-cancelled-error';
import { orderRowBandsForDispatch, splitRowBands } from '../render/row-bands';
import { PACKED_OUTPUT_REVISION } from '../render/packed-semantic';
import type { RowBand } from '../render/row-bands';
import type { SemanticStageTiming } from '../render/renderer';
import type {
  DynamicsRenderRequest,
  FrameOutput,
  SemanticBand,
  SemanticFrame,
  TilePool,
} from '../render/renderer';
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
/**
 * Stable bands per worker per frame (renderer-path detail, plan §5). More
 * bands than workers lets the supervisor dispatch the center-most bands
 * first and hand out the remaining bands as workers free up, so mid-screen
 * rows are classified before the periphery without idle workers. The band
 * split stays static and deterministic for a given size and pool size.
 */
const BANDS_PER_WORKER = 4;

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

/**
 * Supervisor-owned storage for one band of the stable frame. On the
 * zero-copy path the buffers are handed to the tile worker as transferable
 * views and the returned views are adopted directly; on the legacy-merge
 * measurement arm the worker-allocated results are copied in here.
 */
interface BandStorage {
  packedStatusPeriod: Uint32Array<ArrayBuffer>;
  smoothIterationOrMultiplierMagnitude: Float64Array<ArrayBuffer>;
  multiplierAngle: Float64Array<ArrayBuffer>;
}

const allocateBandStorage = (length: number): BandStorage => ({
  packedStatusPeriod: new Uint32Array(length),
  smoothIterationOrMultiplierMagnitude: new Float64Array(length),
  multiplierAngle: new Float64Array(length),
});

const frameFromBands = (
  request: DynamicsRenderRequest,
  bands: readonly RowBand[],
  storage: readonly BandStorage[],
  progress: number,
  timing: SemanticStageTiming,
): SemanticFrame => ({
  stage: 'stable',
  size: request.size,
  sampleStride: 1,
  bands: bands.map((band, index) => {
    const buffers = storage[index];
    if (buffers === undefined) throw new Error(`band ${index} storage missing`);
    return {
      y0: band.y0,
      y1: band.y1,
      packedStatusPeriod: buffers.packedStatusPeriod,
      smoothIterationOrMultiplierMagnitude: buffers.smoothIterationOrMultiplierMagnitude,
      multiplierAngle: buffers.multiplierAngle,
    } satisfies SemanticBand;
  }),
  progress,
  timing,
});

interface ActiveJob {
  readonly generation: number;
  readonly signal: AbortSignal;
  readonly onAbort: () => void;
  readonly request: DynamicsRenderRequest;
  readonly quality: RenderQuality;
  readonly classifierMode?: ClassifierMode;
  readonly bands: readonly RowBand[];
  readonly expectedJobs: number;
  readonly received: Map<number, TileResultMessage>;
  readonly startedAt: number;
  /** Dispatch order over band indices; position `nextDispatch` posts next. */
  readonly dispatchOrder: readonly number[];
  readonly assignment: Map<number, number>;
  readonly frameOutput: FrameOutput;
  /** Supervisor-owned per-band storage; filled as results arrive. */
  readonly bandStorage: BandStorage[];
  nextDispatch: number;
  readonly bandsElapsedMs: number[];
  mergeCpuMs: number;
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
      request.yieldMechanism,
    );
    throwIfAborted(signal);
    return {
      stage: 'stable',
      size: request.size,
      sampleStride: 1,
      bands: [
        {
          y0: 0,
          y1: request.size.height,
          packedStatusPeriod: band.packedStatusPeriod,
          smoothIterationOrMultiplierMagnitude: band.smoothIterationOrMultiplierMagnitude,
          multiplierAngle: band.multiplierAngle,
        },
      ],
      progress: 1,
      timing: band.timing,
    };
  }

  #classifyTiled(
    request: DynamicsRenderRequest,
    quality: RenderQuality,
    signal: AbortSignal,
    classifierMode?: ClassifierMode,
  ): Promise<SemanticFrame> {
    const workers = this.#ensureWorkers();
    const bands = splitRowBands(request.size.height, workers.length * BANDS_PER_WORKER);
    const dispatchOrder =
      request.bandOrder === 'legacy'
        ? bands.map((_, index) => index)
        : orderRowBandsForDispatch(bands, request.size.height, workers.length);
    const generation = ++this.#generation;
    const frameOutput = request.frameOutput ?? 'zero-copy';
    // Zero-copy: per-band buffers are the frame storage and travel to the
    // tile worker as transferable views. Legacy-merge: workers allocate and
    // the supervisor copies; storage below receives the results.
    const bandStorage = bands.map((band) =>
      allocateBandStorage((band.y1 - band.y0) * request.size.width),
    );

    const promise = new Promise<SemanticFrame>((resolve, reject) => {
      const active: ActiveJob = {
        generation,
        signal,
        onAbort: () => {
          this.#cancelActive();
        },
        request,
        quality,
        ...(classifierMode === undefined ? {} : { classifierMode }),
        bands,
        expectedJobs: bands.length,
        received: new Map(),
        startedAt: performance.now(),
        dispatchOrder,
        assignment: new Map(),
        frameOutput,
        bandStorage,
        nextDispatch: 0,
        bandsElapsedMs: new Array<number>(bands.length).fill(Number.NaN),
        mergeCpuMs: 0,
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

      // First wave: one band per worker, center-most first. Remaining bands
      // are posted from #handleWorkerMessage as workers free up.
      this.#beginDrain(generation);
      for (
        let workerIndex = 0;
        workerIndex < workers.length && active.nextDispatch < dispatchOrder.length;
        workerIndex += 1
      ) {
        const bandIndex = dispatchOrder[active.nextDispatch];
        active.nextDispatch += 1;
        if (bandIndex === undefined) break;
        this.#postBand(active, workers, workerIndex, bandIndex);
      }
    });

    return promise;
  }

  #postBand(
    active: ActiveJob,
    workers: readonly TileWorkerHandle[],
    workerIndex: number,
    bandIndex: number,
  ): void {
    const band = active.bands[bandIndex];
    const worker = workers[workerIndex];
    if (band === undefined) {
      throw new Error(`band ${bandIndex} missing for generation ${active.generation}`);
    }
    if (worker === undefined) throw new Error(`worker ${workerIndex} missing`);
    active.assignment.set(bandIndex, workerIndex);
    const zeroCopy = active.frameOutput === 'zero-copy';
    const storage = active.bandStorage[bandIndex];
    const bandOutput =
      zeroCopy && storage !== undefined
        ? {
            y0: band.y0,
            y1: band.y1,
            packedStatusPeriod: storage.packedStatusPeriod,
            smoothIterationOrMultiplierMagnitude: storage.smoothIterationOrMultiplierMagnitude,
            multiplierAngle: storage.multiplierAngle,
          }
        : undefined;
    const message: SupervisorToTileMessage = {
      type: 'tile-classify',
      generation: active.generation,
      jobId: bandIndex,
      viewport: active.request.viewport,
      size: active.request.size,
      y0: band.y0,
      y1: band.y1,
      quality: active.quality,
      ...(active.classifierMode === undefined ? {} : { classifierMode: active.classifierMode }),
      ...(active.request.yieldMechanism === undefined
        ? {}
        : { yieldMechanism: active.request.yieldMechanism }),
      ...(bandOutput === undefined ? {} : { bandOutput }),
      ...(bandOutput === undefined ? {} : { outputRevision: PACKED_OUTPUT_REVISION }),
    };
    // Zero-copy transfers the band storage to the worker; it returns with
    // the result. The supervisor never touches these buffers in between —
    // they are detached until the result arrives.
    worker.postMessage(
      message,
      bandOutput === undefined
        ? []
        : [
            bandOutput.packedStatusPeriod.buffer,
            bandOutput.smoothIterationOrMultiplierMagnitude.buffer,
            bandOutput.multiplierAngle.buffer,
          ],
    );
    this.#drain?.remaining.add(bandIndex);
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
    if (
      active !== undefined &&
      !active.settled &&
      message.generation === active.generation &&
      message.type === 'tile-result'
    ) {
      // Hand the freed worker its next band before the drain observes idle,
      // so the drain only resolves once every band has been posted and settled.
      this.#dispatchNext(active, message.jobId);
    }
    this.#settleChild(message.generation, message.jobId);
    const current = this.#active;
    if (current === undefined || current.settled) return;
    if (message.generation !== current.generation) return;

    if (message.type === 'tile-error') {
      this.#failActive(new Error(message.message));
      return;
    }
    if (message.type === 'tile-cancelled') {
      return;
    }

    const mergeStarted = performance.now();
    const storage = current.bandStorage[message.jobId];
    if (storage === undefined) {
      this.#failActive(new Error(`band ${message.jobId} storage missing`));
      return;
    }
    if (current.frameOutput === 'zero-copy') {
      // The returned views ARE the frame storage: no copy. They are the
      // transferred band buffers, re-owned by the supervisor on arrival.
      storage.packedStatusPeriod = message.packedStatusPeriod;
      storage.smoothIterationOrMultiplierMagnitude = message.smoothIterationOrMultiplierMagnitude;
      storage.multiplierAngle = message.multiplierAngle;
    } else {
      // Legacy-merge measurement arm: copy the worker's output into the
      // supervisor-owned frame storage (the merge memcpy the zero-copy path
      // removes).
      storage.packedStatusPeriod.set(message.packedStatusPeriod);
      storage.smoothIterationOrMultiplierMagnitude.set(
        message.smoothIterationOrMultiplierMagnitude,
      );
      storage.multiplierAngle.set(message.multiplierAngle);
    }
    current.mergeCpuMs += performance.now() - mergeStarted;
    current.received.set(message.jobId, message);
    current.bandsElapsedMs[message.jobId] = performance.now() - current.startedAt;
    if (current.received.size === current.expectedJobs) {
      this.#finishActive((job) => {
        const results = [...job.received.values()];
        job.resolve(
          frameFromBands(job.request, job.bands, job.bandStorage, 1, {
            classifyMs: performance.now() - job.startedAt,
            yieldWaitMs: Math.max(0, ...results.map((result) => result.yieldWaitMs)),
            yieldCount: results.reduce((sum, result) => sum + result.yieldCount, 0),
            bandsElapsedMs: [...job.bandsElapsedMs],
            mergeCpuMs: job.mergeCpuMs,
          }),
        );
      });
    }
  }

  #dispatchNext(active: ActiveJob, settledJobId: number): void {
    const workerIndex = active.assignment.get(settledJobId);
    active.assignment.delete(settledJobId);
    if (workerIndex === undefined) return;
    if (active.nextDispatch >= active.dispatchOrder.length) return;
    const bandIndex = active.dispatchOrder[active.nextDispatch];
    active.nextDispatch += 1;
    if (bandIndex === undefined) return;
    this.#postBand(active, this.#ensureWorkers(), workerIndex, bandIndex);
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

  #beginDrain(generation: number): void {
    let resolveFn = (): void => undefined;
    const promise = new Promise<void>((resolve) => {
      resolveFn = resolve;
    });
    this.#drain = {
      generation,
      remaining: new Set<number>(),
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
