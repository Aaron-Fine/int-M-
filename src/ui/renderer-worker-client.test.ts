import { describe, expect, it, vi } from 'vitest';
import type { MainToWorkerMessage, WorkerToMainMessage } from '../worker/protocol';
import { RendererWorkerClient, type RendererWorker } from './renderer-worker-client';

class FakeWorker implements RendererWorker {
  public readonly posted: MainToWorkerMessage[] = [];
  public terminated = false;
  readonly #messageListeners = new Set<(event: MessageEvent<WorkerToMainMessage>) => void>();
  readonly #errorListeners = new Set<(event: Event) => void>();
  readonly #messageErrorListeners = new Set<(event: Event) => void>();

  public postMessage(message: MainToWorkerMessage): void {
    this.posted.push(message);
  }

  public addEventListener(
    type: 'message' | 'error' | 'messageerror',
    listener: ((event: MessageEvent<WorkerToMainMessage>) => void) | ((event: Event) => void),
  ): void {
    if (type === 'message') {
      this.#messageListeners.add(listener);
    } else if (type === 'error') {
      this.#errorListeners.add(listener as (event: Event) => void);
    } else {
      this.#messageErrorListeners.add(listener as (event: Event) => void);
    }
  }

  public removeEventListener(
    type: 'message' | 'error' | 'messageerror',
    listener: ((event: MessageEvent<WorkerToMainMessage>) => void) | ((event: Event) => void),
  ): void {
    if (type === 'message') {
      this.#messageListeners.delete(listener);
    } else if (type === 'error') {
      this.#errorListeners.delete(listener as (event: Event) => void);
    } else {
      this.#messageErrorListeners.delete(listener as (event: Event) => void);
    }
  }

  public terminate(): void {
    this.terminated = true;
  }

  public emit(message: WorkerToMainMessage): void {
    const event = { data: message } as MessageEvent<WorkerToMainMessage>;
    for (const listener of this.#messageListeners) listener(event);
  }

  public fail(type: 'error' | 'messageerror'): void {
    const event = new Event(type, { cancelable: true });
    const listeners = type === 'error' ? this.#errorListeners : this.#messageErrorListeners;
    for (const listener of listeners) listener(event);
  }
}

const renderRequest = (requestId: number): MainToWorkerMessage => ({
  type: 'render',
  requestId,
  viewport: { center: { re: -0.75, im: 0 }, spanY: 2.5 },
  size: { width: 32, height: 20 },
  semanticView: 'stability',
});

const frame = (requestId: number): WorkerToMainMessage => ({
  type: 'frame',
  requestId,
  stage: 'coarse',
  width: 1,
  height: 1,
  rgba: new Uint8ClampedArray([0, 0, 0, 255]),
  progress: 0.5,
});

describe('RendererWorkerClient', () => {
  it('recreates a crashed worker once and resumes the current render', () => {
    const workers: FakeWorker[] = [];
    const onMessage = vi.fn();
    const onRecovering = vi.fn();
    const client = new RendererWorkerClient(
      () => {
        const worker = new FakeWorker();
        workers.push(worker);
        return worker;
      },
      { onMessage, onRecovering, onPersistentFailure: vi.fn() },
    );

    client.post(renderRequest(7));
    workers[0]?.fail('error');

    expect(workers).toHaveLength(2);
    expect(workers[0]?.terminated).toBe(true);
    expect(workers[1]?.posted).toEqual([renderRequest(7)]);
    expect(onRecovering).toHaveBeenCalledWith('error');

    workers[1]?.emit(frame(7));
    expect(onMessage).toHaveBeenCalledWith(frame(7));
  });

  it('bounds consecutive recovery and resumes the newest intent after manual retry', () => {
    const workers: FakeWorker[] = [];
    const onPersistentFailure = vi.fn();
    const client = new RendererWorkerClient(
      () => {
        const worker = new FakeWorker();
        workers.push(worker);
        return worker;
      },
      { onMessage: vi.fn(), onRecovering: vi.fn(), onPersistentFailure },
    );

    client.post(renderRequest(1));
    workers[0]?.fail('error');
    workers[1]?.fail('messageerror');
    client.post(renderRequest(2));

    expect(workers).toHaveLength(2);
    expect(onPersistentFailure).toHaveBeenCalledOnce();

    client.retry();
    expect(workers).toHaveLength(3);
    expect(workers[2]?.posted).toEqual([renderRequest(2)]);
  });

  it('recovers from a reported render rejection and accepts successful replacement work', () => {
    const workers: FakeWorker[] = [];
    const onMessage = vi.fn();
    const client = new RendererWorkerClient(
      () => {
        const worker = new FakeWorker();
        workers.push(worker);
        return worker;
      },
      { onMessage, onRecovering: vi.fn(), onPersistentFailure: vi.fn() },
    );

    client.post(renderRequest(3));
    workers[0]?.emit({ type: 'error', requestId: 3, message: 'injected rejection' });
    expect(workers[1]?.posted).toEqual([renderRequest(3)]);

    workers[1]?.emit(frame(3));
    expect(onMessage).toHaveBeenLastCalledWith(frame(3));
  });
});
