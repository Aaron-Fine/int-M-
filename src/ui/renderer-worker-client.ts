import type {
  InspectMessage,
  MainToWorkerMessage,
  RenderMessage,
  WorkerToMainMessage,
} from '../worker/protocol';

export interface RendererWorker {
  postMessage(message: MainToWorkerMessage): void;
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<WorkerToMainMessage>) => void,
  ): void;
  addEventListener(type: 'error' | 'messageerror', listener: (event: Event) => void): void;
  removeEventListener(
    type: 'message',
    listener: (event: MessageEvent<WorkerToMainMessage>) => void,
  ): void;
  removeEventListener(type: 'error' | 'messageerror', listener: (event: Event) => void): void;
  terminate(): void;
}

export type RendererWorkerFactory = () => RendererWorker;

export interface RendererWorkerClientCallbacks {
  readonly onMessage: (message: WorkerToMainMessage) => void;
  readonly onRecovering: (reason: 'error' | 'messageerror' | 'render-error') => void;
  readonly onPersistentFailure: () => void;
}

interface WorkerListeners {
  readonly message: (event: MessageEvent<WorkerToMainMessage>) => void;
  readonly error: (event: Event) => void;
  readonly messageerror: (event: Event) => void;
}

/**
 * Owns the replaceable Worker lifecycle and the current user intent.
 *
 * One consecutive failure is recovered automatically. A replacement must
 * produce a valid response before another automatic recovery is permitted,
 * which prevents a broken Worker bundle or persistent numerical fault from
 * creating a restart loop.
 */
export class RendererWorkerClient {
  readonly #factory: RendererWorkerFactory;
  readonly #callbacks: RendererWorkerClientCallbacks;
  #worker: RendererWorker | undefined;
  #listeners: WorkerListeners | undefined;
  #latestRender: RenderMessage | undefined;
  #latestInspection: InspectMessage | undefined;
  #automaticRecoveryUsed = false;
  #persistentFailure = false;
  #disposed = false;

  public constructor(factory: RendererWorkerFactory, callbacks: RendererWorkerClientCallbacks) {
    this.#factory = factory;
    this.#callbacks = callbacks;
    this.#replaceWorker();
  }

  public post(message: MainToWorkerMessage): void {
    if (message.type === 'render') this.#latestRender = message;
    if (message.type === 'inspect') this.#latestInspection = message;
    if (this.#persistentFailure || this.#disposed) return;
    this.#worker?.postMessage(message);
  }

  public retry(): void {
    if (this.#disposed) return;
    this.#automaticRecoveryUsed = false;
    this.#persistentFailure = false;
    this.#replaceWorker();
    this.#resumeCurrentIntent();
  }

  /** Development-only browser-test seam. Production UI never calls this. */
  public simulateUnexpectedFailure(): void {
    this.#handleFailure('error');
  }

  public dispose(): void {
    this.#disposed = true;
    this.#detachWorker();
  }

  #replaceWorker(): void {
    this.#detachWorker();
    const worker = this.#factory();
    const listeners: WorkerListeners = {
      message: (event) => {
        if (this.#worker !== worker) return;
        this.#handleMessage(event.data);
      },
      error: (event) => {
        if (this.#worker !== worker) return;
        event.preventDefault();
        this.#handleFailure('error');
      },
      messageerror: (event) => {
        if (this.#worker !== worker) return;
        event.preventDefault();
        this.#handleFailure('messageerror');
      },
    };
    worker.addEventListener('message', listeners.message);
    worker.addEventListener('error', listeners.error);
    worker.addEventListener('messageerror', listeners.messageerror);
    this.#worker = worker;
    this.#listeners = listeners;
  }

  #detachWorker(): void {
    if (!this.#worker || !this.#listeners) return;
    this.#worker.removeEventListener('message', this.#listeners.message);
    this.#worker.removeEventListener('error', this.#listeners.error);
    this.#worker.removeEventListener('messageerror', this.#listeners.messageerror);
    this.#worker.terminate();
    this.#worker = undefined;
    this.#listeners = undefined;
  }

  #handleMessage(message: WorkerToMainMessage): void {
    if (message.type === 'error') {
      this.#handleFailure('render-error');
      return;
    }
    this.#automaticRecoveryUsed = false;
    if (message.type === 'inspection' && this.#latestInspection?.requestId === message.requestId) {
      this.#latestInspection = undefined;
    }
    this.#callbacks.onMessage(message);
  }

  #handleFailure(reason: 'error' | 'messageerror' | 'render-error'): void {
    if (this.#disposed || this.#persistentFailure) return;
    this.#detachWorker();
    if (this.#automaticRecoveryUsed) {
      this.#persistentFailure = true;
      this.#callbacks.onPersistentFailure();
      return;
    }
    this.#automaticRecoveryUsed = true;
    this.#callbacks.onRecovering(reason);
    this.#replaceWorker();
    this.#resumeCurrentIntent();
  }

  #resumeCurrentIntent(): void {
    if (!this.#worker) return;
    if (this.#latestRender) this.#worker.postMessage(this.#latestRender);
    if (this.#latestInspection) this.#worker.postMessage(this.#latestInspection);
  }
}
