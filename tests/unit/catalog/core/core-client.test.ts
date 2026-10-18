import { describe, expect, it } from 'vitest';

import type { CatalogCoreReply, CatalogCoreRequest } from '../../../../src/catalog/core-protocol';
import { loadCatalogCore } from '../../../../src/ui/catalog-core-client';
import { CORE_MANIFEST_DATA, coreBytes } from './core-bytes';

/** A stand-in for the worker: answers the one request with `reply`. */
const fakeWorker = (reply: CatalogCoreReply) => {
  const listeners = new Map<string, (event: unknown) => void>();
  const worker = {
    requests: [] as CatalogCoreRequest[],
    terminated: false,
    addEventListener: (type: string, listener: (event: unknown) => void) => {
      listeners.set(type, listener);
    },
    postMessage: (request: CatalogCoreRequest) => {
      worker.requests.push(request);
      queueMicrotask(() => listeners.get('message')?.({ data: reply }));
    },
    terminate: () => {
      worker.terminated = true;
    },
  };
  return worker;
};

const request = { url: '/core.v1.bin', manifest: CORE_MANIFEST_DATA };

describe('catalog core client (ADR 0014)', () => {
  it('decodes the verified bytes the worker transfers and terminates it', async () => {
    const worker = fakeWorker({ type: 'catalog-core', bytes: coreBytes() });
    const components = await loadCatalogCore(request, () => worker as unknown as Worker);
    expect(components).toHaveLength(4016);
    expect(worker.requests).toEqual([request]);
    expect(worker.terminated).toBe(true);
  });

  it('rejects with the worker reason, for example a digest mismatch', async () => {
    const worker = fakeWorker({ type: 'catalog-core-error', message: 'does not match' });
    await expect(loadCatalogCore(request, () => worker as unknown as Worker)).rejects.toThrow(
      'does not match',
    );
    expect(worker.terminated).toBe(true);
  });
});
