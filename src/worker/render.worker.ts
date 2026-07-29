import { RenderWorkerRuntime, type WorkerMessagePort } from './runtime';
import type { MainToWorkerMessage, WorkerToMainMessage } from './protocol';

interface RenderWorkerScope {
  postMessage(message: WorkerToMainMessage, transfer: Transferable[]): void;
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<MainToWorkerMessage>) => void,
  ): void;
}

const workerScope = globalThis as unknown as RenderWorkerScope;

const port: WorkerMessagePort = {
  postMessage(message: WorkerToMainMessage, transfer: readonly ArrayBuffer[] = []): void {
    workerScope.postMessage(message, [...transfer]);
  },
};

const runtime = new RenderWorkerRuntime(port);

workerScope.addEventListener('message', (event: MessageEvent<MainToWorkerMessage>) => {
  void runtime.handle(event.data);
});
