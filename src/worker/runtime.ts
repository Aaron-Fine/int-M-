import { CpuRenderer, RenderCancelledError, type Renderer } from '../render';
import type {
  MainToWorkerMessage,
  RequestId,
  WorkerErrorMessage,
  WorkerToMainMessage,
} from './protocol';

export interface WorkerMessagePort {
  postMessage(message: WorkerToMainMessage, transfer?: readonly ArrayBuffer[]): void;
}

const errorMessage = (requestId: RequestId, error: unknown): WorkerErrorMessage => ({
  type: 'error',
  requestId,
  message: error instanceof Error ? error.message : 'unknown rendering error',
});

export class RenderWorkerRuntime {
  readonly #renderer: Renderer;
  readonly #port: WorkerMessagePort;
  readonly #activeRenders = new Map<RequestId, AbortController>();

  public constructor(port: WorkerMessagePort, renderer: Renderer = new CpuRenderer()) {
    this.#port = port;
    this.#renderer = renderer;
  }

  public async handle(message: MainToWorkerMessage): Promise<void> {
    switch (message.type) {
      case 'cancel':
        this.#activeRenders.get(message.requestId)?.abort();
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

  async #render(message: Extract<MainToWorkerMessage, { type: 'render' }>): Promise<void> {
    for (const active of this.#activeRenders.values()) {
      active.abort();
    }
    this.#activeRenders.clear();

    const controller = new AbortController();
    this.#activeRenders.set(message.requestId, controller);

    try {
      await this.#renderer.render(message, controller.signal, (frame) => {
        if (
          controller.signal.aborted ||
          this.#activeRenders.get(message.requestId) !== controller
        ) {
          return;
        }
        const response: WorkerToMainMessage = {
          type: 'frame',
          requestId: message.requestId,
          stage: frame.stage,
          width: frame.size.width,
          height: frame.size.height,
          rgba: frame.rgba,
          progress: frame.progress,
        };
        this.#port.postMessage(response, [frame.rgba.buffer]);
      });
      if (controller.signal.aborted) {
        this.#port.postMessage({ type: 'cancelled', requestId: message.requestId });
      }
    } catch (error: unknown) {
      if (error instanceof RenderCancelledError || controller.signal.aborted) {
        this.#port.postMessage({ type: 'cancelled', requestId: message.requestId });
      } else {
        this.#port.postMessage(errorMessage(message.requestId, error));
      }
    } finally {
      if (this.#activeRenders.get(message.requestId) === controller) {
        this.#activeRenders.delete(message.requestId);
      }
    }
  }
}
