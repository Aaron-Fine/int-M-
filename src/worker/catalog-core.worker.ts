import { decodeCatalogCore, parseCoreManifest, sha256Hex } from '../catalog/core';
import type { CatalogCoreReply, CatalogCoreRequest } from '../catalog/core-protocol';

/**
 * Loads the period ≤12 catalog core off the main thread (ADR 0014): fetches
 * catalog/core.v1.bin, checks its length and SHA-256 against the manifest,
 * decodes it once to validate every record, and transfers the verified bytes
 * back. Transferring the 133 KiB buffer costs the main thread nothing; a
 * structured clone of 4,016 decoded objects cost it 63 ms in Chromium.
 */
interface CatalogCoreWorkerScope {
  postMessage(message: CatalogCoreReply, transfer?: Transferable[]): void;
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<CatalogCoreRequest>) => void,
  ): void;
}

const workerScope = globalThis as unknown as CatalogCoreWorkerScope;

const load = async (request: CatalogCoreRequest): Promise<CatalogCoreReply> => {
  try {
    const manifest = parseCoreManifest(request.manifest);
    const response = await fetch(request.url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength !== manifest.byteLength || (await sha256Hex(bytes)) !== manifest.sha256) {
      throw new Error('the catalog core does not match its manifest');
    }
    decodeCatalogCore(bytes, manifest);
    return { type: 'catalog-core', bytes };
  } catch (error) {
    return {
      type: 'catalog-core-error',
      message: error instanceof Error ? error.message : String(error),
    };
  }
};

workerScope.addEventListener('message', (event) => {
  void load(event.data).then((reply) => {
    workerScope.postMessage(reply, reply.type === 'catalog-core' ? [reply.bytes] : []);
  });
});
