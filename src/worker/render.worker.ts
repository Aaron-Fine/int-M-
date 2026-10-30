import { CpuRenderer } from '../render';
import { createCoarseGate, isCoarseGateMessage } from './coarse-gate';
import type { MainToWorkerMessage, WorkerToMainMessage } from './protocol';
import { RenderWorkerRuntime, type WorkerMessagePort } from './runtime';
import { clampTileWorkers, createTilePool } from './tile-pool';
import type { TileWorkerHandle } from './tile-protocol';

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

const hardwareConcurrency =
  typeof navigator === 'undefined' ? undefined : navigator.hardwareConcurrency;
const createTileWorker = (): TileWorkerHandle => {
  const worker = new Worker(new URL('./tile.worker.ts', import.meta.url), {
    type: 'module',
    name: 'mandelbrot-tile',
  });
  return {
    postMessage(message, transfer) {
      if (transfer === undefined) {
        worker.postMessage(message);
        return;
      }
      worker.postMessage(message, [...transfer]);
    },
    addEventListener(type, listener) {
      worker.addEventListener(type, listener as (event: MessageEvent) => void);
    },
    removeEventListener(type, listener) {
      worker.removeEventListener(type, listener as (event: MessageEvent) => void);
    },
    terminate() {
      worker.terminate();
    },
  };
};

const pool = createTilePool({
  workerCount: clampTileWorkers(hardwareConcurrency),
  factory: createTileWorker,
});
const renderer = new CpuRenderer(pool);
// Dev and e2e builds only: browser tests hold renders after their coarse frame (coarse-gate.ts).
const gate =
  import.meta.env.DEV || import.meta.env.MODE === 'e2e' ? createCoarseGate(renderer) : undefined;
const runtime = new RenderWorkerRuntime(port, gate?.renderer ?? renderer);

workerScope.addEventListener('message', (event: MessageEvent<MainToWorkerMessage>) => {
  const data: unknown = event.data;
  if (gate !== undefined && isCoarseGateMessage(data)) {
    if (data.hold) gate.hold();
    else gate.release();
    return;
  }
  void runtime.handle(event.data);
});
