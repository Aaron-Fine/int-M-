import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogCoreReply } from '../../../../src/catalog/core-protocol';
import { CATALOG_CORE_TIMEOUT_MS, loadCatalogCore } from '../../../../src/ui/catalog-core-client';
import { CORE_MANIFEST_DATA as manifest, coreBytes as bytes } from './core-bytes';

class FakeWorker {
  public terminated = 0;
  public readonly posted: unknown[] = [];
  readonly #listeners = new Map<string, ((event: never) => void)[]>();

  public postMessage(message: unknown): void {
    this.posted.push(message);
  }

  public terminate(): void {
    this.terminated += 1;
  }

  public addEventListener(type: string, listener: (event: never) => void): void {
    this.#listeners.set(type, [...(this.#listeners.get(type) ?? []), listener]);
  }

  public emit(type: string, event: object = {}): void {
    for (const listener of this.#listeners.get(type) ?? []) listener(event as never);
  }

  public reply(reply: CatalogCoreReply): void {
    this.emit('message', { data: reply });
  }
}

const start = (): { worker: FakeWorker; result: Promise<unknown> } => {
  const worker = new FakeWorker();
  const result = loadCatalogCore({ url: '/core.bin', manifest }, () => worker as unknown as Worker);
  // Attach the handler at once, so a rejection is never briefly unhandled.
  const settled = result.then(
    (value) => value,
    (error: unknown) => error,
  );
  return { worker, result: settled };
};

describe('catalog core client (ADR 0014)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends the request, decodes the verified bytes and terminates the worker', async () => {
    const { worker, result } = start();
    expect(worker.posted).toEqual([{ url: '/core.bin', manifest }]);
    worker.reply({ type: 'catalog-core', bytes: bytes() });
    expect(await result).toHaveLength(4016);
    expect(worker.terminated).toBe(1);
    vi.advanceTimersByTime(CATALOG_CORE_TIMEOUT_MS * 2);
    expect(worker.terminated).toBe(1);
  });

  it('rejects with the worker reason and terminates it', async () => {
    const { worker, result } = start();
    worker.reply({ type: 'catalog-core-error', message: 'HTTP 404' });
    expect(await result).toEqual(new Error('HTTP 404'));
    expect(worker.terminated).toBe(1);
  });

  it('rejects bytes that do not decode and terminates the worker', async () => {
    const { worker, result } = start();
    const damaged = new Uint8Array(bytes());
    damaged[0] = 0;
    worker.reply({ type: 'catalog-core', bytes: damaged.buffer });
    expect(((await result) as Error).message).toContain('header');
    expect(worker.terminated).toBe(1);
  });

  it('rejects on an error event and terminates the worker', async () => {
    const { worker, result } = start();
    worker.emit('error', { message: 'boom' });
    expect(await result).toEqual(new Error('boom'));
    expect(worker.terminated).toBe(1);
  });

  it('rejects on a messageerror event and terminates the worker', async () => {
    const { worker, result } = start();
    worker.emit('messageerror');
    expect(((await result) as Error).message).toContain('could not be read');
    expect(worker.terminated).toBe(1);
  });

  it('gives up when the worker never replies, and terminates it', async () => {
    const { worker, result } = start();
    vi.advanceTimersByTime(CATALOG_CORE_TIMEOUT_MS - 1);
    expect(worker.terminated).toBe(0);
    vi.advanceTimersByTime(1);
    expect(((await result) as Error).message).toContain('30 s');
    expect(worker.terminated).toBe(1);
  });
});
