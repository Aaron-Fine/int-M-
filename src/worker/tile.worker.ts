import { createTileHandler } from './tile-handler';
import type { SupervisorToTileMessage, TileToSupervisorMessage } from './tile-protocol';

interface TileWorkerScope {
  postMessage(message: TileToSupervisorMessage, transfer: Transferable[]): void;
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<SupervisorToTileMessage>) => void,
  ): void;
}

const workerScope = globalThis as unknown as TileWorkerScope;

const handle = createTileHandler({
  postMessage(message, transfer = []): void {
    workerScope.postMessage(message, [...transfer]);
  },
});

workerScope.addEventListener('message', (event: MessageEvent<SupervisorToTileMessage>) => {
  void handle(event.data);
});
