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
import { packStatusPeriod } from '../../../src/render/packed-semantic';
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
    bands: [
      {
        y0: 0,
        y1: size.height,
        packedStatusPeriod: new Uint32Array(pixelCount).fill(packStatusPeriod(2, 4)),
        smoothIterationOrMultiplierMagnitude: new Float64Array(pixelCount).fill(0.5),
        multiplierAngle: new Float64Array(pixelCount).fill(Math.PI),
      },
    ],
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
  it('posts a portrait after the inspection only when one is requested', async () => {
    const messages: WorkerToMainMessage[] = [];
    const transfers: (readonly ArrayBuffer[] | undefined)[] = [];
    const port: WorkerMessagePort = {
      postMessage: (message, transfer) => {
        messages.push(message);
        transfers.push(transfer);
      },
    };
    const runtime = new RenderWorkerRuntime(port, new InspectOnlyRenderer());

    await runtime.handle({ type: 'inspect', requestId: 1, point: { re: 0.25, im: 0 } });
    expect(messages.map((message) => message.type)).toEqual(['inspection']);

    await runtime.handle({
      type: 'inspect',
      requestId: 2,
      point: { re: 0.25, im: 0 },
      portrait: true,
    });
    expect(messages.map((message) => message.type)).toEqual([
      'inspection',
      'inspection',
      'portrait',
    ]);
    const portrait = messages[2];
    if (portrait?.type !== 'portrait') throw new Error('expected a portrait');
    expect(portrait.requestId).toBe(2);
    expect(portrait.point).toEqual({ re: 0.25, im: 0 });
    // The raster and both point lists are transferred, not copied.
    expect(transfers[2]).toHaveLength(3);
    expect(portrait.portrait.rgba.length).toBe(4 * portrait.portrait.size ** 2);
  });

  it('locates a lens child in the worker, or says why not', async () => {
    const messages: WorkerToMainMessage[] = [];
    const port: WorkerMessagePort = { postMessage: (message) => messages.push(message) };
    const runtime = new RenderWorkerRuntime(port, new InspectOnlyRenderer());

    await runtime.handle({
      type: 'locate-child',
      requestId: 4,
      point: { re: 0.1, im: 0.1 },
      period: 1,
      rotation: { numerator: 1, denominator: 3 },
    });
    await runtime.handle({
      type: 'locate-child',
      requestId: 5,
      point: { re: 0.5, im: 0.5 },
      period: 1,
      rotation: { numerator: 1, denominator: 3 },
    });

    const [rabbit, refused] = messages;
    if (rabbit?.type !== 'child-component' || !rabbit.location.found) {
      throw new Error('expected the 1/3 child');
    }
    expect(rabbit.requestId).toBe(4);
    expect(rabbit.rotation).toEqual({ numerator: 1, denominator: 3 });
    expect(rabbit.location.child.period).toBe(3);
    expect(rabbit.location.child.center.re).toBeCloseTo(-0.1225611668766536, 14);
    expect(rabbit.location.child.center.im).toBeCloseTo(0.7448617666197442, 14);
    expect(refused).toEqual({
      type: 'child-component',
      requestId: 5,
      rotation: { numerator: 1, denominator: 3 },
      location: { found: false, reason: 'no attracting cycle of period 1 was found here' },
    });
  });

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
    expect(recolor.mock.calls.at(-1)?.[1]).toBe('multiplier');
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

