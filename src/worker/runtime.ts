import { locateChildComponent } from '../domain/child-component';
import {
  CpuRenderer,
  RenderCancelledError,
  SemanticFrameStore,
  semanticRequestKey,
  type DynamicsRenderRequest,
  type Renderer,
  type SemanticFrame,
} from '../render';
import type { SemanticView } from '../domain';
import { computeDynamicsPortrait } from '../domain/dynamics-portrait';
import { validIsolatedPeriod } from '../render/colorize';
import type {
  FrameProvenance,
  MainToWorkerMessage,
  RenderMessage,
  RequestId,
  WorkerErrorMessage,
  WorkerFrameTiming,
  WorkerToMainMessage,
} from './protocol';

export interface WorkerMessagePort {
  postMessage(message: WorkerToMainMessage, transfer?: readonly ArrayBuffer[]): void;
}

interface ActiveRender {
  readonly controller: AbortController;
  readonly key: string;
  readonly request: DynamicsRenderRequest;
  /** Identity of this semantic computation; survives rebinding to new requests. */
  readonly computeId: number;
  readonly startedAt: number;
  requestId: RequestId;
  semanticView: SemanticView;
  /** Period isolation of this computation's deliveries (a palette input). */
  isolatedPeriod: number | undefined;
  lastFrame?: SemanticFrame;
}

/** Origin of the single semantic-store entry, for delivery provenance. */
interface CachedOrigin {
  readonly key: string;
  readonly computeId: number;
  /** The semantic view the cached frame was most recently delivered in. */
  view: SemanticView;
  /** The period isolation it was most recently delivered with. */
  isolatedPeriod: number | undefined;
}

const errorMessage = (requestId: RequestId, error: unknown): WorkerErrorMessage => ({
  type: 'error',
  requestId,
  message: error instanceof Error ? error.message : 'unknown rendering error',
});

const dynamicsRequest = (message: RenderMessage): DynamicsRenderRequest => ({
  viewport: message.viewport,
  size: message.size,
  ...(message.quality === undefined ? {} : { quality: message.quality }),
});

/** Classification timing describes performed work: fresh frames only. */
const frameTiming = (
  frame: SemanticFrame,
  colorizeMs: number,
  computed: boolean,
): WorkerFrameTiming => {
  if (!computed) return { colorizeMs };
  const timing = frame.timing;
  return {
    classifyMs: timing?.classifyMs ?? 0,
    colorizeMs,
    yieldWaitMs: timing?.yieldWaitMs ?? 0,
    yieldCount: timing?.yieldCount ?? 0,
    ...(timing?.bandsElapsedMs === undefined ? {} : { bandsElapsedMs: timing.bandsElapsedMs }),
    ...(timing?.mergeCpuMs === undefined ? {} : { mergeCpuMs: timing.mergeCpuMs }),
  };
};

/**
 * The isolation that can change the raster: only the period view isolates, and
 * only a valid period. Anything else draws the same pixels, so it must not
 * change a frame's provenance.
 */
const effectiveIsolation = (message: RenderMessage): number | undefined =>
  message.semanticView === 'period' ? validIsolatedPeriod(message.isolatedPeriod) : undefined;

export class RenderWorkerRuntime {
  readonly #renderer: Renderer;
  readonly #port: WorkerMessagePort;
  readonly #semanticStore = new SemanticFrameStore();
  #activeRender: ActiveRender | undefined;
  #cachedOrigin: CachedOrigin | undefined;
  #nextComputeId = 1;

  public constructor(port: WorkerMessagePort, renderer: Renderer = new CpuRenderer()) {
    this.#port = port;
    this.#renderer = renderer;
  }

