import { decodeCatalogCore, parseCoreManifest } from '../catalog/core';
import type { CatalogCoreReply, CatalogCoreRequest } from '../catalog/core-protocol';
import type { CatalogComponent } from '../catalog/schema';

/**
 * How long the worker may take before the load is abandoned. The file is 133
 * KiB and arrives in well under a second on a normal connection; 30 s is
 * generous enough for a slow phone on a poor network, yet short enough that a
 * stalled fetch ends in the panel's failure wording instead of "Loading…"
 * and a pending `sel=` that never resolve.
 */
export const CATALOG_CORE_TIMEOUT_MS = 30_000;

/**
 * Starts the catalog core worker, sends it one request and resolves with the
 * decoded components, or rejects with the reason (ADR 0014). The worker
 * fetches and verifies the file and transfers the bytes; decoding them here
 * takes a few milliseconds, because addresses are computed only when read.
 * The worker is terminated on every exit path: a reply, an error, an
 * unreadable message or the timeout.
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
    const finish = (): void => {
      clearTimeout(timer);
      worker.terminate();
    };
    const fail = (message: string): void => {
      finish();
      reject(new Error(message));
    };
    const timer = setTimeout(() => {
      fail(`the catalog core did not arrive within ${CATALOG_CORE_TIMEOUT_MS / 1000} s`);
    }, CATALOG_CORE_TIMEOUT_MS);
    worker.addEventListener('message', (event: MessageEvent<CatalogCoreReply>) => {
      const reply = event.data;
      if (reply.type === 'catalog-core-error') {
        fail(reply.message);
        return;
      }
      try {
        const components = decodeCatalogCore(reply.bytes, parseCoreManifest(request.manifest));
        finish();
        resolve(components);
      } catch (error) {
        fail(error instanceof Error ? error.message : String(error));
      }
    });
    worker.addEventListener('error', (event) => {
      fail(event.message || 'the catalog core worker failed');
    });
    worker.addEventListener('messageerror', () => {
      fail('the catalog core worker sent a message that could not be read');
    });
    worker.postMessage(request);
  });
}