describe('RenderWorkerRuntime delivery provenance and cancellation lifecycle', () => {
  type FrameOut = Extract<WorkerToMainMessage, { type: 'frame' }>;
  const framesOf = (messages: readonly WorkerToMainMessage[]): FrameOut[] =>
    messages.filter((message): message is FrameOut => message.type === 'frame');
  const inspect = (): OrbitResult => ({
    status: 'unresolved',
    iterations: 1,
    evidence: ['iteration-limit'],
  });
  const dynamics = {
    viewport: { center: { re: 0, im: 0 }, spanY: 3 },
    size: { width: 2, height: 2 },
  };

  it('freshFrames_shareOneComputeIdAndCarryWorkerWallAndClassifyTiming', async () => {
    const messages: WorkerToMainMessage[] = [];
    const renderer: Renderer = {
      inspect,
      render: async (request, _signal, onFrame) => {
        await onFrame({
          ...semanticFrame(request.size, 'coarse'),
          timing: { classifyMs: 3, yieldWaitMs: 0, yieldCount: 0 },
        });
        await onFrame({
          ...semanticFrame(request.size),
          timing: { classifyMs: 9, yieldWaitMs: 1, yieldCount: 2 },
        });
      },
      colorize,
    };
    const runtime = new RenderWorkerRuntime({ postMessage: (m) => messages.push(m) }, renderer);

    await runtime.handle({ type: 'render', requestId: 1, semanticView: 'period', ...dynamics });
    await runtime.handle({
      type: 'render',
      requestId: 2,
      semanticView: 'period',
      ...dynamics,
      viewport: { ...dynamics.viewport, spanY: 2 },
    });

    const frames = framesOf(messages);
    expect(frames.map((frame) => frame.provenance.source)).toEqual([
      'computed',
      'computed',
      'computed',
      'computed',
    ]);
    const ids = frames.map((frame) =>
      frame.provenance.source === 'computed' ? frame.provenance.computeId : undefined,
    );
    expect(ids[0]).toEqual(ids[1]);
    expect(ids[2]).toEqual(ids[3]);
    expect(ids[2]).toBeGreaterThan(ids[0] ?? Number.POSITIVE_INFINITY);
    for (const frame of frames) {
      expect(frame.provenance).toHaveProperty('workerWallMs');
      expect(frame.provenance).not.toHaveProperty('originComputeId');
      expect(frame.workerTiming?.classifyMs).toBeDefined();
    }
  });

  it('cacheHits_areSemanticCacheInTheSameViewAndRecolorInAnotherWithoutComputeTiming', async () => {
    const messages: WorkerToMainMessage[] = [];
    const renderer: Renderer = {
      inspect,
      render: async (request, _signal, onFrame) => {
        await onFrame({
          ...semanticFrame(request.size),
          timing: { classifyMs: 9, yieldWaitMs: 1, yieldCount: 2 },
        });
      },
      colorize,
    };
    const runtime = new RenderWorkerRuntime({ postMessage: (m) => messages.push(m) }, renderer);

    await runtime.handle({ type: 'render', requestId: 1, semanticView: 'period', ...dynamics });
    await runtime.handle({ type: 'render', requestId: 2, semanticView: 'period', ...dynamics });
    await runtime.handle({ type: 'render', requestId: 3, semanticView: 'multiplier', ...dynamics });
    await runtime.handle({ type: 'render', requestId: 4, semanticView: 'multiplier', ...dynamics });

    const frames = framesOf(messages);
    const computed = frames[0]?.provenance;
    expect(computed?.source).toEqual('computed');
    const computeId = computed?.source === 'computed' ? computed.computeId : -1;
    expect(frames.slice(1).map((frame) => frame.provenance)).toEqual([
      { source: 'semantic-cache', originComputeId: computeId },
      { source: 'recolor', originComputeId: computeId },
      { source: 'semantic-cache', originComputeId: computeId },
    ]);
    for (const frame of frames.slice(1)) {
      // Colorization ran; classification did not, and is absent, not zero.
      expect(frame.workerTiming?.colorizeMs).toBeGreaterThanOrEqual(0);
      expect(frame.workerTiming).not.toHaveProperty('classifyMs');
      expect(frame.workerTiming).not.toHaveProperty('yieldWaitMs');
    }
  });

  it('inflightReplay_reusesTheActiveComputationAndLaterFramesKeepItsComputeId', async () => {
    let onFrame: SemanticFrameConsumer | undefined;
    let finish: () => void = () => undefined;
    const renderer: Renderer = {
      inspect,
      render: async (request, _signal, consumer) => {
        await consumer(semanticFrame(request.size, 'coarse'));
        onFrame = consumer;
        await new Promise<void>((resolve) => {
          finish = resolve;
        });
      },
      colorize,
    };
    const messages: WorkerToMainMessage[] = [];
    const runtime = new RenderWorkerRuntime({ postMessage: (m) => messages.push(m) }, renderer);

    const first = runtime.handle({
      type: 'render',
      requestId: 'a',
      semanticView: 'period',
      ...dynamics,
    });
    await runtime.handle({ type: 'render', requestId: 'b', semanticView: 'period', ...dynamics });
    await onFrame?.(semanticFrame(dynamics.size));
    finish();
    await first;

    const frames = framesOf(messages);
    const original = frames[0]?.provenance;
    const computeId = original?.source === 'computed' ? original.computeId : -1;
    expect(frames.map((frame) => [frame.requestId, frame.stage, frame.provenance])).toEqual([
      ['a', 'coarse', expect.objectContaining({ source: 'computed', computeId })],
      ['b', 'coarse', { source: 'inflight-replay', originComputeId: computeId }],
      ['b', 'stable', expect.objectContaining({ source: 'computed', computeId })],
    ]);
  });

  it('explicitCancel_postsAckImmediatelyAndQuiescenceOnlyAfterTheRendererQuiesces', async () => {
    const pending = createPendingPool();
    let releaseChildren: () => void = () => undefined;
    const quiesce = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseChildren = resolve;
        }),
    );
    const messages: WorkerToMainMessage[] = [];
    const runtime = new RenderWorkerRuntime(
      { postMessage: (m) => messages.push(m) },
      new CpuRenderer({ ...pending.pool, quiesce }),
    );

    const renderHandle = runtime.handle({
      type: 'render',
      requestId: 'slow',
      viewport: { center: { re: 0, im: 0 }, spanY: 3 },
      size: { width: 4, height: 2 },
      quality: STABLE_QUALITY,
      semanticView: 'period',
    });
    await waitFor(pending.started, 'classifyStable');
    await runtime.handle({ type: 'cancel', requestId: 'slow' });

    expect(messages).toContainEqual({ type: 'cancel-ack', requestId: 'slow' });
    await vi.waitFor(() => {
      expect(quiesce).toHaveBeenCalledOnce();
    });
    expect(messages).not.toContainEqual({ type: 'cancelled', requestId: 'slow' });

    releaseChildren();
    await renderHandle;
    const lifecycle = messages
      .filter((message) => message.type === 'cancel-ack' || message.type === 'cancelled')
      .map((message) => message.type);
    expect(lifecycle).toEqual(['cancel-ack', 'cancelled']);
  });

  it('cancelForWorkNotRunning_acknowledgesAndReportsQuiescenceAtOnce', async () => {
    const messages: WorkerToMainMessage[] = [];
    const runtime = new RenderWorkerRuntime(
      { postMessage: (m) => messages.push(m) },
      { inspect, render: () => Promise.resolve(), colorize },
    );

    await runtime.handle({ type: 'cancel', requestId: 'finished' });

    expect(messages).toEqual([
      { type: 'cancel-ack', requestId: 'finished' },
      { type: 'cancelled', requestId: 'finished' },
    ]);
  });
});

