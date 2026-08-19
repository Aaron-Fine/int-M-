import { describe, expect, it, vi } from 'vitest';

import type { OrbitResult, RasterSize, RenderQuality, SemanticView } from '../../../src/domain';
import {
  CpuRenderer,
  RenderCancelledError,
  type DynamicsRenderRequest,
  type RasterFrame,
  type Renderer,
  type SemanticFrame,
  type SemanticFrameConsumer,
} from '../../../src/render';
import {
  RenderWorkerRuntime,
  type WorkerMessagePort,
  type WorkerToMainMessage,
} from '../../../src/worker';
import type { TilePool } from '../../../src/render';

const semanticFrame = (
  size: RasterSize,
  stage: SemanticFrame['stage'] = 'stable',
): SemanticFrame => {
  const pixelCount = size.width * size.height;
  return {
    stage,
    size,
    sampleStride: stage === 'coarse' ? 4 : 1,
    status: new Uint8Array(pixelCount).fill(2),
    period: new Uint32Array(pixelCount).fill(4),
    smoothIterationOrMultiplierMagnitude: new Float64Array(pixelCount).fill(0.5),
    multiplierAngle: new Float64Array(pixelCount).fill(Math.PI),
    progress: stage === 'coarse' ? 0.2 : 1,
  };
};

const colorize = (frame: SemanticFrame, view: SemanticView): RasterFrame => ({
  stage: frame.stage,
  size: frame.size,
  rgba: new Uint8ClampedArray(frame.size.width * frame.size.height * 4).fill(
    view === 'period' ? 1 : 2,
  ),
  progress: frame.progress,
});

const STABLE_QUALITY: RenderQuality = { maxIterations: 512, maxPeriod: 32, coarseStride: 8 };

const waitFor = async (started: Promise<void>, label: string): Promise<void> => {
  await Promise.race([
    started,
    new Promise<void>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`timed out waiting for ${label}`));
      }, 1000);
    }),
  ]);
};