  public async handle(message: MainToWorkerMessage): Promise<void> {
    switch (message.type) {
      case 'cancel':
        this.#port.postMessage({ type: 'cancel-ack', requestId: message.requestId });
        if (this.#activeRender?.requestId === message.requestId) {
          // Quiescence is posted by #render once the renderer and its
          // nested workers have stopped.
          this.#activeRender.controller.abort();
        } else {
          // Nothing runs on behalf of this request: it already completed,
          // was served from the cache, or its computation was rebound.
          this.#port.postMessage({ type: 'cancelled', requestId: message.requestId });
        }
        return;

      case 'inspect':
        try {
          const orbit = this.#renderer.inspect(message.point, message.quality);
          this.#port.postMessage({
            type: 'inspection',
            requestId: message.requestId,
            result: { point: message.point, orbit },
          });
          if (message.portrait === true) {
            // Posted after the evidence so the inspector never waits for the picture.
            const portrait = computeDynamicsPortrait(message.point, orbit);
            this.#port.postMessage(
              { type: 'portrait', requestId: message.requestId, point: message.point, portrait },
              [portrait.rgba.buffer, portrait.orbit.buffer, portrait.cycle.buffer],
            );
          }
        } catch (error: unknown) {
          this.#port.postMessage(errorMessage(message.requestId, error));
        }
        return;

      case 'locate-child':
        try {
          this.#port.postMessage({
            type: 'child-component',
            requestId: message.requestId,
            rotation: message.rotation,
            location: locateChildComponent(message.point, message.period, message.rotation),
          });
        } catch (error: unknown) {
          this.#port.postMessage(errorMessage(message.requestId, error));
        }
        return;

      case 'render':
        await this.#render(message);
    }
  }

  #postFrame(
    requestId: RequestId,
    frame: SemanticFrame,
    view: SemanticView,
    isolatedPeriod: number | undefined,
    origin: {
      readonly source: FrameProvenance['source'];
      readonly active?: ActiveRender;
      readonly computeId: number;
    },
  ): void {
    const colorizeStarted = performance.now();
    const raster = this.#renderer.colorize(frame, view, isolatedPeriod);
    const colorizeMs = performance.now() - colorizeStarted;
    const computed = origin.source === 'computed';
    const workerTiming = frameTiming(frame, colorizeMs, computed);
    const provenance: FrameProvenance =
      origin.source === 'computed'
        ? {
            source: 'computed',
            computeId: origin.computeId,
            workerWallMs: performance.now() - (origin.active?.startedAt ?? colorizeStarted),
          }
        : { source: origin.source, originComputeId: origin.computeId };
    const response: WorkerToMainMessage = {
      type: 'frame',
      requestId,
      stage: raster.stage,
      provenance,
      width: raster.size.width,
      height: raster.size.height,
      rgba: raster.rgba,
      progress: raster.progress,
      workerTiming,
      ...(raster.periodKey === undefined ? {} : { periodKey: raster.periodKey }),
      ...(raster.isolatedPeriod === undefined ? {} : { isolatedPeriod: raster.isolatedPeriod }),
    };
    this.#port.postMessage(response, [raster.rgba.buffer]);
  }

  async #render(message: RenderMessage): Promise<void> {
    const request = dynamicsRequest(message);
    const key = semanticRequestKey(request);
    const isolated = effectiveIsolation(message);
    const cached = this.#semanticStore.get(request);
    const cachedOrigin = this.#cachedOrigin;
    if (cached !== undefined && cachedOrigin?.key === key) {
      if (this.#activeRender !== undefined && this.#activeRender.key !== key) {
        this.#activeRender.controller.abort();
      }
      // Isolation is a palette input like the view: changing it recolors.
      const source =
        cachedOrigin.view === message.semanticView && cachedOrigin.isolatedPeriod === isolated
          ? 'semantic-cache'
          : 'recolor';
      cachedOrigin.view = message.semanticView;
      cachedOrigin.isolatedPeriod = isolated;
      this.#postFrame(message.requestId, cached, message.semanticView, isolated, {
        source,
        computeId: cachedOrigin.computeId,
      });
      return;
    }

    if (
      this.#activeRender !== undefined &&
      !this.#activeRender.controller.signal.aborted &&
      this.#activeRender.key === key
    ) {
      this.#activeRender.requestId = message.requestId;
      this.#activeRender.semanticView = message.semanticView;
      this.#activeRender.isolatedPeriod = isolated;
      if (this.#activeRender.lastFrame !== undefined) {
        this.#postFrame(
          message.requestId,
          this.#activeRender.lastFrame,
          message.semanticView,
          isolated,
          {
            source: 'inflight-replay',
            computeId: this.#activeRender.computeId,
          },
        );
      }
      return;
    }

    this.#activeRender?.controller.abort();
    const active: ActiveRender = {
      controller: new AbortController(),
      key,
      request,
      computeId: this.#nextComputeId++,
      startedAt: performance.now(),
      requestId: message.requestId,
      semanticView: message.semanticView,
      isolatedPeriod: isolated,
    };
    this.#activeRender = active;

    try {
      await this.#renderer.render(request, active.controller.signal, (frame) => {
        if (active.controller.signal.aborted || this.#activeRender !== active) {
          return;
        }
        active.lastFrame = frame;
        if (frame.stage === 'stable') {
          this.#semanticStore.put(active.request, frame);
          this.#cachedOrigin = {
            key: active.key,
            computeId: active.computeId,
            view: active.semanticView,
            isolatedPeriod: active.isolatedPeriod,
          };
        }
        this.#postFrame(active.requestId, frame, active.semanticView, active.isolatedPeriod, {
          source: 'computed',
          active,
          computeId: active.computeId,
        });
      });
      if (active.controller.signal.aborted) {
        await this.#postQuiesced(active.requestId);
      }
    } catch (error: unknown) {
      if (error instanceof RenderCancelledError || active.controller.signal.aborted) {
        await this.#postQuiesced(active.requestId);
      } else {
        this.#port.postMessage(errorMessage(active.requestId, error));
      }
    } finally {
      if (this.#activeRender === active) {
        this.#activeRender = undefined;
      }
    }
  }

  async #postQuiesced(requestId: RequestId): Promise<void> {
    await this.#renderer.quiesce?.();
    this.#port.postMessage({ type: 'cancelled', requestId });
  }
}