describe('RenderWorkerRuntime period key delivery', () => {
  type FrameOut = Extract<WorkerToMainMessage, { type: 'frame' }>;
  const framesOf = (messages: readonly WorkerToMainMessage[]): FrameOut[] =>
    messages.filter((message): message is FrameOut => message.type === 'frame');
  const cpu = new CpuRenderer();
  const size = { width: 2, height: 2 };
  const viewportA = { center: { re: 0, im: 0 }, spanY: 3 };
  const viewportB = { center: { re: -1, im: 0 }, spanY: 1 };

  /** Every pixel attracting with `period`. */
  const uniformFrame = (
    period: number,
    stage: SemanticFrame['stage'] = 'stable',
  ): SemanticFrame => ({
    ...semanticFrame(size, stage),
    bands: [
      {
        y0: 0,
        y1: size.height,
        packedStatusPeriod: new Uint32Array(4).fill(packStatusPeriod(2, period)),
        smoothIterationOrMultiplierMagnitude: new Float64Array(4).fill(0.5),
        multiplierAngle: new Float64Array(4),
      },
    ],
  });

  /** Viewport A classifies as period 3, viewport B as period 7. */
  const renderer = (): Renderer => ({
    inspect: () => ({ status: 'unresolved', iterations: 1, evidence: ['iteration-limit'] }),
    render: async (request, _signal, onFrame) => {
      await onFrame(uniformFrame(request.viewport.spanY === 3 ? 3 : 7));
    },
    colorize: (frame, view) => cpu.colorize(frame, view),
  });

  const periodsOf = (frame: FrameOut | undefined): readonly number[] | undefined =>
    frame?.periodKey?.emphasized.map((entry) => entry.period);

  it('sends the key of the delivered frame on computed, cache and recolor deliveries', async () => {
    const messages: WorkerToMainMessage[] = [];
    const runtime = new RenderWorkerRuntime({ postMessage: (m) => messages.push(m) }, renderer());

    await runtime.handle({
      type: 'render',
      requestId: 1,
      semanticView: 'stability',
      viewport: viewportA,
      size,
    });
    await runtime.handle({
      type: 'render',
      requestId: 2,
      semanticView: 'period',
      viewport: viewportA,
      size,
    });
    await runtime.handle({
      type: 'render',
      requestId: 3,
      semanticView: 'period',
      viewport: viewportA,
      size,
    });

    const frames = framesOf(messages);
    expect(frames.map((frame) => frame.provenance.source)).toEqual([
      'computed',
      'recolor',
      'semantic-cache',
    ]);
    expect(frames[0]).not.toHaveProperty('periodKey');
    expect(periodsOf(frames[1])).toEqual([3]);
    expect(frames[2]?.periodKey).toEqual(frames[1]?.periodKey);
  });

  it('ranks the new frame, not the previous view, when a recolor follows a pan', async () => {
    const messages: WorkerToMainMessage[] = [];
    const runtime = new RenderWorkerRuntime({ postMessage: (m) => messages.push(m) }, renderer());

    await runtime.handle({
      type: 'render',
      requestId: 1,
      semanticView: 'period',
      viewport: viewportA,
      size,
    });
    await runtime.handle({
      type: 'render',
      requestId: 2,
      semanticView: 'stability',
      viewport: viewportB,
      size,
    });
    await runtime.handle({
      type: 'render',
      requestId: 3,
      semanticView: 'period',
      viewport: viewportB,
      size,
    });

    const frames = framesOf(messages);
    expect(frames.map((frame) => frame.provenance.source)).toEqual([
      'computed',
      'computed',
      'recolor',
    ]);
    expect(periodsOf(frames[0])).toEqual([3]);
    expect(periodsOf(frames[2])).toEqual([7]);
  });

  it('replays the retained coarse frame with that frame’s own key', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const messages: WorkerToMainMessage[] = [];
    const runtime = new RenderWorkerRuntime(
      { postMessage: (m) => messages.push(m) },
      {
        ...renderer(),
        render: async (_request, _signal, onFrame) => {
          await onFrame(uniformFrame(2, 'coarse'));
          await gate;
          await onFrame(uniformFrame(5));
        },
      },
    );

    const first = runtime.handle({
      type: 'render',
      requestId: 'a',
      semanticView: 'stability',
      viewport: viewportA,
      size,
    });
    await Promise.resolve();
    await runtime.handle({
      type: 'render',
      requestId: 'b',
      semanticView: 'period',
      viewport: viewportA,
      size,
    });
    release();
    await first;

    const frames = framesOf(messages);
    expect(frames.map((frame) => [frame.provenance.source, frame.stage])).toEqual([
      ['computed', 'coarse'],
      ['inflight-replay', 'coarse'],
      ['computed', 'stable'],
    ]);
    expect(periodsOf(frames[1])).toEqual([2]);
    expect(periodsOf(frames[2])).toEqual([5]);
  });
});

