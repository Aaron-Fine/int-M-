import { describe, expect, it, vi } from 'vitest';

import type { OrbitResult } from '../../../src/domain';
import type { FrameConsumer, RasterRenderRequest, Renderer } from '../../../src/render';
import {
  RenderWorkerRuntime,
  type WorkerMessagePort,
  type WorkerToMainMessage,
} from '../../../src/worker';

class InspectOnlyRenderer implements Renderer {
  public render(): Promise<void> {
    return Promise.reject(new Error('not used'));
  }

  public inspect(): OrbitResult {
    return {
      status: 'unresolved',
      iterations: 12,
      evidence: ['iteration-limit'],
    };
  }
}

describe('RenderWorkerRuntime', () => {
  it('returns structured inspection evidence', async () => {
    const messages: WorkerToMainMessage[] = [];
    const port: WorkerMessagePort = {
      postMessage: (message) => messages.push(message),
    };
    const runtime = new RenderWorkerRuntime(port, new InspectOnlyRenderer());

    await runtime.handle({
      type: 'inspect',
      requestId: 1,
      point: { re: 0.25, im: 0 },
      quality: { maxIterations: 12 },
    });

    expect(messages).toEqual([
      {
        type: 'inspection',
        requestId: 1,
        result: {
          point: { re: 0.25, im: 0 },
          orbit: {
            status: 'unresolved',
            iterations: 12,
            evidence: ['iteration-limit'],
          },
        },
      },
    ]);
  });

  it('transfers frame buffers without exposing orbit math to the UI', async () => {
    const postMessage = vi.fn();
    const renderer: Renderer = {
      inspect: () => ({
        status: 'unresolved',
        iterations: 1,
        evidence: ['iteration-limit'],
      }),
      render: async (request, _signal, onFrame) => {
        await onFrame({
          stage: 'stable',
          size: request.size,
          rgba: new Uint8ClampedArray(request.size.width * request.size.height * 4),
          progress: 1,
        });
      },
    };
    const runtime = new RenderWorkerRuntime({ postMessage }, renderer);

    await runtime.handle({
      type: 'render',
      requestId: 2,
      viewport: { center: { re: 0, im: 0 }, spanY: 3 },
      size: { width: 2, height: 2 },
      semanticView: 'period',
    });

    expect(postMessage).toHaveBeenCalledOnce();
    const [message, transfer] = postMessage.mock.calls[0] as [WorkerToMainMessage, ArrayBuffer[]];
    expect(message).toMatchObject({
      type: 'frame',
      requestId: 2,
      stage: 'stable',
      width: 2,
      height: 2,
      progress: 1,
    });
    expect(transfer).toHaveLength(1);
  });

  it('aborts every older render and suppresses its stale frames', async () => {
    interface PendingRender {
      readonly request: RasterRenderRequest;
      readonly signal: AbortSignal;
      readonly onFrame: FrameConsumer;
      readonly resolve: () => void;
    }
    const pending: PendingRender[] = [];
    const renderer: Renderer = {
      inspect: () => ({
        status: 'unresolved',
        iterations: 1,
        evidence: ['iteration-limit'],
      }),
      render: (request, signal, onFrame) =>
        new Promise<void>((resolve) => {
          pending.push({ request, signal, onFrame, resolve });
        }),
    };
    const messages: WorkerToMainMessage[] = [];
    const runtime = new RenderWorkerRuntime(
      { postMessage: (message) => messages.push(message) },
      renderer,
    );
    const common = {
      viewport: { center: { re: 0, im: 0 }, spanY: 3 },
      size: { width: 1, height: 1 },
      semanticView: 'period' as const,
    };

    const first = runtime.handle({ type: 'render', requestId: 'old', ...common });
    const second = runtime.handle({ type: 'render', requestId: 'new', ...common });
    expect(pending[0]?.signal.aborted).toBe(true);
    expect(pending[1]?.signal.aborted).toBe(false);

    await pending[0]?.onFrame({
      stage: 'stable',
      size: common.size,
      rgba: new Uint8ClampedArray(4),
      progress: 1,
    });
    pending[0]?.resolve();
    await first;

    await pending[1]?.onFrame({
      stage: 'stable',
      size: common.size,
      rgba: new Uint8ClampedArray(4),
      progress: 1,
    });
    pending[1]?.resolve();
    await second;

    expect(messages).toContainEqual({ type: 'cancelled', requestId: 'old' });
    expect(messages).not.toContainEqual(
      expect.objectContaining({ type: 'frame', requestId: 'old' }),
    );
    expect(messages).toContainEqual(expect.objectContaining({ type: 'frame', requestId: 'new' }));
  });
});