const createPendingPool = (): {
  readonly pool: TilePool;
  readonly classifyStable: TilePool['classifyStable'];
  readonly started: Promise<void>;
} => {
  let startedResolve: () => void = () => undefined;
  const started = new Promise<void>((resolve) => {
    startedResolve = resolve;
  });
  const classifyStable = vi.fn(
    (
      _request: DynamicsRenderRequest,
      _quality: RenderQuality,
      signal: AbortSignal,
    ): Promise<SemanticFrame> =>
      new Promise<SemanticFrame>((_resolve, reject) => {
        startedResolve();
        if (signal.aborted) {
          reject(new RenderCancelledError());
          return;
        }
        signal.addEventListener(
          'abort',
          () => {
            reject(new RenderCancelledError());
          },
          { once: true },
        );
      }),
  );
  return {
    pool: {
      size: 2,
      classifyStable,
      dispose: () => undefined,
    },
    classifyStable,
    started,
  };
};

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

  public colorize(frame: SemanticFrame, view: SemanticView): RasterFrame {
    return colorize(frame, view);
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

  it('transfers only colorized frame buffers to the UI', async () => {
    const postMessage = vi.fn();
    const renderer: Renderer = {
      inspect: () => ({
        status: 'unresolved',
        iterations: 1,
        evidence: ['iteration-limit'],
      }),
      render: async (request, _signal, onFrame) => {
        await onFrame(semanticFrame(request.size));
      },
      colorize,
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

  it('attaches worker stage timings to frame messages', async () => {
    const messages: WorkerToMainMessage[] = [];
    const renderer: Renderer = {
      inspect: () => ({
        status: 'unresolved',
        iterations: 1,
        evidence: ['iteration-limit'],
      }),
      render: async (request, _signal, onFrame) => {
        await onFrame({
          ...semanticFrame(request.size, 'coarse'),
          timing: { classifyMs: 12.5, yieldWaitMs: 3.25, yieldCount: 2 },
        });
        await onFrame({
          ...semanticFrame(request.size, 'stable'),
          timing: { classifyMs: 80, yieldWaitMs: 7.5, yieldCount: 8 },
        });
      },
      colorize,
    };
    const runtime = new RenderWorkerRuntime(
      { postMessage: (message) => messages.push(message) },
      renderer,
    );

    await runtime.handle({
      type: 'render',
      requestId: 'timed',
      viewport: { center: { re: 0, im: 0 }, spanY: 3 },
      size: { width: 2, height: 2 },
      semanticView: 'period',
    });

    const frames = messages.filter((message) => message.type === 'frame');
    expect(frames).toHaveLength(2);
    expect(frames[0]).toMatchObject({
      type: 'frame',
      requestId: 'timed',
      stage: 'coarse',
      workerTiming: {
        classifyMs: 12.5,
        yieldWaitMs: 3.25,
        yieldCount: 2,
      },
    });
    expect(frames[1]).toMatchObject({
      type: 'frame',
      requestId: 'timed',
      stage: 'stable',
      workerTiming: {
        classifyMs: 80,
        yieldWaitMs: 7.5,
        yieldCount: 8,
      },
    });
    expect(
      frames[0]?.type === 'frame' ? frames[0].workerTiming?.colorizeMs : undefined,
    ).toBeGreaterThanOrEqual(0);
    expect(
      frames[1]?.type === 'frame' ? frames[1].workerTiming?.colorizeMs : undefined,
    ).toBeGreaterThanOrEqual(0);
  });

  it('reports a render failure and remains available for later requests', async () => {
    const messages: WorkerToMainMessage[] = [];
    const renderer: Renderer = {
      inspect: () => ({
        status: 'unresolved',
        iterations: 8,
        evidence: ['iteration-limit'],
      }),
      render: () => Promise.reject(new Error('injected render failure')),
      colorize,
    };
    const runtime = new RenderWorkerRuntime(
      { postMessage: (message) => messages.push(message) },
      renderer,
    );

    await runtime.handle({
      type: 'render',
      requestId: 'failed-render',
      viewport: { center: { re: 0, im: 0 }, spanY: 3 },
      size: { width: 1, height: 1 },
      semanticView: 'stability',
    });
    await runtime.handle({
      type: 'inspect',
      requestId: 'later-inspection',
      point: { re: 0, im: 0 },
    });

    expect(messages).toContainEqual({
      type: 'error',
      requestId: 'failed-render',
      message: 'injected render failure',
    });
    expect(messages).toContainEqual(
      expect.objectContaining({
        type: 'inspection',
        requestId: 'later-inspection',
      }),
    );
  });

  it('recolors a cached semantic frame without recomputing dynamics', async () => {
    const messages: WorkerToMainMessage[] = [];
    const render = vi.fn(
      async (
        request: DynamicsRenderRequest,
        _signal: AbortSignal,
        onFrame: SemanticFrameConsumer,
      ) => {
        await onFrame(semanticFrame(request.size));
      },
    );
    const recolor = vi.fn(colorize);
    const renderer: Renderer = {
      inspect: () => ({
        status: 'unresolved',
        iterations: 1,
        evidence: ['iteration-limit'],
      }),
      render,
      colorize: recolor,
    };
    const runtime = new RenderWorkerRuntime(
      { postMessage: (message) => messages.push(message) },
      renderer,
    );
    const dynamics = {
      viewport: { center: { re: 0, im: 0 }, spanY: 3 },
      size: { width: 2, height: 2 },
    };

    await runtime.handle({
      type: 'render',
      requestId: 'period',
      semanticView: 'period',
      ...dynamics,
    });
    await runtime.handle({
      type: 'render',
      requestId: 'multiplier',
      semanticView: 'multiplier',
      ...dynamics,
    });

    expect(render).toHaveBeenCalledOnce();
    expect(recolor).toHaveBeenCalledTimes(2);
    expect(recolor.mock.calls.map((call) => call[1])).toEqual(['period', 'multiplier']);
    expect(messages).toEqual([
      expect.objectContaining({ type: 'frame', requestId: 'period' }),
      expect.objectContaining({ type: 'frame', requestId: 'multiplier' }),
    ]);
  });

  it('coalesces a view change into an in-progress dynamics render', async () => {
    interface PendingRender {
      readonly signal: AbortSignal;
      readonly onFrame: SemanticFrameConsumer;
      readonly resolve: () => void;
    }
    const pending: PendingRender[] = [];
    const recolor = vi.fn(colorize);
    const renderer: Renderer = {
      inspect: () => ({
        status: 'unresolved',
        iterations: 1,
        evidence: ['iteration-limit'],
      }),
      render: (_request, signal, onFrame) =>
        new Promise<void>((resolve) => {
          pending.push({ signal, onFrame, resolve });
        }),
      colorize: recolor,
    };
    const messages: WorkerToMainMessage[] = [];
    const runtime = new RenderWorkerRuntime(
      { postMessage: (message) => messages.push(message) },
      renderer,
    );
    const common = {
      viewport: { center: { re: 0, im: 0 }, spanY: 3 },
      size: { width: 1, height: 1 },
    };

    const first = runtime.handle({
      type: 'render',
      requestId: 'period',
      semanticView: 'period',
      ...common,
    });
    await runtime.handle({
      type: 'render',
      requestId: 'multiplier',
      semanticView: 'multiplier',
      ...common,
    });

    expect(pending).toHaveLength(1);
    expect(pending[0]?.signal.aborted).toBe(false);
    await pending[0]?.onFrame(semanticFrame(common.size));
    pending[0]?.resolve();
    await first;

    expect(recolor).toHaveBeenCalledOnce();
    expect(recolor).toHaveBeenCalledWith(expect.anything(), 'multiplier');
    expect(messages).toContainEqual(
      expect.objectContaining({ type: 'frame', requestId: 'multiplier' }),
    );
    expect(messages).not.toContainEqual(
      expect.objectContaining({ type: 'frame', requestId: 'period' }),
    );
  });

  it('aborts a render for different dynamics and suppresses its stale frames', async () => {
    interface PendingRender {
      readonly request: DynamicsRenderRequest;
      readonly signal: AbortSignal;
      readonly onFrame: SemanticFrameConsumer;
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
      colorize,
    };
    const messages: WorkerToMainMessage[] = [];
    const runtime = new RenderWorkerRuntime(
      { postMessage: (message) => messages.push(message) },
      renderer,
    );
    const size = { width: 1, height: 1 };

    const first = runtime.handle({
      type: 'render',
      requestId: 'old',
      viewport: { center: { re: 0, im: 0 }, spanY: 3 },
      size,
      semanticView: 'period',
    });
    const second = runtime.handle({
      type: 'render',
      requestId: 'new',
      viewport: { center: { re: 0.25, im: 0 }, spanY: 3 },
      size,
      semanticView: 'period',
    });
    expect(pending[0]?.signal.aborted).toBe(true);
    expect(pending[1]?.signal.aborted).toBe(false);

    await pending[0]?.onFrame(semanticFrame(size));
    pending[0]?.resolve();
    await first;

    await pending[1]?.onFrame(semanticFrame(size));
    pending[1]?.resolve();
    await second;

    expect(messages).toContainEqual({ type: 'cancelled', requestId: 'old' });
    expect(messages).not.toContainEqual(
      expect.objectContaining({ type: 'frame', requestId: 'old' }),
    );
    expect(messages).toContainEqual(expect.objectContaining({ type: 'frame', requestId: 'new' }));
  });

  it('runtime_secondRenderSameKey_doesNotCallClassifyStable', async () => {
    const classifyStable = vi.fn((request: DynamicsRenderRequest) =>
      Promise.resolve(semanticFrame(request.size, 'stable')),
    );
    const pool: TilePool = {
      size: 2,
      classifyStable,
      dispose: () => undefined,
    };
    const messages: WorkerToMainMessage[] = [];
    const runtime = new RenderWorkerRuntime(
      { postMessage: (message) => messages.push(message) },
      new CpuRenderer(pool),
    );
    const dynamics = {
      viewport: { center: { re: 0, im: 0 }, spanY: 3 },
      size: { width: 4, height: 2 },
      quality: STABLE_QUALITY,
    };

    await runtime.handle({
      type: 'render',
      requestId: 'first',
      semanticView: 'period',
      ...dynamics,
    });
    await runtime.handle({
      type: 'render',
      requestId: 'second',
      semanticView: 'multiplier',
      ...dynamics,
    });

    expect(classifyStable).toHaveBeenCalledOnce();
    expect(classifyStable).toHaveBeenCalledWith(
      expect.objectContaining({ quality: STABLE_QUALITY }),
      STABLE_QUALITY,
      expect.any(AbortSignal),
    );
    expect(messages.filter((message) => message.type === 'frame')).toEqual([
      expect.objectContaining({ type: 'frame', requestId: 'first', stage: 'coarse' }),
      expect.objectContaining({ type: 'frame', requestId: 'first', stage: 'stable' }),
      expect.objectContaining({ type: 'frame', requestId: 'second', stage: 'stable' }),
    ]);
  });

  it('runtime_inspectDuringPendingClassifyStable_stillHitsRendererInspect', async () => {
    const pending = createPendingPool();
    const renderer = new CpuRenderer(pending.pool);
    const inspect = vi.spyOn(renderer, 'inspect');
    const messages: WorkerToMainMessage[] = [];
    const runtime = new RenderWorkerRuntime(
      { postMessage: (message) => messages.push(message) },
      renderer,
    );

    const renderHandle = runtime.handle({
      type: 'render',
      requestId: 'pending-stable',
      viewport: { center: { re: 0, im: 0 }, spanY: 3 },
      size: { width: 4, height: 2 },
      quality: STABLE_QUALITY,
      semanticView: 'period',
    });
    await waitFor(pending.started, 'classifyStable');
    await runtime.handle({
      type: 'inspect',
      requestId: 'live-inspect',
      point: { re: 0.25, im: 0 },
      quality: { maxIterations: 12 },
    });

    expect(inspect).toHaveBeenCalledOnce();
    expect(messages).toContainEqual(
      expect.objectContaining({
        type: 'inspection',
        requestId: 'live-inspect',
      }),
    );
    expect(messages).not.toContainEqual(
      expect.objectContaining({ type: 'frame', stage: 'stable' }),
    );

    await runtime.handle({ type: 'cancel', requestId: 'pending-stable' });
    await renderHandle;
  });

  it('runtime_cancelDuringClassifyStable_postsCancelledNotStable', async () => {
    const pending = createPendingPool();
    const messages: WorkerToMainMessage[] = [];
    const runtime = new RenderWorkerRuntime(
      { postMessage: (message) => messages.push(message) },
      new CpuRenderer(pending.pool),
    );

    const renderHandle = runtime.handle({
      type: 'render',
      requestId: 'in-flight',
      viewport: { center: { re: 0, im: 0 }, spanY: 3 },
      size: { width: 4, height: 2 },
      quality: STABLE_QUALITY,
      semanticView: 'period',
    });
    await waitFor(pending.started, 'classifyStable');
    await runtime.handle({ type: 'cancel', requestId: 'in-flight' });
    await renderHandle;

    expect(messages).toContainEqual({ type: 'cancelled', requestId: 'in-flight' });
    expect(messages).toContainEqual(expect.objectContaining({ type: 'frame', stage: 'coarse' }));
    expect(messages).not.toContainEqual(
      expect.objectContaining({ type: 'frame', stage: 'stable' }),
    );
  });
});
