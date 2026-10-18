import { decodeCatalogCore, parseCoreManifest } from '../catalog/core';
import type { CatalogCoreReply, CatalogCoreRequest } from '../catalog/core-protocol';
import type { CatalogComponent } from '../catalog/schema';

/**
 * Starts the catalog core worker, sends it one request and resolves with the
 * decoded components, or rejects with the reason (ADR 0014). The worker
 * fetches and verifies the file and transfers the bytes; decoding them here
 * takes a few milliseconds, because addresses are computed only when read.
 * The worker is terminated either way.
 */
export function loadCatalogCore(
  request: CatalogCoreRequest,
  createWorker: () => Worker = () =>
    new Worker(new URL('../worker/catalog-core.worker.ts', import.meta.url), {
      type: 'module',
      name: 'catalog-core',
    }),
): Promise<readonly CatalogComponent[]> {
  return new Promise((resolve, reject) => {
    const worker = createWorker();
    worker.addEventListener('message', (event: MessageEvent<CatalogCoreReply>) => {
      worker.terminate();
      const reply = event.data;
      if (reply.type === 'catalog-core-error') {
        reject(new Error(reply.message));
        return;
      }
      try {
        resolve(decodeCatalogCore(reply.bytes, parseCoreManifest(request.manifest)));
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
    worker.addEventListener('error', (event) => {
      worker.terminate();
      reject(new Error(event.message || 'the catalog core worker failed'));
    });
    worker.postMessage(request);
  });
}
