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
import type {
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
  requestId: RequestId;
  semanticView: SemanticView;
  lastFrame?: SemanticFrame;
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
  ...(message.classifierMode === undefined ? {} : { classifierMode: message.classifierMode }),
  ...(message.bandOrder === undefined ? {} : { bandOrder: message.bandOrder }),
});

export class RenderWorkerRuntime {
  readonly #renderer: Renderer;
  readonly #port: WorkerMessagePort;
  readonly #semanticStore = new SemanticFrameStore();
  #activeRender: ActiveRender | undefined;

  public constructor(port: WorkerMessagePort, renderer: Renderer = new CpuRenderer()) {
    this.#port = port;
    this.#renderer = renderer;
  }

  public async handle(message: MainToWorkerMessage): Promise<void> {
    switch (message.type) {
      case 'cancel':
        if (this.#activeRender?.requestId === message.requestId) {
          this.#activeRender.controller.abort();
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
        } catch (error: unknown) {
          this.#port.postMessage(errorMessage(message.requestId, error));
        }
        return;

      case 'render':
        await this.#render(message);
    }
  }

  #postFrame(requestId: RequestId, frame: SemanticFrame, view: SemanticView): void {
    const colorizeStarted = performance.now();
    const raster = this.#renderer.colorize(frame, view);
    const workerTiming: WorkerFrameTiming = {
      classifyMs: frame.timing?.classifyMs ?? 0,
      colorizeMs: performance.now() - colorizeStarted,
      yieldWaitMs: frame.timing?.yieldWaitMs ?? 0,
      yieldCount: frame.timing?.yieldCount ?? 0,
      ...(frame.timing?.bandsElapsedMs === undefined
        ? {}
        : { bandsElapsedMs: frame.timing.bandsElapsedMs }),
    };
    const response: WorkerToMainMessage = {
      type: 'frame',
      requestId,
      stage: raster.stage,
      width: raster.size.width,
      height: raster.size.height,
      rgba: raster.rgba,
      progress: raster.progress,
      workerTiming,
    };
    this.#port.postMessage(response, [raster.rgba.buffer]);
  }

  async #render(message: RenderMessage): Promise<void> {
    const request = dynamicsRequest(message);
    const key = semanticRequestKey(request);
    const cached = this.#semanticStore.get(request);
    if (cached !== undefined) {
      if (this.#activeRender !== undefined && this.#activeRender.key !== key) {
        this.#activeRender.controller.abort();
      }
      this.#postFrame(message.requestId, cached, message.semanticView);
      return;
    }

    if (
      this.#activeRender !== undefined &&
      !this.#activeRender.controller.signal.aborted &&
      this.#activeRender.key === key
    ) {
      this.#activeRender.requestId = message.requestId;
      this.#activeRender.semanticView = message.semanticView;
      if (this.#activeRender.lastFrame !== undefined) {
        this.#postFrame(message.requestId, this.#activeRender.lastFrame, message.semanticView);
      }
      return;
    }

    this.#activeRender?.controller.abort();
    const active: ActiveRender = {
      controller: new AbortController(),
      key,
      request,
      requestId: message.requestId,
      semanticView: message.semanticView,
    };
    this.#activeRender = active;

    try {
      await this.#renderer.render(request, active.controller.signal, (frame) => {
        if (active.controller.signal.aborted || this.#activeRender !== active) {
          return;
        }
        active.lastFrame = frame;
        this.#semanticStore.put(active.request, frame);
        this.#postFrame(active.requestId, frame, active.semanticView);
      });
      if (active.controller.signal.aborted) {
        this.#port.postMessage({ type: 'cancelled', requestId: active.requestId });
      }
    } catch (error: unknown) {
      if (error instanceof RenderCancelledError || active.controller.signal.aborted) {
        this.#port.postMessage({ type: 'cancelled', requestId: active.requestId });
      } else {
        this.#port.postMessage(errorMessage(active.requestId, error));
      }
    } finally {
      if (this.#activeRender === active) {
        this.#activeRender = undefined;
      }
    }
  }
}