describe('RenderWorkerRuntime period isolation', () => {
  type FrameOut = Extract<WorkerToMainMessage, { type: 'frame' }>;
  const framesOf = (messages: readonly WorkerToMainMessage[]): FrameOut[] =>
    messages.filter((message): message is FrameOut => message.type === 'frame');
  const cpu = new CpuRenderer();
  const size = { width: 2, height: 2 };
  const viewport = { center: { re: 0, im: 0 }, spanY: 3 };

  /** Top row period 3, bottom row period 7. */
  const twoPeriodFrame = (stage: SemanticFrame['stage'] = 'stable'): SemanticFrame => ({
    ...semanticFrame(size, stage),
    bands: [
      {
        y0: 0,
        y1: size.height,
        packedStatusPeriod: Uint32Array.of(
          packStatusPeriod(2, 3),
          packStatusPeriod(2, 3),
          packStatusPeriod(2, 7),
          packStatusPeriod(2, 7),
        ),
        smoothIterationOrMultiplierMagnitude: new Float64Array(4).fill(0.5),
        multiplierAngle: new Float64Array(4),
      },
    ],
  });

  const period = (isolatedPeriod?: number) =>
    ({
      type: 'render',
      semanticView: 'period',
      viewport,
      size,
      ...(isolatedPeriod === undefined ? {} : { isolatedPeriod }),
    }) as const;

  it('recolors the cached frame for each isolation change without reclassifying', async () => {
    const messages: WorkerToMainMessage[] = [];
    const render = vi.fn(
      async (
        _request: DynamicsRenderRequest,
        _signal: AbortSignal,
        onFrame: SemanticFrameConsumer,
      ) => {
        await onFrame(twoPeriodFrame());
      },
    );
    const colorize = vi.fn((frame: SemanticFrame, view: SemanticView, isolated?: number) =>
      cpu.colorize(frame, view, isolated),
    );
    const runtime = new RenderWorkerRuntime(
      { postMessage: (m) => messages.push(m) },
      {
        inspect: () => ({ status: 'unresolved', iterations: 1, evidence: ['iteration-limit'] }),
        render,
        colorize,
      },
    );

    await runtime.handle({ ...period(), requestId: 1 });
    await runtime.handle({ ...period(7), requestId: 2 });
    await runtime.handle({ ...period(7), requestId: 3 });
    await runtime.handle({ ...period(), requestId: 4 });

    expect(render).toHaveBeenCalledOnce();
    expect(colorize.mock.calls.map((call) => call[2])).toEqual([undefined, 7, 7, undefined]);
    const frames = framesOf(messages);
    expect(frames.map((frame) => frame.provenance.source)).toEqual([
      'computed',
      'recolor',
      'semantic-cache',
      'recolor',
    ]);
    expect(frames.map((frame) => frame.isolatedPeriod)).toEqual([undefined, 7, 7, undefined]);
    // The period key and the semantic cache key ignore isolation.
    for (const frame of frames) expect(frame.periodKey).toEqual(frames[0]?.periodKey);
    // Period 3 (top row) is dimmed only while period 7 is isolated.
    expect(frames[1]?.rgba[0]).toBeLessThan(frames[0]?.rgba[0] ?? 0);
    expect([...(frames[1]?.rgba.slice(8, 12) ?? [])]).toEqual([
      ...(frames[0]?.rgba.slice(8, 12) ?? []),
    ]);
    expect(frames[3]?.rgba).toEqual(frames[0]?.rgba);
  });

  it('keeps the semantic-cache provenance for an isolation that cannot change the raster', async () => {
    const messages: WorkerToMainMessage[] = [];
    const colorize = vi.fn((frame: SemanticFrame, view: SemanticView, isolated?: number) =>
      cpu.colorize(frame, view, isolated),
    );
    const runtime = new RenderWorkerRuntime(
      { postMessage: (m) => messages.push(m) },
      {
        inspect: () => ({ status: 'unresolved', iterations: 1, evidence: ['iteration-limit'] }),
        render: async (_request, _signal, onFrame) => {
          await onFrame(twoPeriodFrame());
        },
        colorize,
      },
    );

    await runtime.handle({ ...period(), requestId: 1 });
    // Out of range, fractional and zero periods isolate nothing.
    await runtime.handle({ ...period(0), requestId: 2 });
    await runtime.handle({ ...period(2.5), requestId: 3 });
    await runtime.handle({ ...period(1e9), requestId: 4 });
    // Isolation only exists in the period view.
    await runtime.handle({ ...period(), semanticView: 'multiplier', requestId: 5 });
    await runtime.handle({ ...period(7), semanticView: 'multiplier', requestId: 6 });

    const frames = framesOf(messages);
    expect(frames.map((frame) => frame.provenance.source)).toEqual([
      'computed',
      'semantic-cache',
      'semantic-cache',
      'semantic-cache',
      'recolor',
      'semantic-cache',
    ]);
    expect(frames.map((frame) => frame.isolatedPeriod)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });

  it('applies an isolation sent during a computation to its replay and later frames', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const messages: WorkerToMainMessage[] = [];
    const runtime = new RenderWorkerRuntime(
      { postMessage: (m) => messages.push(m) },
      {
        inspect: () => ({ status: 'unresolved', iterations: 1, evidence: ['iteration-limit'] }),
        render: async (_request, _signal, onFrame) => {
          await onFrame(twoPeriodFrame('coarse'));
          await gate;
          await onFrame(twoPeriodFrame());
        },
        colorize: (frame, view, isolated) => cpu.colorize(frame, view, isolated),
      },
    );

    const first = runtime.handle({ ...period(), requestId: 'a' });
    await Promise.resolve();
    await runtime.handle({ ...period(3), requestId: 'b' });
    release();
    await first;

    const frames = framesOf(messages);
    expect(frames.map((frame) => [frame.provenance.source, frame.isolatedPeriod])).toEqual([
      ['computed', undefined],
      ['inflight-replay', 3],
      ['computed', 3],
    ]);
  });
});
